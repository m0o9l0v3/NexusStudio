using System.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;
using StudioApi.Reference;
using StudioApi.Services.MapValidation;

namespace StudioApi.Publishing;

public sealed record OverviewResponse(
    DateTimeOffset GeneratedAt,
    DateOnly CampusToday,
    OverviewRelease? LatestRelease,
    IReadOnlyList<OverviewOccurrence> PublishedOccurrences,
    OverviewDataHealth DataHealth,
    IReadOnlyList<OverviewAreaStatus> UnpublishedChanges,
    IReadOnlyList<LogItem> RecentLogs);

public sealed record OverviewRelease(
    Guid ReleaseId,
    long Sequence,
    DateTimeOffset PublishedAt,
    string Source,
    EditorRef? PublishedBy,
    long? PreviousSequence,
    IReadOnlyList<OverviewReleaseKindCount> EntrySummary);

public sealed record OverviewReleaseKindCount(string TargetKind, string Action, int Count);

public sealed record OverviewOccurrence(Guid Id, string Name, IReadOnlyList<OverviewOccurrenceDay> Days);

public sealed record OverviewOccurrenceDay(Guid Id, DateOnly Date, string? PublicStart, string? PublicEnd, string Status, string? CancelNote);

/// <param name="DiagnosisStatus">neverRun／ok／stale／failed。未実行・失敗時の所見件数は null。</param>
public sealed record OverviewDataHealth(
    bool HasPublishedRelease,
    string DiagnosisStatus,
    DateTimeOffset? LastCheckedAt,
    int? TotalBlockingCount,
    int? TotalWarningCount,
    bool IncludesMap,
    int UncheckedDraftCount,
    IReadOnlyList<OverviewAreaCount> UncheckedByArea);

public sealed record OverviewAreaCount(string TargetKind, int Count);

public sealed record OverviewAreaStatus(
    string TargetKind,
    int DraftCount,
    int UncheckedCount,
    int? BlockingCount,
    int? WarningCount,
    Guid? LatestMapRevisionId);

/// <summary>Overview に表示する公開・下書き・診断・操作履歴の集計（12 §4）。</summary>
public static class OverviewEndpoints
{
    private static readonly TimeZoneInfo Campus = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");
    private static readonly string[] AreaOrder =
        [PublishTargetKind.Event, PublishTargetKind.Map, PublishTargetKind.Spot, PublishTargetKind.Occurrence, PublishTargetKind.Categories];

