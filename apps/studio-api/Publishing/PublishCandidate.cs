using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Publishing;

/// <summary>公開・取り下げの対象1件。</summary>
/// <param name="TargetKind">event／occurrence／categories／spot。</param>
/// <param name="TargetId">イベントID・開催回ID・canonical ID。カテゴリ一覧は "categories"。</param>
/// <param name="Action">publish／withdraw／restore。</param>
/// <param name="RevisionId">公開する版（確認した保存版）。復旧では戻す過去の版。取り下げでは指定しない。</param>
public sealed record PublishEntry(string TargetKind, string TargetId, string Action, Guid? RevisionId);

/// <summary>公開データ一式（ある時点の公開版、または公開後の候補）。</summary>
public sealed class PublishedSet
{
    public Dictionary<Guid, (Guid RevisionId, EventDraft Draft)> Events { get; } = [];
    public Dictionary<Guid, (Guid RevisionId, OccurrenceDraft Draft)> Occurrences { get; } = [];
    public (Guid RevisionId, IReadOnlyList<CategoryDraft> Items)? Categories { get; set; }
    public Dictionary<string, (Guid RevisionId, SpotDraft Draft)> Spots { get; } = new(StringComparer.Ordinal);

    public PublishedSet Clone()
    {
        var copy = new PublishedSet { Categories = Categories };
        foreach (var pair in Events) copy.Events[pair.Key] = pair.Value;
        foreach (var pair in Occurrences) copy.Occurrences[pair.Key] = pair.Value;
        foreach (var pair in Spots) copy.Spots[pair.Key] = pair.Value;
        return copy;
    }

    /// <summary>公開中の開催日（開催回IDと合わせて引く）。</summary>
    public (Guid OccurrenceId, OcDayDraft Day)? FindDay(Guid dayId)
    {
        foreach (var (occurrenceId, occurrence) in Occurrences)
        {
            if (occurrence.Draft.Days.FirstOrDefault(d => d.Id == dayId) is { } day)
            {
                return (occurrenceId, day);
            }
        }

        return null;
    }
}

/// <summary>候補の対象1件を、検証・差分表示のために読み込んだもの。</summary>
public sealed class CandidateItem
{
    public required PublishEntry Entry { get; init; }
    public required string Label { get; init; }
    /// <summary>対象が存在しない場合はfalse。</summary>
    public bool Exists { get; init; }
    /// <summary>現在の下書きの版。</summary>
    public Guid? CurrentRevisionId { get; init; }
    public Publication? Publication { get; init; }
    /// <summary>公開する内容（公開・復旧のとき）。</summary>
    public object? CandidatePayload { get; init; }
    /// <summary>復旧：戻す版が過去に公開されていたか。</summary>
    public bool WasPublished { get; init; }
    /// <summary>復旧：戻す版を公開していた当時の公開データ（終日の時刻の違いを示すため。11 RA-10）。</summary>
    public PublishedSet? Original { get; init; }
}

/// <summary>
/// 公開候補（11 §2）。選んだ対象の保存版 ＋ それ以外の現在の公開データ で公開後の状態を組み立てる。
/// 選んでいない下書きは混ぜない。
/// </summary>
public sealed class PublishCandidate
{
    public required IReadOnlyList<CandidateItem> Items { get; init; }
    /// <summary>現在の公開データ。</summary>
    public required PublishedSet Before { get; init; }
    /// <summary>公開後の候補。</summary>
    public required PublishedSet After { get; init; }
    /// <summary>候補の前提（対象と版、公開データの版）から作る値。確認後に変わったら再確認を求める（11 RA-04、07 E06）。</summary>
    public required string Fingerprint { get; init; }
    /// <summary>Spotの取り下げ状態など、公開版に含まれない現在の情報。</summary>
    public required IReadOnlyDictionary<string, Spot> SpotRows { get; init; }
    /// <summary>イベントの現在の下書きが参照している開催日（開催回の復旧で、参照中の開催日を消さないため）。</summary>
    public IReadOnlySet<Guid> DraftDayReferences { get; init; } = new HashSet<Guid>();
    /// <summary>復旧する開催回の、現在の開催日（ID → 日付）。</summary>
    public IReadOnlyDictionary<Guid, Dictionary<Guid, DateOnly>> CurrentOccurrenceDays { get; init; } = new Dictionary<Guid, Dictionary<Guid, DateOnly>>();
    /// <summary>現在のカテゴリ（カテゴリ一覧の復旧で、既存のカテゴリを失わせないため。11 §7）。</summary>
    public IReadOnlySet<Guid> CurrentCategoryIds { get; init; } = new HashSet<Guid>();

    /// <summary>候補の土台（現在の公開データとSpotの行）。全下書き診断では一度だけ読み、対象ごとの候補で使い回す。</summary>
    public sealed record Base(List<Publication> Publications, PublishedSet Published, Dictionary<string, Spot> SpotRows);

