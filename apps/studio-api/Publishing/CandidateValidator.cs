using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Publishing;

/// <summary>検証の所見1件（11 VA-05：対象・理由・修正先）。</summary>
/// <param name="Severity">blocking（公開阻止）／warning（要確認）／info（情報）。</param>
/// <param name="TargetKind">所見が指す対象の種類（修正先）。</param>
/// <param name="Path">対象の中の位置（例：slots[1].venues[0]）。対象全体ならnull。</param>
public sealed record ValidationFinding(
    string Severity,
    string Code,
    string Message,
    string TargetKind,
    string TargetId,
    string TargetLabel,
    string? Path);

public static class FindingSeverity
{
    public const string Blocking = "blocking";
    public const string Warning = "warning";
    public const string Info = "info";
}

/// <summary>
/// 公開候補の検証（07 §6 E01〜E10・W01・W03、08、11 §6）。
/// 選んでいない下書きの問題は見ない（RA-01）。検証処理が例外で終わった場合は呼び出し側が「検証失敗」として扱い、合格にしない（RA-07）。
/// テストで検証処理の失敗を再現できるよう、中身は仮想メソッドにしている。
/// </summary>
public class CandidateValidator(TimeProvider timeProvider)
{
    private static readonly TimeZoneInfo Campus = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    public virtual IReadOnlyList<ValidationFinding> Validate(PublishCandidate candidate)
    {
        var findings = new List<ValidationFinding>();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), Campus).DateTime);
        var seen = new HashSet<(string, string)>();

        foreach (var item in candidate.Items)
        {
            var entry = item.Entry;
            var add = Adder(findings, entry.TargetKind, entry.TargetId, item.Label);

            if (!seen.Add((entry.TargetKind, entry.TargetId)))
            {
                add(FindingSeverity.Blocking, "duplicate_target", "同じ対象が2回含まれています。", null);
                continue;
            }

            if (!PublishTargetKind.All.Contains(entry.TargetKind) || entry.Action is not (ReleaseAction.Publish or ReleaseAction.Withdraw))
            {
                add(FindingSeverity.Blocking, "invalid_entry", "公開できない対象か操作です。", null);
                continue;
            }

            if (!item.Exists)
            {
                add(FindingSeverity.Blocking, "target_not_found", "対象が見つかりません。", null);
                continue;
            }

            var state = PublicationState.Of(item.Publication, item.CurrentRevisionId);
            if (entry.Action == ReleaseAction.Withdraw)
            {
                ValidateWithdraw(candidate, item, state, add);
                continue;
            }

            if (entry.RevisionId is null || entry.RevisionId != item.CurrentRevisionId || item.CandidatePayload is null)
            {
                // 確認した版と現在の下書きが違う（別の画面で保存された）。古い確認結果で公開しない（07 E06）。
                add(FindingSeverity.Blocking, "stale_revision", "確認した後に下書きが保存されました。最新の保存内容で確認し直してください。", null);
                continue;
            }

            if (state == PublicationState.Published)
            {
                add(FindingSeverity.Blocking, "no_changes", "公開中の内容と同じです。公開する変更がありません。", null);
                continue;
            }

            switch (item.CandidatePayload)
            {
                case EventDraft draft:
                    ValidateEvent(candidate, Guid.Parse(entry.TargetId), draft, today, add);
                    break;
                case OccurrenceDraft draft:
                    ValidateOccurrence(candidate, Guid.Parse(entry.TargetId), draft, add, findings);
                    break;
                case List<CategoryDraft> items:
                    ValidateCategories(candidate, items, add);
                    break;
                case SpotDraft draft:
                    ValidateSpot(candidate, entry.TargetId, draft, add);
                    break;
            }
        }

        return findings;
    }

    private delegate void Add(string severity, string code, string message, string? path);

    private static Add Adder(List<ValidationFinding> findings, string kind, string id, string label)
        => (severity, code, message, path) => findings.Add(new ValidationFinding(severity, code, message, kind, id, label, path));

    private static void ValidateWithdraw(PublishCandidate candidate, CandidateItem item, string state, Add add)
    {
        var entry = item.Entry;
        if (!PublicationState.IsLive(state))
        {
            add(FindingSeverity.Blocking, "not_published", "公開中ではないため取り下げられません。", null);
            return;
        }

        // 取り下げでは下書きの入力不足を阻止理由にしない（07 EV-25、11 §6）。公開中のイベントが使っている参照先だけは止める。
        switch (entry.TargetKind)
        {
            case PublishTargetKind.Categories:
                add(FindingSeverity.Blocking, "withdraw_not_supported", "カテゴリ一覧は取り下げられません。使わないカテゴリは「新規選択停止」にしてください。", null);
                break;
            case PublishTargetKind.Occurrence:
                var occurrenceId = Guid.Parse(entry.TargetId);
                var usingOccurrence = candidate.After.Events.Values.Where(e => e.Draft.OccurrenceId == occurrenceId).Select(e => PublishCandidate.EventLabel(e.Draft.Title)).ToList();
                if (usingOccurrence.Count > 0)
                {
                    add(FindingSeverity.Blocking, "occurrence_in_use", $"公開中のイベント（{Summarize(usingOccurrence)}）がこの開催回を使っています。先にイベントを取り下げるか、別の開催回へ変更して公開してください。", null);
                }

                break;
            case PublishTargetKind.Spot:
                var usingSpot = candidate.After.Events.Values
                    .Where(e => e.Draft.Slots.Any(s => s.Venues.Any(v => string.Equals(v.CanonicalSpotId, entry.TargetId, StringComparison.Ordinal))))
                    .Select(e => PublishCandidate.EventLabel(e.Draft.Title)).ToList();
                if (usingSpot.Count > 0)
                {
                    add(FindingSeverity.Blocking, "spot_in_use", $"公開中のイベント（{Summarize(usingSpot)}）がこのSpotを会場にしています。先にイベントの会場を変更して公開してください。", null);
                }

                break;
        }
    }

    private static void ValidateEvent(PublishCandidate candidate, Guid eventId, EventDraft draft, DateOnly today, Add add)
    {
        var published = candidate.Before.Events.TryGetValue(eventId, out var before) ? before.Draft : null;

        // E01：共通情報
        if (string.IsNullOrWhiteSpace(draft.Title))
        {
            add(FindingSeverity.Blocking, "title_required", "タイトルを入力してください。", "title");
        }

        if (string.IsNullOrWhiteSpace(draft.Description))
        {
            add(FindingSeverity.Blocking, "description_required", "説明を入力してください。", "description");
        }

        // E10：カテゴリ
        if (draft.CategoryId is not { } categoryId)
        {
            add(FindingSeverity.Blocking, "category_required", "カテゴリを選んでください。", "categoryId");
        }
        else if (candidate.After.Categories?.Items.FirstOrDefault(c => c.Id == categoryId) is not { } category)
        {
            add(FindingSeverity.Blocking, "category_unpublished", "カテゴリが公開されていません。先にカテゴリ一覧を公開してください。", "categoryId");
        }
        else if (!category.Selectable && published?.CategoryId != categoryId)
        {
            add(FindingSeverity.Blocking, "category_not_selectable", $"カテゴリ「{category.Name}」は新規選択停止のため、新たに割り当てられません。", "categoryId");
        }

        // E09：開催回
        OccurrenceDraft? occurrence = null;
        if (draft.OccurrenceId is not { } occurrenceId)
        {
            add(FindingSeverity.Blocking, "occurrence_required", "開催回を選んでください。", "occurrenceId");
        }
        else if (!candidate.After.Occurrences.TryGetValue(occurrenceId, out var publishedOccurrence))
        {
            add(FindingSeverity.Blocking, "occurrence_unpublished", "開催回が公開されていません。先に開催回を公開してください。", "occurrenceId");
        }
        else
        {
            occurrence = publishedOccurrence.Draft;
        }

        // E02：開催枠
        if (draft.Slots.Count == 0)
        {
            add(FindingSeverity.Blocking, "slots_required", "開催枠を1つ以上追加してください。", "slots");
        }

        var publishedVenues = published?.Slots.SelectMany(s => s.Venues).Select(v => v.CanonicalSpotId).ToHashSet(StringComparer.Ordinal) ?? [];
        for (var i = 0; i < draft.Slots.Count; i++)
        {
            var slot = draft.Slots[i];
            var path = $"slots[{i}]";
            var day = slot.OcDayId is { } dayId ? occurrence?.Days.FirstOrDefault(d => d.Id == dayId) : null;

            if (slot.OcDayId is null)
            {
                add(FindingSeverity.Blocking, "slot_day_required", "開催日を選んでください。", $"{path}.ocDayId");
            }
            else if (occurrence is not null && day is null)
            {
                add(FindingSeverity.Blocking, "slot_day_unpublished", "開催日が、公開する開催回に含まれていません。開催回を公開するか、開催日を選び直してください。", $"{path}.ocDayId");
            }

            // E08：時間方式・参加案内
            if (slot.TimeMode is null)
            {
                add(FindingSeverity.Blocking, "slot_time_mode_required", "時間方式（時間指定／終日）を選んでください。", $"{path}.timeMode");
            }

            if (slot.Participation is null)
            {
                add(FindingSeverity.Blocking, "slot_participation_required", "参加案内（開始時刻に集合／随時参加可）を選んでください。", $"{path}.participation");
            }

            var hours = day is null ? null : ValidHours(day.PublicStart, day.PublicEnd);
            if (slot.TimeMode == "fixed")
            {
                if (slot.Fixed?.Start is not { } start || slot.Fixed.End is not { } end)
                {
                    add(FindingSeverity.Blocking, "slot_time_required", "開始時刻と終了時刻を入力してください。", $"{path}.fixed");
                }
                else if (string.CompareOrdinal(end, start) <= 0)
                {
                    add(FindingSeverity.Blocking, "slot_time_order", "終了時刻は開始時刻より後にしてください。", $"{path}.fixed");
                }
                else if (hours is { } open && (string.CompareOrdinal(start, open.Start) < 0 || string.CompareOrdinal(end, open.End) > 0))
                {
                    // W01：一般公開時間の前後へはみ出す
                    add(FindingSeverity.Warning, "slot_outside_public_hours", $"一般公開時間（{open.Start}–{open.End}）の外にかかっています。意図した時間か確認してください。", $"{path}.fixed");
                }
            }
            else if (slot.TimeMode == "allDay" && day is not null && hours is null)
            {
                // E07：終日の参照元となる開催時間が無い。時刻を推定しない。
                add(FindingSeverity.Blocking, "slot_all_day_hours_missing", $"{day.Date:M月d日}の一般公開時間が登録されていないため、終日の時刻が決まりません。開催回の開催時間を登録して公開してください。", $"{path}.timeMode");
            }

            // E03：会場
            if (slot.Venues.Count == 0)
            {
                add(FindingSeverity.Blocking, "slot_venue_required", "会場を1つ以上追加してください。", $"{path}.venues");
            }

            var venueIds = new HashSet<string>(StringComparer.Ordinal);
            for (var j = 0; j < slot.Venues.Count; j++)
            {
                var venue = slot.Venues[j];
                var venuePath = $"{path}.venues[{j}]";
                if (!venueIds.Add(venue.CanonicalSpotId))
                {
                    add(FindingSeverity.Blocking, "slot_venue_duplicate", $"同じ会場（{venue.CanonicalSpotId}）が重複しています。", venuePath);
                    continue;
                }

                // E04：Spot。公開中でないSpotを自動で公開しない（RA-02）。
                if (!candidate.SpotRows.TryGetValue(venue.CanonicalSpotId, out var spotRow))
                {
                    add(FindingSeverity.Blocking, "venue_spot_missing", $"Spot「{venue.CanonicalSpotId}」が見つかりません。会場を選び直してください。", venuePath);
                }
                else if (!candidate.After.Spots.TryGetValue(venue.CanonicalSpotId, out var spot))
                {
                    add(FindingSeverity.Blocking, "venue_spot_unpublished", $"Spot「{PublishCandidate.SpotLabel(spotRow.Name, spotRow.CanonicalId)}」が公開されていません。Spotを公開するか、会場を変更してください。", venuePath);
                }
                else if (spot.Draft.Utilization == SpotUtilization.Withdrawn || spotRow.Utilization == SpotUtilization.Withdrawn)
                {
                    add(FindingSeverity.Blocking, "venue_spot_withdrawn", $"Spot「{PublishCandidate.SpotLabel(spot.Draft.Name, venue.CanonicalSpotId)}」は取り下げ済みです。会場を変更してください。", venuePath);
                }
                else if (spot.Draft.Utilization == SpotUtilization.NoNewSelection && !publishedVenues.Contains(venue.CanonicalSpotId))
                {
                    add(FindingSeverity.Blocking, "venue_spot_not_selectable", $"Spot「{PublishCandidate.SpotLabel(spot.Draft.Name, venue.CanonicalSpotId)}」は新規選択停止のため、新たに会場にできません。", venuePath);
                }
            }

            // W03：過去の枠を追加・日時変更して公開する（無変更の過去枠では警告しない）
            if (day?.Date is { } date && date < today)
            {
                var old = published?.Slots.FirstOrDefault(s => s.SlotId == slot.SlotId);
                if (old is null || old.OcDayId != slot.OcDayId || old.TimeMode != slot.TimeMode || old.Fixed != slot.Fixed)
                {
                    add(FindingSeverity.Warning, "slot_in_past", $"{date:M月d日}は過去の日付です。過去の枠を追加・変更して公開してよいか確認してください。", path);
                }
            }
        }
    }

    private static void ValidateOccurrence(PublishCandidate candidate, Guid occurrenceId, OccurrenceDraft draft, Add add, List<ValidationFinding> findings)
    {
        if (string.IsNullOrWhiteSpace(draft.Name))
        {
            add(FindingSeverity.Blocking, "occurrence_name_required", "開催回の名称を入力してください。", "name");
        }

        if (draft.Days.Count == 0)
        {
            add(FindingSeverity.Warning, "occurrence_no_days", "開催日がありません。イベントはこの開催回の枠を公開できません。", "days");
        }

        for (var i = 0; i < draft.Days.Count; i++)
        {
            var day = draft.Days[i];
            if ((day.PublicStart is null) != (day.PublicEnd is null))
            {
                add(FindingSeverity.Blocking, "day_hours_incomplete", $"{day.Date:M月d日}の一般公開時間は、開始と終了の両方を入力するか、両方とも空にしてください。", $"days[{i}]");
            }
            else if (day.PublicStart is { } start && day.PublicEnd is { } end && string.CompareOrdinal(end, start) <= 0)
            {
                add(FindingSeverity.Blocking, "day_hours_order", $"{day.Date:M月d日}の終了時刻は開始時刻より後にしてください。", $"days[{i}]");
            }
        }

        var previous = candidate.Before.Occurrences.TryGetValue(occurrenceId, out var before) ? before.Draft : null;

        // 公開中のイベントへの影響（08 OC-11）。終日枠の時刻は配信時にこの開催時間から解決される（28 S4-3）。
        foreach (var (eventId, (_, eventDraft)) in candidate.After.Events.Where(e => e.Value.Draft.OccurrenceId == occurrenceId))
        {
            var eventLabel = PublishCandidate.EventLabel(eventDraft.Title);
            var addToEvent = Adder(findings, PublishTargetKind.Event, eventId.ToString(), eventLabel);
            for (var i = 0; i < eventDraft.Slots.Count; i++)
            {
                var slot = eventDraft.Slots[i];
                if (slot.OcDayId is not { } dayId)
                {
                    continue;
                }

                var day = draft.Days.FirstOrDefault(d => d.Id == dayId);
                if (day is null)
                {
                    add(FindingSeverity.Blocking, "day_in_use_by_published_event", $"公開中のイベント「{eventLabel}」の枠が使っている開催日を削除しようとしています。", "days");
                    continue;
                }

                var hours = ValidHours(day.PublicStart, day.PublicEnd);
                var oldDay = previous?.Days.FirstOrDefault(d => d.Id == dayId);
                if (slot.TimeMode == "allDay")
                {
                    if (hours is null)
                    {
                        add(FindingSeverity.Blocking, "all_day_hours_removed", $"公開中のイベント「{eventLabel}」の終日枠（{day.Date:M月d日}）が参照する一般公開時間がなくなります。", "days");
                    }
                    else if (oldDay is null || oldDay.PublicStart != day.PublicStart || oldDay.PublicEnd != day.PublicEnd)
                    {
                        addToEvent(FindingSeverity.Info, "all_day_times_change", $"終日枠（{day.Date:M月d日}）の時刻が {Hours(oldDay)} から {hours.Value.Start}–{hours.Value.End} に変わります。", $"slots[{i}]");
                    }
                }
                else if (slot.TimeMode == "fixed" && hours is { } open && slot.Fixed is { Start: { } start, End: { } end }
                         && (string.CompareOrdinal(start, open.Start) < 0 || string.CompareOrdinal(end, open.End) > 0))
                {
                    addToEvent(FindingSeverity.Warning, "slot_outside_public_hours", $"{day.Date:M月d日}の枠（{start}–{end}）が新しい一般公開時間（{open.Start}–{open.End}）の外にかかります。", $"slots[{i}]");
                }

                if (day.Status == OcDayStatus.Cancelled && oldDay?.Status != OcDayStatus.Cancelled)
                {
                    addToEvent(FindingSeverity.Info, "day_cancelled", $"{day.Date:M月d日}の中止により、この枠も中止として表示されます。", $"slots[{i}]");
                }
            }
        }
    }

    private static void ValidateCategories(PublishCandidate candidate, IReadOnlyList<CategoryDraft> items, Add add)
    {
        for (var i = 0; i < items.Count; i++)
        {
            if (string.IsNullOrWhiteSpace(items[i].Name))
            {
                add(FindingSeverity.Blocking, "category_name_required", "カテゴリ名が空です。", $"items[{i}]");
            }
        }

        foreach (var eventDraft in candidate.After.Events.Values.Select(e => e.Draft))
        {
            if (eventDraft.CategoryId is { } categoryId && items.All(c => c.Id != categoryId))
            {
                add(FindingSeverity.Blocking, "category_in_use", $"公開中のイベント「{PublishCandidate.EventLabel(eventDraft.Title)}」が使っているカテゴリが一覧にありません。", "items");
            }
        }
    }

    private static void ValidateSpot(PublishCandidate candidate, string canonicalId, SpotDraft draft, Add add)
    {
        if (string.IsNullOrWhiteSpace(draft.Name))
        {
            add(FindingSeverity.Blocking, "spot_name_required", "名称を入力してください。", "name");
        }

        var users = candidate.After.Events.Values
            .Where(e => e.Draft.Slots.Any(s => s.Venues.Any(v => string.Equals(v.CanonicalSpotId, canonicalId, StringComparison.Ordinal))))
            .Select(e => PublishCandidate.EventLabel(e.Draft.Title)).ToList();
        if (users.Count > 0)
        {
            add(FindingSeverity.Info, "spot_used_by_published_events", $"公開中のイベント（{Summarize(users)}）の会場表示にも反映されます。", null);
        }

        if (draft.Utilization == SpotUtilization.NoNewSelection)
        {
            add(FindingSeverity.Info, "spot_no_new_selection", "新規選択停止として公開します。公開中のイベントの会場参照は維持します。", "utilization");
        }
    }

    /// <summary>開始・終了が揃っていて前後が正しい開催時間。</summary>
    private static (string Start, string End)? ValidHours(string? start, string? end)
        => start is not null && end is not null && string.CompareOrdinal(end, start) > 0 ? (start, end) : null;

    private static string Hours(OcDayDraft? day)
        => day is { PublicStart: { } start, PublicEnd: { } end } ? $"{start}–{end}" : "未公開";

    private static string Summarize(IReadOnlyList<string> labels)
        => labels.Count <= 3 ? string.Join("、", labels) : $"{string.Join("、", labels.Take(3))} ほか{labels.Count - 3}件";
}