    public static IEndpointRouteBuilder MapOverviewEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/overview", GetAsync)
            .WithTags("Overview")
            .RequireAuthorization()
            .Produces(StatusCodes.Status401Unauthorized);
        return app;
    }

    private static async Task<Ok<OverviewResponse>> GetAsync(
        StudioDbContext db, ApprovedMapSettingsSource mapSettings, TimeProvider timeProvider)
    {
        // 公開・保存と並行しても、全項目を同じ DB スナップショットから読む。
        await using var transaction = await db.Database.BeginTransactionAsync(
            db.Database.IsNpgsql() ? IsolationLevel.RepeatableRead : IsolationLevel.Serializable);
        var now = timeProvider.GetUtcNow();
        var latestRelease = await LoadLatestReleaseAsync(db);
        var occurrences = await LoadPublishedOccurrencesAsync(db);
        var (targets, fingerprint) = await DraftDiagnosis.LoadTargetsAsync(db, mapSettings);
        var run = await DraftDiagnosis.LoadLatestRunAsync(db);
        var (health, areas) = SummarizeDiagnosis(latestRelease is not null, targets, fingerprint, run);
        var recentLogs = await LoadRecentLogsAsync(db, timeProvider, now);
        await transaction.CommitAsync();

        return TypedResults.Ok(new OverviewResponse(
            now,
            DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, Campus).DateTime),
            latestRelease,
            occurrences,
            health,
            areas,
            recentLogs));
    }

    private static async Task<OverviewRelease?> LoadLatestReleaseAsync(StudioDbContext db)
    {
        var releases = await db.Releases.AsNoTracking().OrderByDescending(r => r.Sequence).Take(2).ToListAsync();
        if (releases.Count == 0)
        {
            return null;
        }

        var release = releases[0];
        var entries = await db.ReleaseEntries.AsNoTracking()
            .Where(e => e.ReleaseId == release.ReleaseId)
            .GroupBy(e => new { e.TargetKind, e.Action })
            .OrderBy(g => g.Key.TargetKind).ThenBy(g => g.Key.Action)
            .Select(g => new OverviewReleaseKindCount(g.Key.TargetKind, g.Key.Action, g.Count()))
            .ToListAsync();
        var names = await ReferenceSaving.DisplayNamesAsync(db, [release.CreatedBy]);
        return new OverviewRelease(
            release.ReleaseId, release.Sequence, release.CreatedAt, release.Source,
            ReferenceSaving.Editor(release.CreatedBy, names), releases.ElementAtOrDefault(1)?.Sequence, entries);
    }

    private static async Task<List<OverviewOccurrence>> LoadPublishedOccurrencesAsync(StudioDbContext db)
    {
        var rows = await (
            from publication in db.Publications.AsNoTracking()
            where publication.TargetKind == PublishTargetKind.Occurrence && publication.State == PublicationRowState.Published
            join revision in db.ReferenceRevisions.AsNoTracking()
                on new { publication.RevisionId, Kind = publication.TargetKind, publication.TargetId }
                equals new { revision.RevisionId, revision.Kind, revision.TargetId } into revisions
            from revision in revisions.DefaultIfEmpty()
            select new { publication.TargetId, publication.RevisionId, Payload = revision == null ? null : revision.Payload })
            .ToListAsync();

        return rows.Select(row =>
        {
            var payload = row.Payload ?? throw new InvalidOperationException($"公開中の開催回の版 {row.RevisionId} を読み込めません。");
            var draft = (OccurrenceDraft)PublishCandidate.DeserializePayload(PublishTargetKind.Occurrence, payload);
            var name = draft.Name ?? throw new InvalidOperationException($"公開中の開催回の版 {row.RevisionId} に名称がありません。");
            var days = draft.Days.OrderBy(day => day.Date).Select(day => new OverviewOccurrenceDay(
                day.Id, day.Date ?? throw new InvalidOperationException($"開催日 {day.Id} に日付がありません。"),
                day.PublicStart, day.PublicEnd, day.Status, day.CancelNote)).ToList();
            return new OverviewOccurrence(Guid.Parse(row.TargetId), name, days);
        })
        .OrderBy(o => o.Days.Count == 0 ? DateOnly.MaxValue : o.Days[0].Date)
        .ThenBy(o => o.Name, StringComparer.CurrentCulture).ThenBy(o => o.Id)
        .ToList();
    }

    private static (OverviewDataHealth Health, List<OverviewAreaStatus> Areas) SummarizeDiagnosis(
        bool hasPublishedRelease, List<DraftDiagnosis.DraftEntry> targets, string currentFingerprint, ValidationRun? run)
    {
        var status = run switch
        {
            null => "neverRun",
            { Status: ValidationRunStatus.Failed } => ValidationRunStatus.Failed,
            _ when run.Fingerprint != currentFingerprint => "stale",
            _ => ValidationRunStatus.Ok,
        };
        var entries = run is null ? [] : DraftDiagnosis.ReadEntries(run)
            ?? throw new InvalidOperationException($"診断 {run.Id} の対象を読み込めません。");
        var findings = run is not null && status != ValidationRunStatus.Failed
            ? DraftDiagnosis.ReadFindings(run) ?? throw new InvalidOperationException($"診断 {run.Id} の所見を読み込めません。")
            : null;
        var findingsByArea = findings?.ToLookup(f => f.TargetKind);
        var map = targets.SingleOrDefault(t => t.TargetKind == PublishTargetKind.Map);

        // 古い診断に設定の記録がなく、診断全体が stale の場合も地図は再確認に回す。
        var mapNeedsRecheck = status == "stale" && map is not null
            && entries.Any(t => t.TargetKind == PublishTargetKind.Map && t.MapSettingsFingerprint != map.MapSettingsFingerprint);
        var checkedTargets = entries.Where(t => !mapNeedsRecheck || t.TargetKind != PublishTargetKind.Map)
            .Select(t => (t.TargetKind, t.TargetId, t.RevisionId)).ToHashSet();
        var uncheckedTargets = targets.Where(t => findings is null || !checkedTargets.Contains((t.TargetKind, t.TargetId, t.RevisionId)))
            .ToLookup(t => t.TargetKind);
        var targetsByArea = targets.ToLookup(t => t.TargetKind);
        var areas = AreaOrder.Select(kind => new OverviewAreaStatus(
            kind,
            targetsByArea[kind].Count(),
            uncheckedTargets[kind].Count(),
            findingsByArea?[kind].Count(f => f.Severity == FindingSeverity.Blocking),
            findingsByArea?[kind].Count(f => f.Severity == FindingSeverity.Warning),
            kind == PublishTargetKind.Map ? map?.RevisionId : null)).ToList();

        var health = new OverviewDataHealth(
            hasPublishedRelease,
            status,
            run?.CreatedAt,
            findings?.Count(f => f.Severity == FindingSeverity.Blocking),
            findings?.Count(f => f.Severity == FindingSeverity.Warning),
            map is not null || entries.Any(t => t.TargetKind == PublishTargetKind.Map),
            areas.Sum(a => a.UncheckedCount),
            areas.Where(a => a.UncheckedCount > 0).Select(a => new OverviewAreaCount(a.TargetKind, a.UncheckedCount)).ToList());
        return (health, areas);
    }

    private static async Task<List<LogItem>> LoadRecentLogsAsync(StudioDbContext db, TimeProvider timeProvider, DateTimeOffset now)
    {
        var rows = await db.OperationLogs.AsNoTracking()
            .Where(l => l.Action == OperationAction.Publish || l.Action == OperationAction.Save || l.Action == OperationAction.Import)
            .OrderByDescending(l => l.StartedAtMs).ThenByDescending(l => l.Id)
            .Take(5).ToListAsync();
        var actorIds = rows.Select(l => l.ActorId).OfType<Guid>().Distinct().ToList();
        var admins = await db.Users.AsNoTracking().Where(u => actorIds.Contains(u.Id))
            .Select(u => new EditorRef(u.Id, u.DisplayName)).ToListAsync();
        return await LogEndpoints.ToItemsAsync(db, timeProvider, rows, admins, now);
    }
}
