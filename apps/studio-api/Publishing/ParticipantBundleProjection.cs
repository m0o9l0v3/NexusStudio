using System.Text.Encodings.Web;
using System.Text.Json;
using StudioApi.Models;

namespace StudioApi.Publishing;

/// <summary>
/// 公開データから参加者向け bundle（nexus-mobile E2-5 §5、E2-5 改訂1、schema_version 2.1.0）を組み立てる（§3.3）。
/// 公開中の spot・地図・カテゴリ一覧・開催回・イベントから全量で作り、差分は作らない。位置（placement）は地図の目的地Featureから写すだけで、推測で埋めない（§5.4）。
/// 終日の枠の時刻は、同じ公開データの開催日の一般公開時間から入れる（決定事項28 S4-3、改訂1 §2）。
/// </summary>
public static class ParticipantBundleProjection
{
    public const string SchemaVersion = "2.1.0";

    /// <summary>硬い上限（非圧縮の UTF-8 バイト数。E2-5 §3.4）。超えると公開しない。</summary>
    public const int HardLimitBytes = 10 * 1024 * 1024;

    /// <summary>警告の閾値（絶対値、仮の値。E2-5 §3.4）。</summary>
    public const int WarningBytes = 2 * 1024 * 1024;

    /// <summary>警告の閾値（直前の bundle との比、仮の値。E2-5 §3.4）。</summary>
    public const double GrowthWarningRatio = 1.5;

