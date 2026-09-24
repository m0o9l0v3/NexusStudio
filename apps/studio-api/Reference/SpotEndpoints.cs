using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Publishing;

namespace StudioApi.Reference;

/// <summary>Spot単独で公開する属性（28 S4-2）。建物・階・位置・経路の接続は地図と一緒に公開するため含めない。</summary>
/// <param name="Utilization">available（選択できる）／noNewSelection（新規選択停止）。withdrawn は移行元の取り下げ済みの値で、ここでは新たに設定できない（公開の取り下げは Releases で行う）。</param>
public sealed record SpotDraft(string? Name, IReadOnlyList<string> Aliases, string Utilization);

public sealed record SpotEventReference(Guid EventId, string? EventTitle, int SlotCount);

public sealed record SpotDetail(
    string CanonicalId,
    long RowVersion,
    DateTimeOffset? UpdatedAt,
    EditorRef? UpdatedBy,
    Guid? RevisionId,
    PublicationSummary Publication,
    SpotDraft Draft,
    SpotPlacement Placement,
    IReadOnlyList<SpotEventReference> DraftEvents);

/// <summary>建物・階。地図の公開単位に属し、Spot画面では変更できない（28 S4-2。編集は Map Data で行う）。</summary>
public sealed record SpotPlacement(string? BuildingName, string? FloorName);

public sealed record SaveSpotRequest(Guid OperationId, long RowVersion, SpotDraft? Draft);

/// <summary>
/// Spotの一覧・詳細・属性の下書き編集（09 SP-01〜SP-09・SP-14・SP-17・SP-19）。
/// canonical ID は編集できない（URLのクエリで厳密一致に引く）。位置・出典・経路の編集は Map Data と合わせて扱う。
/// </summary>
public static class SpotEndpoints
{
    public const int MaxDirectoryResults = 500;

