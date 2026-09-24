using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Publishing;

namespace StudioApi.Reference;

/// <param name="Date">開催日。日付そのものが開催日の識別に使われるため、下書きでも必須。</param>
/// <param name="PublicStart">一般公開の開始 "HH:mm"。未登録ならnull（推定しない）。</param>
public sealed record OcDayDraft(Guid Id, DateOnly? Date, string? PublicStart, string? PublicEnd, string Status, string? CancelNote);

public sealed record OccurrenceDraft(string? Name, string? SourceNote, IReadOnlyList<OcDayDraft> Days);

public sealed record OccurrenceDetail(
    Guid Id,
    long RowVersion,
    DateTimeOffset? UpdatedAt,
    EditorRef? UpdatedBy,
    Guid? RevisionId,
    PublicationSummary Publication,
    OccurrenceDraft Draft,
    IReadOnlyList<SlotReference> References);

public sealed record OccurrenceListItem(
    Guid Id,
    string Name,
    IReadOnlyList<OcDayItem> Days,
    int RelatedEventCount,
    string Publication,
    DateTimeOffset? UpdatedAt,
    EditorRef? UpdatedBy);

public sealed record SaveOccurrenceRequest(Guid OperationId, long RowVersion, OccurrenceDraft? Draft);

public sealed record CreateOccurrenceRequest(Guid OperationId, OccurrenceDraft? Draft);

/// <summary>開催回・開催日・一般公開時間・開催日の中止（08 OC-01〜OC-13）。公開は Releases（/api/releases）で行う。</summary>
public static partial class OccurrenceEndpoints
{
    public const int MaxDays = 100;

    [GeneratedRegex("^([01][0-9]|2[0-3]):[0-5][0-9]$")]
    private static partial Regex TimePattern();