    public static async Task<Base> LoadBaseAsync(StudioDbContext db)
    {
        var publications = await db.Publications.AsNoTracking().ToListAsync();
        return new Base(
            publications,
            await LoadPublishedAsync(db, publications.Where(p => p.State == PublicationRowState.Published).ToList()),
            (await db.Spots.AsNoTracking().Include(s => s.NameAliases).ToListAsync()).ToDictionary(s => s.CanonicalId, StringComparer.Ordinal));
    }

    public static async Task<PublishCandidate> BuildAsync(StudioDbContext db, IReadOnlyList<PublishEntry> entries, Base? shared = null)
    {
        var (publications, before, spotRows) = shared ?? await LoadBaseAsync(db);
        var after = before.Clone();

        var items = new List<CandidateItem>();
        foreach (var entry in entries)
        {
            var publication = publications.SingleOrDefault(p => p.TargetKind == entry.TargetKind && p.TargetId == entry.TargetId);
            var item = await LoadItemAsync(db, entry, publication, spotRows);
            items.Add(item);

            if (entry.Action == ReleaseAction.Withdraw)
            {
                Remove(after, entry);
            }
            else if (item.Exists && entry.RevisionId is { } revisionId)
            {
                var payload = await LoadPayloadAsync(db, entry.TargetKind, entry.TargetId, revisionId);
                if (payload is not null)
                {
                    Put(after, entry, revisionId, payload);
                    var restore = entry.Action == ReleaseAction.Restore;
                    var publishedAt = restore ? await PublishedSequenceAsync(db, entry, revisionId) : null;
                    item = new CandidateItem
                    {
                        Entry = item.Entry,
                        Label = LabelOf(entry.TargetKind, entry.TargetId, payload),
                        Exists = true,
                        CurrentRevisionId = item.CurrentRevisionId,
                        Publication = item.Publication,
                        CandidatePayload = payload,
                        WasPublished = publishedAt is not null,
                        Original = publishedAt is { } sequence ? await LoadPublishedAtAsync(db, sequence) : null,
                    };
                    items[^1] = item;
                }
            }
        }

        var restoring = entries.Where(e => e.Action == ReleaseAction.Restore).Select(e => e.TargetKind).ToHashSet();
        return new PublishCandidate
        {
            Items = items,
            Before = before,
            After = after,
            Fingerprint = ComputeFingerprint(entries, items, publications),
            SpotRows = spotRows,
            DraftDayReferences = restoring.Contains(PublishTargetKind.Occurrence)
                ? (await EventReferenceIndex.LoadAsync(db)).ReferencedDayIds()
                : new HashSet<Guid>(),
            CurrentOccurrenceDays = await CurrentDaysAsync(db, entries),
            CurrentCategoryIds = restoring.Contains(PublishTargetKind.Categories)
                ? (await db.Categories.AsNoTracking().Select(c => c.Id).ToListAsync()).ToHashSet()
                : new HashSet<Guid>(),
        };
    }

    private static async Task<Dictionary<Guid, Dictionary<Guid, DateOnly>>> CurrentDaysAsync(StudioDbContext db, IReadOnlyList<PublishEntry> entries)
    {
        var ids = entries
            .Where(e => e.Action == ReleaseAction.Restore && e.TargetKind == PublishTargetKind.Occurrence && Guid.TryParse(e.TargetId, out _))
            .Select(e => Guid.Parse(e.TargetId))
            .ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        var days = await db.OcDays.AsNoTracking().Where(d => ids.Contains(d.OccurrenceId)).ToListAsync();
        return ids.ToDictionary(id => id, id => days.Where(d => d.OccurrenceId == id).ToDictionary(d => d.Id, d => d.Date));
    }

    /// <summary>その版を公開（または復旧）した最後の Release の通し番号。公開されたことが無ければnull。</summary>
    private static async Task<long?> PublishedSequenceAsync(StudioDbContext db, PublishEntry entry, Guid revisionId)
        => await (
            from e in db.ReleaseEntries.AsNoTracking()
            join r in db.Releases.AsNoTracking() on e.ReleaseId equals r.ReleaseId
            where e.TargetKind == entry.TargetKind && e.TargetId == entry.TargetId && e.RevisionId == revisionId && e.Action != ReleaseAction.Withdraw
            select (long?)r.Sequence).MaxAsync();

