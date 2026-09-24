using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;
using StudioApi.Publishing;

namespace StudioApi.Events;

public sealed record CreateEventRequest(Guid OperationId, EventDraft? Draft);

public sealed record UpdateEventRequest(Guid OperationId, long RowVersion, EventDraft? Draft);

public sealed record AdminRef(Guid Id, string DisplayName);

public sealed record EventDetail(
    Guid Id,
    long RowVersion,
    Guid RevisionId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    AdminRef UpdatedBy,
    PublicationSummary Publication,
    EventDraft Draft);

/// <param name="Status">枠独自の開催状況（normal／cancelled）。</param>
/// <param name="DayCancelled">所属する開催日そのものが中止か（親由来の中止。枠独自の中止とは別に持つ。07 §5）。</param>
public sealed record EventSlotSummary(DateOnly? Date, string? TimeMode, string? Start, string? End, string Status, bool DayCancelled);

/// <param name="Publication">unpublished／published／publishedWithChanges／withdrawn（07 §5）。</param>
public sealed record EventListItem(
    Guid Id,
    string? Title,
    Guid? OccurrenceId,
    int SlotCount,
    int VenueCount,
    IReadOnlyList<EventSlotSummary> Slots,
    string Publication,
    DateTimeOffset UpdatedAt,
    AdminRef UpdatedBy);

public sealed record EventConflict(string Code, string Title, EventDetail Latest);

public sealed record DraftValidationProblem(string Code, string Title, IReadOnlyList<DraftProblem> Problems);