    public static IEndpointRouteBuilder MapOccurrenceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/occurrences").WithTags("OpenCampus");
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:guid}", GetAsync);
        group.MapPost("/", CreateAsync);
        group.MapPut("/{id:guid}", UpdateAsync);
        return app;
    }

    private static async Task<Ok<List<OccurrenceListItem>>> ListAsync(StudioDbContext db)
    {
        var occurrences = await db.Occurrences.AsNoTracking().Include(o => o.Days).ToListAsync();
        var references = await EventReferenceIndex.LoadAsync(db);
        var publications = await PublicationIndex.LoadAsync(db, PublishTargetKind.Occurrence);
        var names = await ReferenceSaving.DisplayNamesAsync(db, occurrences.Select(o => o.UpdatedBy));
        return TypedResults.Ok(occurrences
            .OrderBy(o => o.Days.Count == 0 ? DateOnly.MaxValue : o.Days.Min(d => d.Date))
            .ThenBy(o => o.Name, StringComparer.CurrentCulture)
            .Select(o => new OccurrenceListItem(
                o.Id,
                o.Name,
                o.Days.OrderBy(d => d.Date).Select(ToItem).ToList(),
                references.EventsInOccurrence(o.Id),
                PublicationState.Of(publications.Find(PublishTargetKind.Occurrence, o.Id.ToString()), o.CurrentRevisionId),
                o.UpdatedAt,
                ReferenceSaving.Editor(o.UpdatedBy, names)))
            .ToList());
    }

    private static async Task<Results<Ok<OccurrenceDetail>, NotFound>> GetAsync(Guid id, StudioDbContext db)
        => await LoadDetailAsync(db, id) is { } detail ? TypedResults.Ok(detail) : TypedResults.NotFound();

    private static async Task<Results<Created<OccurrenceDetail>, Ok<OccurrenceDetail>, BadRequest<ReferenceValidationProblem>>> CreateAsync(
        CreateOccurrenceRequest request, StudioDbContext db, ClaimsPrincipal principal, UserManager<StudioAdmin> userManager, TimeProvider timeProvider)
    {
        if (request.OperationId == Guid.Empty)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.InvalidOperationId());
        }

        if (await ReferenceSaving.FindReplayAsync(db, request.OperationId) is { Kind: ReferenceRevisionKind.Occurrence } replay)
        {
            return TypedResults.Ok((await LoadDetailAsync(db, Guid.Parse(replay.TargetId)))!);
        }

        var problems = await ValidateAsync(db, request.Draft, occurrence: null, references: null);
        if (problems.Count > 0)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.Invalid(problems));
        }

        var adminId = ReferenceSaving.CurrentAdminId(principal, userManager);
        var now = timeProvider.GetUtcNow();
        var occurrence = new Occurrence { Id = Guid.CreateVersion7(), RowVersion = 1, UpdatedAt = now, UpdatedBy = adminId };
        Apply(occurrence, request.Draft!, db);
        db.Occurrences.Add(occurrence);
        var created = ReferenceSaving.AddRevision(db, occurrence, ReferenceSaving.NewRevision(
            ReferenceRevisionKind.Occurrence, occurrence.Id.ToString(), Normalize(request.Draft!), adminId, now, ReferenceRevisionSource.Editor, request.OperationId));
        OperationLogs.AddSave(db, request.OperationId, adminId, now, PublishTargetKind.Occurrence, occurrence.Id.ToString(), PublishCandidate.OccurrenceLabel(occurrence.Name), created.RevisionId);

        if (await ReferenceSaving.TrySaveAsync(db, request.OperationId) == SaveOutcome.Replayed)
        {
            var saved = await ReferenceSaving.FindReplayAsync(db, request.OperationId);
            return TypedResults.Ok((await LoadDetailAsync(db, Guid.Parse(saved!.TargetId)))!);
        }

        return TypedResults.Created($"/api/occurrences/{occurrence.Id}", (await LoadDetailAsync(db, occurrence.Id))!);
    }

    private static async Task<Results<Ok<OccurrenceDetail>, NotFound, BadRequest<ReferenceValidationProblem>, Conflict<ReferenceConflict<OccurrenceDetail>>>> UpdateAsync(
        Guid id, SaveOccurrenceRequest request, StudioDbContext db, ClaimsPrincipal principal, UserManager<StudioAdmin> userManager, TimeProvider timeProvider)
    {
        if (request.OperationId == Guid.Empty)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.InvalidOperationId());
        }

        if (await ReferenceSaving.FindReplayAsync(db, request.OperationId) is { } replay)
        {
            return replay.Kind == ReferenceRevisionKind.Occurrence && replay.TargetId == id.ToString()
                ? TypedResults.Ok((await LoadDetailAsync(db, id))!)
                : TypedResults.BadRequest(ReferenceValidationProblem.InvalidOperationId());
        }

        var occurrence = await db.Occurrences.Include(o => o.Days).SingleOrDefaultAsync(o => o.Id == id);
        if (occurrence is null)
        {
            return TypedResults.NotFound();
        }

        if (occurrence.RowVersion != request.RowVersion)
        {
            return TypedResults.Conflict(await ConflictAsync(db, id));
        }

        var references = await EventReferenceIndex.LoadAsync(db);
        var problems = await ValidateAsync(db, request.Draft, occurrence, references);
        if (problems.Count > 0)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.Invalid(problems));
        }

        var adminId = ReferenceSaving.CurrentAdminId(principal, userManager);
        var now = timeProvider.GetUtcNow();
        var outcome = await ReferenceSaving.TrySaveAsync(db, request.OperationId, async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            await ApplyAsync(db, occurrence, request.Draft!);
            ReferenceSaving.Touch(occurrence, adminId, now);
            var saved = ReferenceSaving.AddRevision(db, occurrence, ReferenceSaving.NewRevision(
                ReferenceRevisionKind.Occurrence, id.ToString(), Normalize(request.Draft!), adminId, now, ReferenceRevisionSource.Editor, request.OperationId));
            OperationLogs.AddSave(db, request.OperationId, adminId, now, PublishTargetKind.Occurrence, id.ToString(), PublishCandidate.OccurrenceLabel(occurrence.Name), saved.RevisionId);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
        });

        return outcome switch
        {
            SaveOutcome.Conflict => TypedResults.Conflict(await ConflictAsync(db, id)),
            _ => TypedResults.Ok((await LoadDetailAsync(db, id))!),
        };
    }

    private static async Task<List<DraftProblem>> ValidateAsync(StudioDbContext db, OccurrenceDraft? draft, Occurrence? occurrence, EventReferenceIndex? references)
    {
        var problems = new List<DraftProblem>();
        if (draft is null)
        {
            problems.Add(new("draft", "required", "下書きの内容がありません。"));
            return problems;
        }

        if (draft.Name is { Length: > 200 })
        {
            problems.Add(new("name", "too_long", "名称は200文字以内にしてください。"));
        }

        if (draft.SourceNote is { Length: > 1000 })
        {
            problems.Add(new("sourceNote", "too_long", "出典は1000文字以内にしてください。"));
        }

        if (draft.Days is null)
        {
            problems.Add(new("days", "required", "開催日の一覧がありません（0件の場合は空の配列）。"));
            return problems;
        }

        if (draft.Days.Count > MaxDays)
        {
            problems.Add(new("days", "too_many", $"開催日は{MaxDays}件以内にしてください。"));
        }

        var ids = new HashSet<Guid>();
        var dates = new HashSet<DateOnly>();
        var ownDayIds = occurrence?.Days.Select(d => d.Id).ToHashSet() ?? [];
        var draftIds = draft.Days.Where(d => d is not null).Select(d => d.Id).ToList();
        var foreignIds = await db.OcDays.AsNoTracking().Where(d => draftIds.Contains(d.Id) && (occurrence == null || d.OccurrenceId != occurrence.Id)).Select(d => d.Id).ToListAsync();

        for (var i = 0; i < draft.Days.Count; i++)
        {
            var day = draft.Days[i];
            var path = $"days[{i}]";
            if (day is null)
            {
                problems.Add(new(path, "required", "開催日の内容がありません。"));
                continue;
            }

            if (day.Id == Guid.Empty || !ids.Add(day.Id) || foreignIds.Contains(day.Id))
            {
                problems.Add(new($"{path}.id", "invalid_day_id", "開催日のIDが空か、重複しているか、別の開催回のものです。"));
            }

            if (day.Date is not { } date)
            {
                problems.Add(new($"{path}.date", "required", "開催日の日付を入力してください。"));
            }
            else if (!dates.Add(date))
            {
                // 同じ開催回で同じ日付は保存できない（08 OV-02）。
                problems.Add(new($"{path}.date", "duplicate_date", $"{date:M月d日}が同じ開催回に重複しています。"));
            }

            foreach (var (value, name) in new[] { (day.PublicStart, "publicStart"), (day.PublicEnd, "publicEnd") })
            {
                if (value is not null && !TimePattern().IsMatch(value))
                {
                    problems.Add(new($"{path}.{name}", "invalid_time", "時刻は HH:mm 形式で指定してください。"));
                }
            }

            if (day.Status is not (OcDayStatus.Normal or OcDayStatus.Cancelled))
            {
                problems.Add(new($"{path}.status", "invalid_value", "開催状況は normal か cancelled を指定してください。"));
            }

            if (day.CancelNote is { Length: > 500 })
            {
                problems.Add(new($"{path}.cancelNote", "too_long", "中止案内は500文字以内にしてください。"));
            }
        }

        // イベントが参照している開催日は、日付の変更・削除を止めて参照元を示す（08 OV-04、OA-08）。
        if (occurrence is not null && references is not null)
        {
            foreach (var existing in occurrence.Days)
            {
                var referencing = references.SlotsOnDays([existing.Id]).ToList();
                if (referencing.Count == 0)
                {
                    continue;
                }

                var titles = string.Join("、", referencing.Select(r => r.EventTitle?.Trim() is { Length: > 0 } title ? title : "無題のイベント").Distinct().Take(3));
                var index = draft.Days.ToList().FindIndex(d => d?.Id == existing.Id);
                if (index < 0)
                {
                    problems.Add(new("days", "day_in_use", $"{existing.Date:M月d日}はイベントの開催枠（{referencing.Count}枠：{titles}）が参照しているため削除できません。"));
                }
                else if (draft.Days[index].Date is { } newDate && newDate != existing.Date)
                {
                    problems.Add(new($"days[{index}].date", "day_in_use", $"{existing.Date:M月d日}はイベントの開催枠（{referencing.Count}枠：{titles}）が参照しているため日付を変更できません。"));
                }
            }
        }

        return problems;
    }

    /// <summary>
    /// 下書きの内容を開催回の行へ反映する。呼び出し側のトランザクションの中で使う（途中で一度保存する）。
    /// 同じ開催回の中で日付を入れ替えると、(occurrence_id, date) の一意制約に途中で当たる。
    /// 日付が変わる開催日を一度仮の日付へ退避してから、最終的な日付を書き込む。
    /// </summary>
    internal static async Task ApplyAsync(StudioDbContext db, Occurrence occurrence, OccurrenceDraft draft)
    {
        var moving = draft.Days
            .Select(day => (draft: day, existing: occurrence.Days.SingleOrDefault(d => d.Id == day.Id)))
            .Where(pair => pair.existing is not null && pair.existing.Date != pair.draft.Date)
            .ToList();
        if (moving.Count > 0)
        {
            for (var i = 0; i < moving.Count; i++)
            {
                moving[i].existing!.Date = DateOnly.MinValue.AddDays(i);
            }

            await db.SaveChangesAsync();
        }

        Apply(occurrence, draft, db);
    }

    private static void Apply(Occurrence occurrence, OccurrenceDraft draft, StudioDbContext db)
    {
        occurrence.Name = draft.Name?.Trim() ?? string.Empty;
        occurrence.SourceNote = string.IsNullOrWhiteSpace(draft.SourceNote) ? null : draft.SourceNote;

        foreach (var removed in occurrence.Days.Where(existing => draft.Days.All(d => d.Id != existing.Id)).ToList())
        {
            occurrence.Days.Remove(removed);
            db.OcDays.Remove(removed);
        }

        foreach (var dayDraft in draft.Days)
        {
            var day = occurrence.Days.SingleOrDefault(d => d.Id == dayDraft.Id);
            if (day is null)
            {
                // IDを画面側で発行するため、ナビゲーションへ足すだけだと既存行の更新と扱われる。追加として登録する。
                day = new OcDay { Id = dayDraft.Id, OccurrenceId = occurrence.Id };
                db.OcDays.Add(day);
                occurrence.Days.Add(day);
            }

            day.Date = dayDraft.Date!.Value;
            day.PublicStart = dayDraft.PublicStart is null ? null : TimeOnly.ParseExact(dayDraft.PublicStart, "HH:mm");
            day.PublicEnd = dayDraft.PublicEnd is null ? null : TimeOnly.ParseExact(dayDraft.PublicEnd, "HH:mm");
            day.Status = dayDraft.Status;
            day.CancelNote = string.IsNullOrWhiteSpace(dayDraft.CancelNote) ? null : dayDraft.CancelNote;
        }
    }

    internal static OccurrenceDraft ToDraft(Occurrence occurrence) => new(
        occurrence.Name,
        occurrence.SourceNote,
        occurrence.Days.OrderBy(d => d.Date).Select(d => new OcDayDraft(
            d.Id, d.Date, d.PublicStart?.ToString("HH:mm"), d.PublicEnd?.ToString("HH:mm"), d.Status, d.CancelNote)).ToList());

    private static OccurrenceDraft Normalize(OccurrenceDraft draft) => draft with
    {
        Name = draft.Name?.Trim() ?? string.Empty,
        Days = draft.Days.OrderBy(d => d.Date).ToList(),
    };

    private static async Task<OccurrenceDetail?> LoadDetailAsync(StudioDbContext db, Guid id)
    {
        var occurrence = await db.Occurrences.AsNoTracking().Include(o => o.Days).SingleOrDefaultAsync(o => o.Id == id);
        if (occurrence is null)
        {
            return null;
        }

        var references = await EventReferenceIndex.LoadAsync(db);
        var publications = await PublicationIndex.LoadAsync(db, PublishTargetKind.Occurrence);
        var names = await ReferenceSaving.DisplayNamesAsync(db, [occurrence.UpdatedBy]);
        return new OccurrenceDetail(
            occurrence.Id,
            occurrence.RowVersion,
            occurrence.UpdatedAt,
            ReferenceSaving.Editor(occurrence.UpdatedBy, names),
            occurrence.CurrentRevisionId,
            publications.Summarize(PublishTargetKind.Occurrence, occurrence.Id.ToString(), occurrence.CurrentRevisionId),
            ToDraft(occurrence),
            references.SlotsOnDays(occurrence.Days.Select(d => d.Id)).ToList());
    }

    private static async Task<ReferenceConflict<OccurrenceDetail>> ConflictAsync(StudioDbContext db, Guid id)
        => new("conflict", "他の管理者がこの開催回を先に保存しました。", (await LoadDetailAsync(db, id))!);

    private static OcDayItem ToItem(OcDay day) => new(
        day.Id, day.Date, day.PublicStart?.ToString("HH:mm"), day.PublicEnd?.ToString("HH:mm"), day.Status);
}