    /// <summary>通し番号 sequence の Release を反映した時点の公開データ（履歴の詳細・復旧の確認で使う。11 RL-09）。</summary>
    public static async Task<PublishedSet> LoadPublishedAtAsync(StudioDbContext db, long sequence)
    {
        var entries = await (
            from e in db.ReleaseEntries.AsNoTracking()
            join r in db.Releases.AsNoTracking() on e.ReleaseId equals r.ReleaseId
            where r.Sequence <= sequence
            select new { e.TargetKind, e.TargetId, e.Action, e.RevisionId, e.ReleaseId, r.Sequence }).ToListAsync();
        var rows = entries
            .GroupBy(e => (e.TargetKind, e.TargetId))
            .Select(g => g.MaxBy(e => e.Sequence)!)
            .Where(e => e.Action != ReleaseAction.Withdraw)
            .Select(e => new Publication { TargetKind = e.TargetKind, TargetId = e.TargetId, State = PublicationRowState.Published, RevisionId = e.RevisionId, ReleaseId = e.ReleaseId })
            .ToList();
        return await LoadPublishedAsync(db, rows);
    }

    /// <summary>
    /// 対象（種類・ID・操作・版）と、対象の現在の版、関連する公開データ（イベント以外の全公開行と対象自身の公開行）の版から作る。
    /// 無関係なイベントの公開では変わらない。
    /// </summary>
    private static string ComputeFingerprint(IReadOnlyList<PublishEntry> entries, IReadOnlyList<CandidateItem> items, List<Publication> publications)
    {
        var builder = new StringBuilder();
        foreach (var item in items.OrderBy(i => i.Entry.TargetKind, StringComparer.Ordinal).ThenBy(i => i.Entry.TargetId, StringComparer.Ordinal))
        {
            builder.Append($"E|{item.Entry.TargetKind}|{item.Entry.TargetId}|{item.Entry.Action}|{item.Entry.RevisionId}|{item.CurrentRevisionId}\n");
        }

        var targets = entries.Select(e => (e.TargetKind, e.TargetId)).ToHashSet();
        foreach (var row in publications
                     .Where(p => p.TargetKind != PublishTargetKind.Event || targets.Contains((p.TargetKind, p.TargetId)))
                     .OrderBy(p => p.TargetKind, StringComparer.Ordinal).ThenBy(p => p.TargetId, StringComparer.Ordinal))
        {
            builder.Append($"P|{row.TargetKind}|{row.TargetId}|{row.State}|{row.RevisionId}\n");
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())));
    }

    private static async Task<CandidateItem> LoadItemAsync(StudioDbContext db, PublishEntry entry, Publication? publication, Dictionary<string, Spot> spotRows)
    {
        (bool Exists, Guid? Current, string Label) state = entry.TargetKind switch
        {
            PublishTargetKind.Event => await EventStateAsync(db, entry.TargetId),
            PublishTargetKind.Occurrence => await OccurrenceStateAsync(db, entry.TargetId),
            PublishTargetKind.Categories => entry.TargetId == PublishTargetKind.Categories
                ? (true, (await db.CategoryListStates.AsNoTracking().SingleAsync()).CurrentRevisionId, "カテゴリ一覧")
                : (false, null, entry.TargetId),
            PublishTargetKind.Spot => spotRows.TryGetValue(entry.TargetId, out var spot)
                ? (true, spot.CurrentRevisionId, SpotLabel(spot.Name, spot.CanonicalId))
                : (false, null, entry.TargetId),
            _ => (false, null, entry.TargetId),
        };

        return new CandidateItem { Entry = entry, Label = state.Label, Exists = state.Exists, CurrentRevisionId = state.Current, Publication = publication };
    }

    private static async Task<(bool, Guid?, string)> EventStateAsync(StudioDbContext db, string id)
    {
        if (!Guid.TryParse(id, out var eventId))
        {
            return (false, null, id);
        }

        var row = await (
            from head in db.EventHeads.AsNoTracking()
            join revision in db.EventRevisions.AsNoTracking() on head.CurrentRevisionId equals revision.RevisionId
            where head.EventId == eventId
            select new { head.CurrentRevisionId, revision.Payload }).SingleOrDefaultAsync();
        return row is null ? (false, null, id) : (true, row.CurrentRevisionId, EventLabel(Deserialize<EventDraft>(row.Payload).Title));
    }

    private static async Task<(bool, Guid?, string)> OccurrenceStateAsync(StudioDbContext db, string id)
    {
        if (!Guid.TryParse(id, out var occurrenceId))
        {
            return (false, null, id);
        }

        var occurrence = await db.Occurrences.AsNoTracking().SingleOrDefaultAsync(o => o.Id == occurrenceId);
        return occurrence is null ? (false, null, id) : (true, occurrence.CurrentRevisionId, OccurrenceLabel(occurrence.Name));
    }

    /// <summary>公開中の版の内容をまとめて読み込む。</summary>
    public static async Task<PublishedSet> LoadPublishedAsync(StudioDbContext db, IReadOnlyList<Publication> rows)
    {
        var set = new PublishedSet();
        var eventRevisionIds = rows.Where(r => r.TargetKind == PublishTargetKind.Event).Select(r => r.RevisionId).ToList();
        var eventPayloads = await db.EventRevisions.AsNoTracking().Where(r => eventRevisionIds.Contains(r.RevisionId)).ToDictionaryAsync(r => r.RevisionId, r => r.Payload);
        var referenceRevisionIds = rows.Where(r => r.TargetKind != PublishTargetKind.Event).Select(r => r.RevisionId).ToList();
        var referencePayloads = await db.ReferenceRevisions.AsNoTracking().Where(r => referenceRevisionIds.Contains(r.RevisionId)).ToDictionaryAsync(r => r.RevisionId, r => r.Payload);

        foreach (var row in rows)
        {
            var payload = row.TargetKind == PublishTargetKind.Event ? eventPayloads.GetValueOrDefault(row.RevisionId) : referencePayloads.GetValueOrDefault(row.RevisionId);
            if (payload is null)
            {
                throw new InvalidOperationException($"公開中の版 {row.RevisionId}（{row.TargetKind}:{row.TargetId}）を読み込めません。");
            }

            Put(set, new PublishEntry(row.TargetKind, row.TargetId, ReleaseAction.Publish, row.RevisionId), row.RevisionId, DeserializePayload(row.TargetKind, payload));
        }

        return set;
    }

    /// <summary>指定した版の内容。対象の版でなければnull。</summary>
    public static async Task<object?> LoadPayloadAsync(StudioDbContext db, string kind, string targetId, Guid revisionId)
    {
        if (kind == PublishTargetKind.Event)
        {
            var revision = await db.EventRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.RevisionId == revisionId);
            return revision is null || revision.EventId.ToString() != targetId ? null : Deserialize<EventDraft>(revision.Payload);
        }

        var reference = await db.ReferenceRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.RevisionId == revisionId && r.Kind == kind);
        return reference is null || !string.Equals(reference.TargetId, targetId, StringComparison.Ordinal) ? null : DeserializePayload(kind, reference.Payload);
    }

    public static object DeserializePayload(string kind, string payload) => kind switch
    {
        PublishTargetKind.Event => Deserialize<EventDraft>(payload),
        PublishTargetKind.Occurrence => Deserialize<OccurrenceDraft>(payload),
        PublishTargetKind.Categories => Deserialize<List<CategoryDraft>>(payload),
        PublishTargetKind.Spot => Deserialize<SpotDraft>(payload),
        _ => throw new InvalidOperationException($"未知の公開対象 {kind}"),
    };

    private static void Put(PublishedSet set, PublishEntry entry, Guid revisionId, object payload)
    {
        switch (payload)
        {
            case EventDraft draft when Guid.TryParse(entry.TargetId, out var eventId):
                set.Events[eventId] = (revisionId, draft);
                break;
            case OccurrenceDraft draft when Guid.TryParse(entry.TargetId, out var occurrenceId):
                set.Occurrences[occurrenceId] = (revisionId, draft);
                break;
            case List<CategoryDraft> items:
                set.Categories = (revisionId, items);
                break;
            case SpotDraft draft:
                set.Spots[entry.TargetId] = (revisionId, draft);
                break;
        }
    }

    private static void Remove(PublishedSet set, PublishEntry entry)
    {
        switch (entry.TargetKind)
        {
            case PublishTargetKind.Event when Guid.TryParse(entry.TargetId, out var eventId):
                set.Events.Remove(eventId);
                break;
            case PublishTargetKind.Occurrence when Guid.TryParse(entry.TargetId, out var occurrenceId):
                set.Occurrences.Remove(occurrenceId);
                break;
            case PublishTargetKind.Categories:
                set.Categories = null;
                break;
            case PublishTargetKind.Spot:
                set.Spots.Remove(entry.TargetId);
                break;
        }
    }

    public static string LabelOf(string kind, string id, object payload) => payload switch
    {
        EventDraft draft => EventLabel(draft.Title),
        OccurrenceDraft draft => OccurrenceLabel(draft.Name),
        SpotDraft draft => SpotLabel(draft.Name, id),
        _ => kind == PublishTargetKind.Categories ? "カテゴリ一覧" : id,
    };

    public static string EventLabel(string? title) => string.IsNullOrWhiteSpace(title) ? "無題のイベント" : title.Trim();

    public static string OccurrenceLabel(string? name) => string.IsNullOrWhiteSpace(name) ? "無題の開催回" : name.Trim();

    public static string SpotLabel(string? name, string canonicalId) => string.IsNullOrWhiteSpace(name) ? canonicalId : name.Trim();

    private static T Deserialize<T>(string payload)
        => JsonSerializer.Deserialize<T>(payload, EventDraftRules.JsonOptions) ?? throw new InvalidOperationException("保存済みの版を読み取れません。");
}