public static class EventEndpoints
{
    public static RouteGroupBuilder MapEventEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/events").WithTags("Events");
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:guid}", GetAsync);
        group.MapPost("/", CreateAsync);
        group.MapPut("/{id:guid}", UpdateAsync);
        return group;
    }

    private static async Task<Ok<List<EventListItem>>> ListAsync(
        StudioDbContext db,
        string? q,
        Guid? occurrenceId,
        string? publication,
        string? sort)
    {
        var rows = await (
            from head in db.EventHeads
            join revision in db.EventRevisions on head.CurrentRevisionId equals revision.RevisionId
            join admin in db.Users on head.UpdatedBy equals admin.Id
            select new { head, revision.Payload, admin.DisplayName }).ToListAsync();

        var days = await db.OcDays.AsNoTracking().ToDictionaryAsync(d => d.Id, d => new { d.Date, d.Status });
        var publications = await PublicationIndex.LoadAsync(db, PublishTargetKind.Event);

        var items = rows.Select(row =>
        {
            var draft = Deserialize(row.Payload);
            return new EventListItem(
                row.head.EventId,
                draft.Title,
                draft.OccurrenceId,
                draft.Slots.Count,
                draft.Slots.SelectMany(s => s.Venues).Select(v => v.CanonicalSpotId).Distinct(StringComparer.Ordinal).Count(),
                draft.Slots
                    .Select(s =>
                    {
                        var day = s.OcDayId is { } dayId ? days.GetValueOrDefault(dayId) : null;
                        return new EventSlotSummary(day?.Date, s.TimeMode, s.Fixed?.Start, s.Fixed?.End, s.Status, day?.Status == OcDayStatus.Cancelled);
                    })
                    .OrderBy(s => s.Date is null).ThenBy(s => s.Date).ThenBy(s => s.Start, StringComparer.Ordinal)
                    .ToList(),
                PublicationState.Of(publications.Find(PublishTargetKind.Event, row.head.EventId.ToString()), row.head.CurrentRevisionId),
                row.head.UpdatedAt,
                new AdminRef(row.head.UpdatedBy, row.DisplayName));
        });

        if (!string.IsNullOrWhiteSpace(q))
        {
            var keyword = q.Trim();
            items = items.Where(i => i.Title?.Contains(keyword, StringComparison.CurrentCultureIgnoreCase) == true);
        }

        if (occurrenceId is { } occurrence)
        {
            items = items.Where(i => i.OccurrenceId == occurrence);
        }

        // 取り下げ済みは通常の一覧から除き、公開状態で「取り下げ済み」を選んだときだけ出す（07 §5、利用者判断 2026-09-24）。
        items = string.IsNullOrEmpty(publication)
            ? items.Where(i => i.Publication != PublicationState.Withdrawn)
            : items.Where(i => i.Publication == publication);

        // 並べ替えは開催日時順・更新日時順（07 EV-15）。日時が未入力のイベントは開催日時順の末尾に置く。
        items = sort == "schedule"
            ? items.OrderBy(i => FirstSchedule(i) is null).ThenBy(FirstSchedule, StringComparer.Ordinal).ThenByDescending(i => i.UpdatedAt)
            : items.OrderByDescending(i => i.UpdatedAt);

        return TypedResults.Ok(items.ToList());
    }

    /// <summary>最も早い枠の "yyyy-MM-dd HH:mm"（終日は 00:00 とみなす）。日付が無ければnull。</summary>
    private static string? FirstSchedule(EventListItem item)
        => item.Slots
            .Where(s => s.Date is not null)
            .Select(s => $"{s.Date:yyyy-MM-dd} {(s.TimeMode == "allDay" ? "00:00" : s.Start ?? "99:99")}")
            .Order(StringComparer.Ordinal)
            .FirstOrDefault();

    private static async Task<Results<Ok<EventDetail>, NotFound>> GetAsync(Guid id, StudioDbContext db)
    {
        var detail = await LoadDetailAsync(db, id);
        return detail is null ? TypedResults.NotFound() : TypedResults.Ok(detail);
    }

    private static async Task<Results<Created<EventDetail>, Ok<EventDetail>, BadRequest<DraftValidationProblem>>> CreateAsync(
        CreateEventRequest request,
        StudioDbContext db,
        ClaimsPrincipal principal,
        UserManager<StudioAdmin> userManager,
        TimeProvider timeProvider)
    {
        if (request.OperationId == Guid.Empty)
        {
            return TypedResults.BadRequest(InvalidOperationId());
        }

        // 同じ操作の再送なら、新しいイベントを作らずに最初の結果を返す。
        if (await FindReplayAsync(db, request.OperationId) is { } replay)
        {
            return TypedResults.Ok((await LoadDetailAsync(db, replay.EventId))!);
        }

        var problems = EventDraftRules.Validate(request.Draft);
        if (problems.Count > 0)
        {
            return TypedResults.BadRequest(InvalidDraft(problems));
        }

        var adminId = CurrentAdminId(principal, userManager);
        var now = timeProvider.GetUtcNow();
        var eventId = Guid.CreateVersion7();
        var revision = NewRevision(eventId, request.Draft!, adminId, now, request.OperationId, baseRevisionId: null);
        OperationLogs.AddSave(db, request.OperationId, adminId, now, PublishTargetKind.Event, eventId.ToString(), PublishCandidate.EventLabel(request.Draft!.Title), revision.RevisionId);
        db.EventHeads.Add(new EventHead
        {
            EventId = eventId,
            CurrentRevisionId = revision.RevisionId,
            CreatedAt = now,
            CreatedBy = adminId,
            UpdatedAt = now,
            UpdatedBy = adminId,
            RowVersion = 1,
        });
        db.EventRevisions.Add(revision);

        if (await TrySaveAsync(db, request.OperationId) == SaveOutcome.Replayed)
        {
            // 同じoperationIdの並行した再送が先に保存した。
            var saved = await FindReplayAsync(db, request.OperationId);
            return TypedResults.Ok((await LoadDetailAsync(db, saved!.EventId))!);
        }

        var detail = (await LoadDetailAsync(db, eventId))!;
        return TypedResults.Created($"/api/events/{eventId}", detail);
    }

    private static async Task<Results<Ok<EventDetail>, NotFound, BadRequest<DraftValidationProblem>, Conflict<EventConflict>>> UpdateAsync(
        Guid id,
        UpdateEventRequest request,
        StudioDbContext db,
        ClaimsPrincipal principal,
        UserManager<StudioAdmin> userManager,
        TimeProvider timeProvider)
    {
        if (request.OperationId == Guid.Empty)
        {
            return TypedResults.BadRequest(InvalidOperationId());
        }

        if (await FindReplayAsync(db, request.OperationId) is { } replay)
        {
            // 保存は成功していたが応答が届かなかった場合の再送。rowVersionは進んでいるが競合ではない。
            return replay.EventId == id
                ? TypedResults.Ok((await LoadDetailAsync(db, id))!)
                : TypedResults.BadRequest(InvalidOperationId());
        }

        var head = await db.EventHeads.SingleOrDefaultAsync(h => h.EventId == id);
        if (head is null)
        {
            return TypedResults.NotFound();
        }

        if (head.RowVersion != request.RowVersion)
        {
            return TypedResults.Conflict(await ConflictAsync(db, id));
        }

        var problems = EventDraftRules.Validate(request.Draft);
        if (problems.Count > 0)
        {
            return TypedResults.BadRequest(InvalidDraft(problems));
        }

        var adminId = CurrentAdminId(principal, userManager);
        var now = timeProvider.GetUtcNow();
        var revision = NewRevision(id, request.Draft!, adminId, now, request.OperationId, head.CurrentRevisionId);
        db.EventRevisions.Add(revision);
        OperationLogs.AddSave(db, request.OperationId, adminId, now, PublishTargetKind.Event, id.ToString(), PublishCandidate.EventLabel(request.Draft!.Title), revision.RevisionId);
        head.CurrentRevisionId = revision.RevisionId;
        head.UpdatedAt = now;
        head.UpdatedBy = adminId;
        head.RowVersion++;

        switch (await TrySaveAsync(db, request.OperationId))
        {
            case SaveOutcome.Replayed:
                return TypedResults.Ok((await LoadDetailAsync(db, id))!);
            case SaveOutcome.Conflict:
                // 読み込み後に別の保存が先に確定した（row_versionの条件付き更新が0件）。
                return TypedResults.Conflict(await ConflictAsync(db, id));
        }

        return TypedResults.Ok((await LoadDetailAsync(db, id))!);
    }

    private static async Task<EventDetail?> LoadDetailAsync(StudioDbContext db, Guid id)
    {
        var row = await (
            from head in db.EventHeads.AsNoTracking()
            join revision in db.EventRevisions.AsNoTracking() on head.CurrentRevisionId equals revision.RevisionId
            join admin in db.Users.AsNoTracking() on head.UpdatedBy equals admin.Id
            where head.EventId == id
            select new { head, revision.Payload, admin.DisplayName }).SingleOrDefaultAsync();
        var publications = row is null ? null : await PublicationIndex.LoadAsync(db, PublishTargetKind.Event);

        return row is null
            ? null
            : new EventDetail(
                row.head.EventId,
                row.head.RowVersion,
                row.head.CurrentRevisionId,
                row.head.CreatedAt,
                row.head.UpdatedAt,
                new AdminRef(row.head.UpdatedBy, row.DisplayName),
                publications!.Summarize(PublishTargetKind.Event, id.ToString(), row.head.CurrentRevisionId),
                Deserialize(row.Payload));
    }

    private static async Task<EventConflict> ConflictAsync(StudioDbContext db, Guid id)
        => new("conflict", "他の管理者がこのイベントを先に保存しました。", (await LoadDetailAsync(db, id))!);

    private static Task<EventRevision?> FindReplayAsync(StudioDbContext db, Guid operationId)
        => db.EventRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.OperationId == operationId);

    private static EventRevision NewRevision(Guid eventId, EventDraft draft, Guid adminId, DateTimeOffset now, Guid operationId, Guid? baseRevisionId) => new()
    {
        RevisionId = Guid.CreateVersion7(),
        EventId = eventId,
        Payload = JsonSerializer.Serialize(draft, EventDraftRules.JsonOptions),
        CreatedAt = now,
        CreatedBy = adminId,
        BaseRevisionId = baseRevisionId,
        OperationId = operationId,
    };

    private enum SaveOutcome { Saved, Conflict, Replayed }

    private static async Task<SaveOutcome> TrySaveAsync(StudioDbContext db, Guid operationId)
    {
        try
        {
            await db.SaveChangesAsync();
            return SaveOutcome.Saved;
        }
        catch (DbUpdateConcurrencyException)
        {
            db.ChangeTracker.Clear();
            return SaveOutcome.Conflict;
        }
        catch (DbUpdateException)
        {
            // 同じoperationIdの並行した再送が一意制約で弾かれた場合だけ再送として扱い、それ以外の失敗はそのまま伝える。
            db.ChangeTracker.Clear();
            if (await FindReplayAsync(db, operationId) is not null)
            {
                return SaveOutcome.Replayed;
            }

            throw;
        }
    }

    private static EventDraft Deserialize(string payload)
        => JsonSerializer.Deserialize<EventDraft>(payload, EventDraftRules.JsonOptions)
           ?? throw new InvalidOperationException("保存済みのイベントpayloadを読み取れません。");

    private static Guid CurrentAdminId(ClaimsPrincipal principal, UserManager<StudioAdmin> userManager)
        => Guid.Parse(userManager.GetUserId(principal) ?? throw new InvalidOperationException("管理者IDを特定できません。"));

    private static DraftValidationProblem InvalidDraft(IReadOnlyList<DraftProblem> problems)
        => new("invalid_draft", "保存できない入力があります。", problems);

    private static DraftValidationProblem InvalidOperationId()
        => new("invalid_operation_id", "operationId を指定してください。", []);
}