    public static IEndpointRouteBuilder MapSpotEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/spots").WithTags("Spots");
        group.MapGet("/directory", DirectoryAsync);
        group.MapGet("/item", GetAsync);
        group.MapPut("/item", SaveAsync);
        return app;
    }

    /// <summary>Spots画面の一覧。会場選択と違い、取り下げ済みも含めて返す。</summary>
    private static async Task<Ok<SpotSearchResult>> DirectoryAsync(StudioDbContext db, string? q, string? building, string? floor)
    {
        var spots = await db.Spots.AsNoTracking().Include(s => s.NameAliases).ToListAsync();
        var publications = await PublicationIndex.LoadAsync(db, PublishTargetKind.Spot);
        IEnumerable<Spot> matches = spots;
        if (!string.IsNullOrWhiteSpace(q))
        {
            var keyword = q.Trim();
            matches = matches.Where(s =>
                s.Name.Contains(keyword, StringComparison.CurrentCultureIgnoreCase)
                || s.CanonicalId.Contains(keyword, StringComparison.OrdinalIgnoreCase)
                || s.NameAliases.Any(a => a.Alias.Contains(keyword, StringComparison.CurrentCultureIgnoreCase)));
        }

        if (!string.IsNullOrEmpty(building))
        {
            matches = matches.Where(s => s.BuildingName == building);
        }

        if (!string.IsNullOrEmpty(floor))
        {
            matches = matches.Where(s => s.FloorName == floor);
        }

        var list = matches
            .OrderBy(s => s.BuildingName, StringComparer.CurrentCulture)
            .ThenBy(s => s.FloorName, StringComparer.CurrentCulture)
            .ThenBy(s => s.Name, StringComparer.CurrentCulture)
            .ThenBy(s => s.CanonicalId, StringComparer.Ordinal)
            .ToList();
        return TypedResults.Ok(new SpotSearchResult(
            list.Count,
            list.Take(MaxDirectoryResults).Select(s => ReferenceEndpoints.ToItem(s, publications)).ToList(),
            spots.Select(s => s.BuildingName).OfType<string>().Distinct().Order(StringComparer.CurrentCulture).ToList(),
            spots.Select(s => s.FloorName).OfType<string>().Distinct().Order(StringComparer.CurrentCulture).ToList()));
    }

    private static async Task<Results<Ok<SpotDetail>, NotFound>> GetAsync(string id, StudioDbContext db)
        => await LoadDetailAsync(db, id) is { } detail ? TypedResults.Ok(detail) : TypedResults.NotFound();

    private static async Task<Results<Ok<SpotDetail>, NotFound, BadRequest<ReferenceValidationProblem>, Conflict<ReferenceConflict<SpotDetail>>>> SaveAsync(
        string id, SaveSpotRequest request, StudioDbContext db, ClaimsPrincipal principal, UserManager<StudioAdmin> userManager, TimeProvider timeProvider)
    {
        if (request.OperationId == Guid.Empty)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.InvalidOperationId());
        }

        if (await ReferenceSaving.FindReplayAsync(db, request.OperationId) is { } replay)
        {
            return replay.Kind == ReferenceRevisionKind.Spot && string.Equals(replay.TargetId, id, StringComparison.Ordinal)
                ? TypedResults.Ok((await LoadDetailAsync(db, id))!)
                : TypedResults.BadRequest(ReferenceValidationProblem.InvalidOperationId());
        }

        var spot = await FindAsync(db.Spots.Include(s => s.NameAliases), id);
        if (spot is null)
        {
            return TypedResults.NotFound();
        }

        if (spot.RowVersion != request.RowVersion)
        {
            return TypedResults.Conflict(await ConflictAsync(db, id));
        }

        var problems = Validate(request.Draft, spot);
        if (problems.Count > 0)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.Invalid(problems));
        }

        var draft = Normalize(request.Draft!);
        spot.Name = draft.Name ?? string.Empty;
        spot.Utilization = draft.Utilization;
        spot.NameAliases.RemoveAll(a => !draft.Aliases.Contains(a.Alias, StringComparer.Ordinal));
        foreach (var alias in draft.Aliases.Where(a => spot.NameAliases.All(existingAlias => existingAlias.Alias != a)))
        {
            spot.NameAliases.Add(new SpotNameAlias { CanonicalId = spot.CanonicalId, Alias = alias });
        }

        var adminId = ReferenceSaving.CurrentAdminId(principal, userManager);
        var now = timeProvider.GetUtcNow();
        ReferenceSaving.Touch(spot, adminId, now);
        var revision = ReferenceSaving.AddRevision(db, spot, ReferenceSaving.NewRevision(
            ReferenceRevisionKind.Spot, spot.CanonicalId, draft, adminId, now, ReferenceRevisionSource.Editor, request.OperationId));
        OperationLogs.AddSave(db, request.OperationId, adminId, now, PublishTargetKind.Spot, spot.CanonicalId, PublishCandidate.SpotLabel(spot.Name, spot.CanonicalId), revision.RevisionId);

        return await ReferenceSaving.TrySaveAsync(db, request.OperationId) == SaveOutcome.Conflict
            ? TypedResults.Conflict(await ConflictAsync(db, id))
            : TypedResults.Ok((await LoadDetailAsync(db, id))!);
    }

    private static List<DraftProblem> Validate(SpotDraft? draft, Spot spot)
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

        if (draft.Aliases is null || draft.Aliases.Count > 50 || draft.Aliases.Any(a => a is null || a.Trim().Length is 0 or > 200))
        {
            problems.Add(new("aliases", "invalid_aliases", "別名は1件200文字以内・50件以内で、空の別名は登録できません。"));
        }

        var allowed = spot.Utilization == SpotUtilization.Withdrawn
            ? new[] { SpotUtilization.Available, SpotUtilization.NoNewSelection, SpotUtilization.Withdrawn }
            : [SpotUtilization.Available, SpotUtilization.NoNewSelection];
        if (!allowed.Contains(draft.Utilization))
        {
            problems.Add(new("utilization", "invalid_value", "利用状態は「選択できる」か「新規選択停止」を指定してください。取り下げは公開と合わせて行います。"));
        }

        return problems;
    }

    private static SpotDraft Normalize(SpotDraft draft) => draft with
    {
        Name = draft.Name?.Trim() ?? string.Empty,
        Aliases = draft.Aliases.Select(a => a.Trim()).Distinct(StringComparer.Ordinal).ToList(),
    };

    /// <summary>canonical ID の厳密一致で引く（DBの照合順序に関わらず序数比較で確かめる）。</summary>
    private static async Task<Spot?> FindAsync(IQueryable<Spot> spots, string id)
    {
        var candidates = await spots.Where(s => s.CanonicalId == id).ToListAsync();
        return candidates.SingleOrDefault(s => string.Equals(s.CanonicalId, id, StringComparison.Ordinal));
    }

    private static async Task<SpotDetail?> LoadDetailAsync(StudioDbContext db, string id)
    {
        var spot = await FindAsync(db.Spots.AsNoTracking().Include(s => s.NameAliases), id);
        if (spot is null)
        {
            return null;
        }

        var references = await EventReferenceIndex.LoadAsync(db);
        var names = await ReferenceSaving.DisplayNamesAsync(db, [spot.UpdatedBy]);
        var publications = await PublicationIndex.LoadAsync(db, PublishTargetKind.Spot);
        return new SpotDetail(
            spot.CanonicalId,
            spot.RowVersion,
            spot.UpdatedAt,
            ReferenceSaving.Editor(spot.UpdatedBy, names),
            spot.CurrentRevisionId,
            publications.Summarize(PublishTargetKind.Spot, spot.CanonicalId, spot.CurrentRevisionId),
            new SpotDraft(spot.Name, spot.NameAliases.Select(a => a.Alias).Order(StringComparer.CurrentCulture).ToList(), spot.Utilization),
            new SpotPlacement(spot.BuildingName, spot.FloorName),
            references.SlotsAtSpot(spot.CanonicalId)
                .GroupBy(r => (r.EventId, r.EventTitle))
                .Select(g => new SpotEventReference(g.Key.EventId, g.Key.EventTitle, g.Count()))
                .ToList());
    }

    private static async Task<ReferenceConflict<SpotDetail>> ConflictAsync(StudioDbContext db, string id)
        => new("conflict", "他の管理者がこのSpotを先に保存しました。", (await LoadDetailAsync(db, id))!);
}