    private static readonly JsonWriterOptions WriterOptions = new()
    {
        // 日本語の名称を \uXXXX にせず UTF-8 のまま書く（大きさを抑える）。配信先は JSON として読むだけで HTML に埋め込まない。
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// 公開の結果、bundle に入る公開データが変わるか（そのときだけ新しい版を作る。§2）。
    /// 改訂1 §2.2 で、spot・地図に加えてイベント・開催回・カテゴリ一覧の公開・取り下げ・復旧も対象にした。いまは全ての公開対象が bundle に入る。
    /// </summary>
    public static bool Affects(PublishCandidate candidate)
        => candidate.Items.Any(i => i.Entry.TargetKind is PublishTargetKind.Spot or PublishTargetKind.Map
            or PublishTargetKind.Event or PublishTargetKind.Occurrence or PublishTargetKind.Categories);

    /// <param name="published">公開後の公開データ。</param>
    /// <param name="reservations">ID 予約表（alias の出典。§5.5）。</param>
    public static byte[] Build(PublishedSet published, IdReservationSnapshot reservations, long bundleVersion, Guid releaseId, DateTimeOffset publishedAt)
    {
        var destinations = published.Map is { } map ? Destinations(map.Dataset.Payload) : null;
        // withdrawn の spot は含めない（§5.2 utilization）。
        var spots = published.Spots
            .Where(s => s.Value.Draft.Utilization != SpotUtilization.Withdrawn)
            .OrderBy(s => s.Key, StringComparer.Ordinal)
            .ToList();
        var spotIds = spots.Select(s => s.Key).ToHashSet(StringComparer.Ordinal);
        // 解決先がこの版で公開中の spot である alias だけ（§3.3 の5）。
        var aliases = reservations.Aliases
            .Where(a => spotIds.Contains(a.CanonicalId))
            .OrderBy(a => a.Alias, StringComparer.Ordinal)
            .ToList();
        foreach (var (alias, _) in aliases)
        {
            if (spotIds.Contains(alias) || destinations?.Ids.Contains(alias) == true)
            {
                // §5.3 の2。予約表の規則で起きないはずだが、起きたら配信しない。
                throw new InvalidOperationException($"alias {alias} が spot・地図の ID と重なっています。bundle を作れません。");
            }
        }

        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteStartObject("nexus_bundle");
            writer.WriteString("schema_version", SchemaVersion);
            writer.WriteNumber("bundle_version", bundleVersion);
            writer.WriteString("release_id", releaseId.ToString("D"));
            writer.WriteString("published_at", publishedAt.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", System.Globalization.CultureInfo.InvariantCulture));
            writer.WriteEndObject();

            writer.WriteStartArray("spots");
            foreach (var (id, (_, draft)) in spots)
            {
                writer.WriteStartObject();
                writer.WriteString("id", id);
                writer.WriteString("name", draft.Name?.Trim());
                writer.WriteString("kind", draft.Kind);
                writer.WriteString("description", draft.Description);
                writer.WriteStartArray("search_aliases");
                foreach (var alias in draft.Aliases)
                {
                    writer.WriteStringValue(alias);
                }

                writer.WriteEndArray();
                writer.WriteString("utilization", draft.Utilization);
                writer.WritePropertyName("placement");
                if (destinations is not null && destinations.Features.TryGetValue(id, out var destination))
                {
                    WritePlacement(writer, id, destination);
                }
                else
                {
                    writer.WriteNullValue();
                }

                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WriteStartArray("id_aliases");
            foreach (var (alias, canonicalId) in aliases)
            {
                writer.WriteStartObject();
                writer.WriteString("alias", alias);
                writer.WriteString("canonical_id", canonicalId);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WritePropertyName("map");
            if (published.Map is { } current)
            {
                writer.WriteStartObject();
                writer.WriteNumber("dataset_version", current.Dataset.Version);
                writer.WriteString("dataset_sha256", current.Dataset.Checksum);
                writer.WritePropertyName("geojson");
                // 取り込んで検証した GeoJSON をそのまま入れる（dataset_sha256 はこの文字列の SHA-256）。
                writer.WriteRawValue(current.Dataset.Payload);
                writer.WriteEndObject();
            }
            else
            {
                writer.WriteNullValue();
            }

            WriteCategories(writer, published);
            WriteOccurrences(writer, published);
            WriteEvents(writer, published);
            writer.WriteEndObject();
        }

        return buffer.ToArray();
    }

    /// <summary>参加者向けの id と name だけを、カテゴリ一覧の順に書く（改訂1 §2。新規選択停止は Studio 内部の扱いなので書かない）。</summary>
    private static void WriteCategories(Utf8JsonWriter writer, PublishedSet published)
    {
        writer.WriteStartArray("categories");
        foreach (var category in published.Categories?.Items ?? [])
        {
            writer.WriteStartObject();
            writer.WriteString("id", category.Id.ToString("D"));
            writer.WriteString("name", category.Name?.Trim());
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }

    /// <summary>開催回は最も早い開催日の順（同じなら id の順）。開催日は開催回の中の順のまま書く。</summary>
    private static void WriteOccurrences(Utf8JsonWriter writer, PublishedSet published)
    {
        writer.WriteStartArray("occurrences");
        var occurrences = published.Occurrences
            .OrderBy(o => o.Value.Draft.Days.Select(d => d.Date).Where(d => d is not null).Min() ?? DateOnly.MaxValue)
            .ThenBy(o => o.Key.ToString("D"), StringComparer.Ordinal);
        foreach (var (id, (_, draft)) in occurrences)
        {
            writer.WriteStartObject();
            writer.WriteString("id", id.ToString("D"));
            writer.WriteString("name", draft.Name?.Trim());
            writer.WriteStartArray("days");
            foreach (var day in draft.Days)
            {
                writer.WriteStartObject();
                writer.WriteString("id", day.Id.ToString("D"));
                writer.WriteString("date", Date(day.Date));
                writer.WriteString("public_start", day.PublicStart);
                writer.WriteString("public_end", day.PublicEnd);
                writer.WriteString("status", day.Status);
                writer.WriteString("cancel_note", Note(day.CancelNote));
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }

    /// <summary>公開中のイベントを id の順に書く。取り下げたイベントは公開データに無いので入らない。中止の枠は除かない（改訂1 §2）。</summary>
    private static void WriteEvents(Utf8JsonWriter writer, PublishedSet published)
    {
        writer.WriteStartArray("events");
        foreach (var (id, (_, draft)) in published.Events.OrderBy(e => e.Key.ToString("D"), StringComparer.Ordinal))
        {
            writer.WriteStartObject();
            writer.WriteString("id", id.ToString("D"));
            writer.WriteString("title", draft.Title?.Trim());
            writer.WriteString("description", Note(draft.Description));
            writer.WriteString("category_id", draft.CategoryId?.ToString("D"));
            writer.WriteString("occurrence_id", draft.OccurrenceId?.ToString("D"));
            writer.WriteStartArray("slots");
            foreach (var slot in draft.Slots)
            {
                var day = slot.OcDayId is { } dayId ? published.FindDay(dayId)?.Day : null;
                // 終日は開催日の一般公開時間を入れ、iOS に解決させない（S4-3）。解決できなければ null のままにし、不変条件の検査で止める。
                var (start, end) = slot.TimeMode == "allDay" ? (day?.PublicStart, day?.PublicEnd) : (slot.Fixed?.Start, slot.Fixed?.End);
                writer.WriteStartObject();
                writer.WriteString("id", slot.SlotId.ToString("D"));
                writer.WriteString("day_id", slot.OcDayId?.ToString("D"));
                writer.WriteString("date", Date(day?.Date));
                writer.WriteString("time_mode", slot.TimeMode);
                writer.WriteString("start", start);
                writer.WriteString("end", end);
                writer.WriteString("participation", slot.Participation);
                writer.WriteString("status", slot.Status);
                writer.WriteString("cancel_note", Note(slot.CancelNote));
                writer.WriteStartArray("venues");
                foreach (var venue in slot.Venues)
                {
                    writer.WriteStartObject();
                    // canonical ID は受け取った文字列のまま書く（正規化しない）。
                    writer.WriteString("spot_id", venue.CanonicalSpotId);
                    writer.WriteString("note", Note(venue.Note));
                    writer.WriteEndObject();
                }

                writer.WriteEndArray();
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }

    private static string? Date(DateOnly? date)
        => date?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>空白だけの補足・説明は「無い」（null）として書き、空文字で埋めない（Schema の note・description）。</summary>
    private static string? Note(string? text)
        => string.IsNullOrWhiteSpace(text) ? null : text;

    /// <summary>目的地Featureの値を placement に写す（§5.2 の表、E1-4 改訂1 §4）。</summary>
    private static void WritePlacement(Utf8JsonWriter writer, string id, JsonElement feature)
    {
        var properties = feature.GetProperty("properties");
        var type = properties.GetProperty("feature_type").GetString()!;
        var geometry = feature.GetProperty("geometry");
        writer.WriteStartObject();
        writer.WriteString("feature_type", type);
        writer.WriteString("building_id", type switch
        {
            "building" => id,
            "landmark" => null,
            _ => Text(properties, "building_id"),
        });
        writer.WriteString("floor_id", type is "room" or "formal_entrance" ? Text(properties, "floor_id") : null);
        writer.WritePropertyName("point");
        // 建物（Polygon）は重心などを推測せず null にする。
        if (geometry.GetProperty("type").GetString() == "Point")
        {
            geometry.GetProperty("coordinates").WriteTo(writer);
        }
        else
        {
            writer.WriteNullValue();
        }

        // 正式入口の到達ノードは端末が入口の接続から求める（E1-4 改訂1 §4.3）。
        writer.WriteString("access_node_id", type == "formal_entrance" ? null : Text(properties, "access_node_id"));
        writer.WriteEndObject();
    }

    private static string? Text(JsonElement properties, string name)
        => properties.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private sealed record DestinationIndex(Dictionary<string, JsonElement> Features, HashSet<string> Ids);

    /// <summary>地図の目的地Feature（building・formal_entrance・room・landmark）と、地図に出てくる全 ID。</summary>
    private static DestinationIndex Destinations(string payload)
    {
        // 書き出しの間だけ使うため、要素を複製して文書を閉じてもよいようにする。
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement.Clone();
        var features = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var floor in root.GetProperty("nexus").GetProperty("floors").EnumerateArray())
        {
            ids.Add(floor.GetProperty("id").GetString()!);
        }

        foreach (var feature in root.GetProperty("features").EnumerateArray())
        {
            var id = feature.GetProperty("id").GetString()!;
            ids.Add(id);
            if (IdEntityKind.Destinations.Contains(feature.GetProperty("properties").GetProperty("feature_type").GetString()!))
            {
                features[id] = feature;
            }
        }

        return new DestinationIndex(features, ids);
    }
}
