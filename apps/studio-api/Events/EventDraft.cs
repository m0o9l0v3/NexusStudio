using System.Text.Json;
using System.Text.RegularExpressions;

namespace StudioApi.Events;

/// <summary>
/// イベント下書きの内容（Revision payload `studio.event/1`。15 v01 §4.2）。
/// 下書きは入力不足でも保存できる。拒否するのは「システムで扱えない入力」だけ（07 §6）。
/// </summary>
public sealed record EventDraft(
    string SchemaVersion,
    string? Title,
    string? Description,
    Guid? CategoryId,
    Guid? OccurrenceId,
    IReadOnlyList<EventSlot> Slots);

/// <param name="SlotId">安定ID。複製で新しく発行し、日時の変更では維持する（07 EV-32/33）。</param>
/// <param name="OcDayId">開催日。日付はここから決まる。</param>
/// <param name="TimeMode">`fixed`（時間を指定）／`allDay`（終日）。未選択はnull。</param>
/// <param name="Fixed">時間指定の時刻。終日では持たない（実時刻は開催日から解決し、payloadへ焼き込まない）。</param>
/// <param name="Participation">`atStart`／`anytime`。未選択はnull。終日でも自動設定しない（07 EV-42）。</param>
/// <param name="Venues">会場。配列の順序が表示順。</param>
public sealed record EventSlot(
    Guid SlotId,
    Guid? OcDayId,
    string? TimeMode,
    FixedTime? Fixed,
    string? Participation,
    string Status,
    string? CancelNote,
    IReadOnlyList<SlotVenue> Venues);

/// <summary>キャンパス現地時刻（JST）の "HH:mm"。下書きでは片方だけの入力も保存できる。</summary>
public sealed record FixedTime(string? Start, string? End);

/// <param name="CanonicalSpotId">Spotのcanonical ID。大文字小文字・空白を含め、受け取った文字列をそのまま保持する。</param>
public sealed record SlotVenue(string CanonicalSpotId, string? Note);

public sealed record DraftProblem(string Path, string Code, string Message);

public static partial class EventDraftRules
{
    public const string SchemaVersion = "studio.event/1";

    // 異常に大きな入力から保存処理を守るための上限。業務上の文字数制限（未決定）ではない。
    public const int MaxTitleLength = 500;
    public const int MaxDescriptionLength = 20_000;
    public const int MaxSlots = 200;
    public const int MaxVenuesPerSlot = 50;
    public const int MaxNoteLength = 500;
    public const int MaxCanonicalIdLength = 128;

    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly string[] TimeModes = ["fixed", "allDay"];
    private static readonly string[] Participations = ["atStart", "anytime"];
    private static readonly string[] SlotStatuses = ["normal", "cancelled"];

    [GeneratedRegex("^([01][0-9]|2[0-3]):[0-5][0-9]$")]
    private static partial Regex TimePattern();

    public static IReadOnlyList<DraftProblem> Validate(EventDraft? draft)
    {
        var problems = new List<DraftProblem>();
        if (draft is null)
        {
            problems.Add(new("draft", "required", "下書きの内容がありません。"));
            return problems;
        }

        if (draft.SchemaVersion != SchemaVersion)
        {
            problems.Add(new("schemaVersion", "unsupported_schema", $"schemaVersion は {SchemaVersion} を指定してください。"));
        }

        if (draft.Title is { Length: > MaxTitleLength })
        {
            problems.Add(new("title", "too_long", $"タイトルは{MaxTitleLength}文字以内にしてください。"));
        }

        if (draft.Description is { Length: > MaxDescriptionLength })
        {
            problems.Add(new("description", "too_long", $"説明は{MaxDescriptionLength}文字以内にしてください。"));
        }

        if (draft.Slots is null)
        {
            problems.Add(new("slots", "required", "開催枠の一覧がありません（0件の場合は空の配列）。"));
            return problems;
        }

        if (draft.Slots.Count > MaxSlots)
        {
            problems.Add(new("slots", "too_many", $"開催枠は{MaxSlots}件以内にしてください。"));
        }

        var slotIds = new HashSet<Guid>();
        for (var i = 0; i < draft.Slots.Count; i++)
        {
            ValidateSlot(draft.Slots[i], $"slots[{i}]", slotIds, problems);
        }

        return problems;
    }

