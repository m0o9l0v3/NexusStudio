using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;

namespace StudioApi.Reference;

/// <summary>ある開催日・カテゴリ・Spotを参照しているイベントの開催枠。</summary>
public sealed record SlotReference(
    Guid EventId,
    string? EventTitle,
    Guid SlotId,
    Guid? OcDayId,
    string? TimeMode,
    string? Start,
    string? End,
    string SlotStatus);

/// <summary>
/// イベントの現在の下書き（head が指す Revision）から、開催日・カテゴリ・Spotへの参照を引く。
/// 公開版の参照は公開機能（Step 4）で加える。
/// </summary>
public sealed class EventReferenceIndex
{
    private readonly List<(Guid EventId, EventDraft Draft)> _drafts;

    private EventReferenceIndex(List<(Guid, EventDraft)> drafts) => _drafts = drafts;

    public static async Task<EventReferenceIndex> LoadAsync(StudioDbContext db)
    {
        var rows = await (
            from head in db.EventHeads.AsNoTracking()
            join revision in db.EventRevisions.AsNoTracking() on head.CurrentRevisionId equals revision.RevisionId
            select new { head.EventId, revision.Payload }).ToListAsync();

        return new EventReferenceIndex(rows
            .Select(row => (row.EventId, JsonSerializer.Deserialize<EventDraft>(row.Payload, EventDraftRules.JsonOptions)!))
            .ToList());
    }

    public IEnumerable<SlotReference> SlotsOnDays(IEnumerable<Guid> dayIds)
    {
        var wanted = dayIds.ToHashSet();
        return AllSlots().Where(slot => slot.OcDayId is { } dayId && wanted.Contains(dayId));
    }

    public IEnumerable<SlotReference> SlotsAtSpot(string canonicalId)
        => _drafts.SelectMany(entry => entry.Draft.Slots
            .Where(slot => slot.Venues.Any(venue => string.Equals(venue.CanonicalSpotId, canonicalId, StringComparison.Ordinal)))
            .Select(slot => ToReference(entry.EventId, entry.Draft, slot)));

    /// <summary>下書きのいずれかの枠が参照している開催日。</summary>
    public HashSet<Guid> ReferencedDayIds() => AllSlots().Select(slot => slot.OcDayId).OfType<Guid>().ToHashSet();

    public int EventsInOccurrence(Guid occurrenceId) => _drafts.Count(entry => entry.Draft.OccurrenceId == occurrenceId);

    public int EventsInCategory(Guid categoryId) => _drafts.Count(entry => entry.Draft.CategoryId == categoryId);

    private IEnumerable<SlotReference> AllSlots()
        => _drafts.SelectMany(entry => entry.Draft.Slots.Select(slot => ToReference(entry.EventId, entry.Draft, slot)));

    private static SlotReference ToReference(Guid eventId, EventDraft draft, EventSlot slot)
        => new(eventId, draft.Title, slot.SlotId, slot.OcDayId, slot.TimeMode, slot.Fixed?.Start, slot.Fixed?.End, slot.Status);
}
