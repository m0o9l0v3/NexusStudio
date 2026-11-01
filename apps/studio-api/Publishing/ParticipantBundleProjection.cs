using System.Text.Encodings.Web;
using System.Text.Json;
using StudioApi.Models;

namespace StudioApi.Publishing;

/// <summary>
/// 公開データから参加者向け bundle（nexus-mobile E2-5 §5、schema_version 2.0.0）を組み立てる（§3.3）。
/// 公開中の spot 全件と公開中の地図1件から全量で作り、差分は作らない。位置（placement）は地図の目的地Featureから写すだけで、推測で埋めない（§5.4）。
/// </summary>
public static class ParticipantBundleProjection
{
    public const string SchemaVersion = "2.0.0";

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

    /// <summary>公開の結果、spot または地図の公開データが変わるか（そのときだけ新しい版を作る。§2）。</summary>
    public static bool Affects(PublishCandidate candidate)
        => candidate.Items.Any(i => i.Entry.TargetKind is PublishTargetKind.Spot or PublishTargetKind.Map);

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

            writer.WriteEndObject();
        }

        return buffer.ToArray();
    }

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
