using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Publishing;

public sealed record ReleasePage(IReadOnlyList<ReleaseSummary> Items, long? NextBefore);

/// <summary>対象の内容の比較（公開中／公開候補にあたる2つ）。種類に応じて1つだけが入る。</summary>
public sealed record PayloadSides(EventSides? Event, OccurrenceSides? Occurrence, CategorySides? Categories, SpotSides? Spot);

/// <summary>Release に含まれる対象1件の詳細（11 RL-09）。</summary>
/// <param name="Changes">直前の公開版 → この Release で公開した版。取り下げでは空。</param>
/// <param name="Stash">復旧で退避した下書き → 復旧後の下書き。退避が無ければnull。</param>
/// <param name="IsCurrent">この Release の内容が、いまも対象の公開版か。</param>
/// <param name="CanRestore">この版へ戻す操作を出せるか（過去に公開した版で、いまの公開版ではない）。</param>
/// <param name="CurrentPublication">対象の現在の公開状態。</param>
public sealed record ReleaseEntryDetail(
    ReleaseEntrySummary Entry,
    PayloadSides Changes,
    PayloadSides? Stash,
    bool IsCurrent,
    bool CanRestore,
    PublicationSummary CurrentPublication);

/// <param name="Published">直前の Release の時点の参照データ（開催日・Spot・カテゴリ）。</param>
/// <param name="Candidate">この Release の時点の参照データ。</param>
public sealed record ReleaseDetail(ReleaseSummary Release, IReadOnlyList<ReleaseEntryDetail> Entries, PreviewReferences Published, PreviewReferences Candidate);

/// <summary>公開履歴の一覧・詳細（11 RL-08・RL-09、Releases 画面）。</summary>
public static class ReleaseHistory
{
    public const int PageSize = 50;

    public static ReleaseEntrySummary ToSummary(ReleaseEntry e)
        => new(e.TargetKind, e.TargetId, e.Action, e.RevisionId, e.PreviousRevisionId, e.Label, e.RestoredFromRevisionId, e.StashedRevisionId);

    /// <param name="before">この通し番号より前（古い）の Release を返す（次のページ）。</param>
    public static async Task<Ok<ReleasePage>> ListAsync(
        StudioDbContext db, PublishingService publishing, string? targetKind, string? targetId, string? action, long? before)
    {
        var query = db.Releases.AsNoTracking();
        if (before is { } sequence)
        {
            query = query.Where(r => r.Sequence < sequence);
        }

        if (!string.IsNullOrEmpty(targetKind) || !string.IsNullOrEmpty(targetId) || !string.IsNullOrEmpty(action))
        {
            query = query.Where(r => db.ReleaseEntries.Any(e =>
                e.ReleaseId == r.ReleaseId
                && (string.IsNullOrEmpty(targetKind) || e.TargetKind == targetKind)
                && (string.IsNullOrEmpty(targetId) || e.TargetId == targetId)
                && (string.IsNullOrEmpty(action) || e.Action == action)));
        }

        var ids = await query.OrderByDescending(r => r.Sequence).Take(PageSize + 1).Select(r => new { r.ReleaseId, r.Sequence }).ToListAsync();
        var items = new List<ReleaseSummary>();
        foreach (var id in ids.Take(PageSize))
        {
            items.Add((await publishing.LoadReleaseAsync(id.ReleaseId))!);
        }

        return TypedResults.Ok(new ReleasePage(items, ids.Count > PageSize ? ids[PageSize - 1].Sequence : null));
    }