    private static void ValidateSlot(EventSlot? slot, string path, HashSet<Guid> slotIds, List<DraftProblem> problems)
    {
        if (slot is null)
        {
            problems.Add(new(path, "required", "開催枠の内容がありません。"));
            return;
        }

        if (slot.SlotId == Guid.Empty || !slotIds.Add(slot.SlotId))
        {
            problems.Add(new($"{path}.slotId", "invalid_slot_id", "開催枠のIDが空か、同じイベント内で重複しています。"));
        }

        if (slot.TimeMode is not null && !TimeModes.Contains(slot.TimeMode))
        {
            problems.Add(new($"{path}.timeMode", "invalid_value", "時間方式は fixed か allDay を指定してください。"));
        }

        if (slot.Fixed is not null)
        {
            if (slot.TimeMode != "fixed")
            {
                problems.Add(new($"{path}.fixed", "inconsistent", "時刻は時間方式が fixed の場合だけ指定できます。"));
            }

            foreach (var (value, name) in new[] { (slot.Fixed.Start, "start"), (slot.Fixed.End, "end") })
            {
                if (value is not null && !TimePattern().IsMatch(value))
                {
                    problems.Add(new($"{path}.fixed.{name}", "invalid_time", "時刻は HH:mm 形式で指定してください。"));
                }
            }
        }

        if (slot.Participation is not null && !Participations.Contains(slot.Participation))
        {
            problems.Add(new($"{path}.participation", "invalid_value", "参加案内は atStart か anytime を指定してください。"));
        }

        if (!SlotStatuses.Contains(slot.Status))
        {
            problems.Add(new($"{path}.status", "invalid_value", "開催枠の状態は normal か cancelled を指定してください。"));
        }

        if (slot.CancelNote is { Length: > MaxNoteLength })
        {
            problems.Add(new($"{path}.cancelNote", "too_long", $"中止案内は{MaxNoteLength}文字以内にしてください。"));
        }

        if (slot.Venues is null)
        {
            problems.Add(new($"{path}.venues", "required", "会場の一覧がありません（0件の場合は空の配列）。"));
            return;
        }

        if (slot.Venues.Count > MaxVenuesPerSlot)
        {
            problems.Add(new($"{path}.venues", "too_many", $"1つの開催枠の会場は{MaxVenuesPerSlot}件以内にしてください。"));
        }

        // 同じ枠に同じSpotを重ねない（07 AC06）。比較は序数比較で、大文字小文字の違いは別のSpotとして扱う。
        var canonicalIds = new HashSet<string>(StringComparer.Ordinal);
        for (var v = 0; v < slot.Venues.Count; v++)
        {
            var venue = slot.Venues[v];
            var venuePath = $"{path}.venues[{v}]";
            if (venue is null || string.IsNullOrWhiteSpace(venue.CanonicalSpotId) || venue.CanonicalSpotId.Length > MaxCanonicalIdLength)
            {
                problems.Add(new($"{venuePath}.canonicalSpotId", "invalid_reference", "会場のcanonical IDが空か、長すぎます。"));
                continue;
            }

            if (!canonicalIds.Add(venue.CanonicalSpotId))
            {
                problems.Add(new($"{venuePath}.canonicalSpotId", "duplicate_venue", "同じ開催枠に同じ会場が重複しています。"));
            }

            if (venue.Note is { Length: > MaxNoteLength })
            {
                problems.Add(new($"{venuePath}.note", "too_long", $"会場補足は{MaxNoteLength}文字以内にしてください。"));
            }
        }
    }
}