    public static async Task<Results<Ok<ReleaseDetail>, NotFound>> GetAsync(Guid id, StudioDbContext db, PublishingService publishing)
    {
        var release = await publishing.LoadReleaseAsync(id);
        if (release is null)
        {
            return TypedResults.NotFound();
        }

        var before = await PublishCandidate.LoadPublishedAtAsync(db, release.Sequence - 1);
        var after = await PublishCandidate.LoadPublishedAtAsync(db, release.Sequence);
        var publications = await PublicationIndex.LoadAsync(db);
        var spotRows = (await db.Spots.AsNoTracking().ToListAsync()).ToDictionary(s => s.CanonicalId, StringComparer.Ordinal);
        var currentRevisions = await CurrentRevisionsAsync(db, release.Entries);

        var entries = new List<ReleaseEntryDetail>();
        foreach (var entry in release.Entries)
        {
            var row = publications.Find(entry.TargetKind, entry.TargetId);
            var current = currentRevisions.GetValueOrDefault((entry.TargetKind, entry.TargetId));
            var withdraw = entry.Action == ReleaseAction.Withdraw;
            var changes = withdraw
                ? new PayloadSides(null, null, null, null)
                : await SidesAsync(db, entry, entry.PreviousRevisionId, entry.RevisionId);
            var stash = entry.StashedRevisionId is { } stashed ? await SidesAsync(db, entry, stashed, entry.RevisionId) : null;
            var isCurrent = row is { State: PublicationRowState.Published } && row.ReleaseId == release.ReleaseId;
            entries.Add(new ReleaseEntryDetail(
                entry,
                changes,
                stash,
                isCurrent,
                !withdraw && !(row is { State: PublicationRowState.Published } && row.RevisionId == entry.RevisionId),
                new PublicationSummary(PublicationState.Of(row, current), row?.RevisionId, row?.UpdatedAt)));
        }

        var events = entries
            .SelectMany(e => new[] { e.Changes.Event?.Published, e.Changes.Event?.Candidate, e.Stash?.Event?.Published })
            .OfType<EventDraft>()
            .ToList();
        var occurrenceIds = release.Entries
            .Where(e => e.TargetKind == PublishTargetKind.Occurrence && Guid.TryParse(e.TargetId, out _))
            .Select(e => Guid.Parse(e.TargetId))
            .ToHashSet();
        return TypedResults.Ok(new ReleaseDetail(
            release,
            entries,
            ReleaseEndpoints.References(before, spotRows, events, occurrenceIds),
            ReleaseEndpoints.References(after, spotRows, events, occurrenceIds)));
    }

    private static async Task<PayloadSides> SidesAsync(StudioDbContext db, ReleaseEntrySummary entry, Guid? fromRevision, Guid toRevision)
    {
        var from = fromRevision is { } f ? await PublishCandidate.LoadPayloadAsync(db, entry.TargetKind, entry.TargetId, f) : null;
        var to = await PublishCandidate.LoadPayloadAsync(db, entry.TargetKind, entry.TargetId, toRevision);
        return entry.TargetKind switch
        {
            PublishTargetKind.Event => new PayloadSides(new EventSides(from as EventDraft, to as EventDraft), null, null, null),
            PublishTargetKind.Occurrence => new PayloadSides(null, new OccurrenceSides(from as OccurrenceDraft, to as OccurrenceDraft), null, null),
            PublishTargetKind.Categories => new PayloadSides(null, null, new CategorySides(from as List<CategoryDraft>, to as List<CategoryDraft>), null),
            _ => new PayloadSides(null, null, null, new SpotSides(from as SpotDraft, to as SpotDraft)),
        };
    }

    /// <summary>対象ごとの現在の下書きの版（公開状態の算出に使う）。</summary>
    private static async Task<Dictionary<(string, string), Guid?>> CurrentRevisionsAsync(StudioDbContext db, IReadOnlyList<ReleaseEntrySummary> entries)
    {
        var result = new Dictionary<(string, string), Guid?>();
        foreach (var entry in entries)
        {
            Guid? current = entry.TargetKind switch
            {
                PublishTargetKind.Event when Guid.TryParse(entry.TargetId, out var id)
                    => (await db.EventHeads.AsNoTracking().SingleOrDefaultAsync(h => h.EventId == id))?.CurrentRevisionId,
                PublishTargetKind.Occurrence when Guid.TryParse(entry.TargetId, out var id)
                    => (await db.Occurrences.AsNoTracking().SingleOrDefaultAsync(o => o.Id == id))?.CurrentRevisionId,
                PublishTargetKind.Categories => (await db.CategoryListStates.AsNoTracking().SingleAsync()).CurrentRevisionId,
                PublishTargetKind.Spot => (await db.Spots.AsNoTracking().Where(s => s.CanonicalId == entry.TargetId).ToListAsync())
                    .SingleOrDefault(s => string.Equals(s.CanonicalId, entry.TargetId, StringComparison.Ordinal))?.CurrentRevisionId,
                _ => null,
            };
            result[(entry.TargetKind, entry.TargetId)] = current;
        }

        return result;
    }
}
