using System.Text.Json;
using StudioApi.Models;

namespace StudioApi.Publishing;

/// <summary>
/// 組み立てた bundle が nexus-mobile E2-5 §5.3 の不変条件を満たすかを、出来上がった JSON から確かめる（射影の自己検査）。
/// 射影の手順をなぞらず、bundle と地図の中身だけから判定する。iOS が受信時に行う検査と同じ観点で、配信前に食い違いを見つける。
/// 条件5（未知の ID を置き換えない）は受け手の規則、条件6（版の単調増加）は配信表の主キーとトリガーが保証する。
/// </summary>
public static class ParticipantBundleInvariants
{
    private static readonly HashSet<string> NodeTypes = new(StringComparer.Ordinal) { "indoor_node", "outdoor_node" };

    /// <param name="published">bundle の元にした公開データ（条件4と、地図の版の照合に使う）。</param>
    /// <returns>破れている条件の説明。空なら合格。</returns>
    public static IReadOnlyList<string> Check(byte[] bundle, PublishedSet published)
    {
        var errors = new List<string>();
        using var document = JsonDocument.Parse(bundle);
        var root = document.RootElement;

        var map = root.GetProperty("map");
        var features = new Dictionary<string, List<JsonElement>>(StringComparer.Ordinal);
        var floors = new Dictionary<string, string?>(StringComparer.Ordinal);
        if ((map.ValueKind == JsonValueKind.Object) != published.Map.HasValue)
        {
            errors.Add("map の有無が公開中の地図と一致しません。");
        }

        if (map.ValueKind == JsonValueKind.Object)
        {
            // 地図は公開中の版をそのまま載せる（E2-5 §5.2）。dataset_sha256 は取り込んだ payload 文字列全体の SHA-256 で、
            // bundle から読み直した geojson の文字列（前後の空白を含まない）からは再計算できないため、版の値と照合する。
            if (published.Map is { } current
                && (map.GetProperty("dataset_version").GetInt64() != current.Dataset.Version
                    || map.GetProperty("dataset_sha256").GetString() != current.Dataset.Checksum))
            {
                errors.Add("map.dataset_version・dataset_sha256 が公開中の地図の版と一致しません。");
            }

            var geojson = map.GetProperty("geojson");

            foreach (var floor in geojson.GetProperty("nexus").GetProperty("floors").EnumerateArray())
            {
                floors[floor.GetProperty("id").GetString()!] = Text(floor, "building_id");
            }

            foreach (var feature in geojson.GetProperty("features").EnumerateArray())
            {
                var id = feature.GetProperty("id").GetString()!;
                if (!features.TryGetValue(id, out var list))
                {
                    features[id] = list = [];
                }

                list.Add(feature);
            }
        }

        string? TypeOf(JsonElement feature) => Text(feature.GetProperty("properties"), "feature_type");
        bool Exists(string id, Func<string?, bool> type) => features.TryGetValue(id, out var list) && list.Any(f => type(TypeOf(f)));

        // 条件1：spots[].id は一意。
        var spotIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var spot in root.GetProperty("spots").EnumerateArray())
        {
            var id = spot.GetProperty("id").GetString()!;
            if (!spotIds.Add(id))
            {
                errors.Add($"spots[].id が重複しています（{id}）。");
            }

            // 条件3：placement と目的地Featureの一致。
            var destinations = features.TryGetValue(id, out var same)
                ? same.Where(f => TypeOf(f) is { } t && IdEntityKind.Destinations.Contains(t)).ToList()
                : [];
            var placement = spot.GetProperty("placement");
            if (placement.ValueKind == JsonValueKind.Null)
            {
                if (destinations.Count > 0)
                {
                    errors.Add($"spot {id} は地図に目的地があるのに placement が null です。");
                }

                continue;
            }

            if (map.ValueKind != JsonValueKind.Object || destinations.Count != 1)
            {
                errors.Add($"spot {id} の placement に対応する目的地Featureが地図に1件ありません（{destinations.Count}件）。");
                continue;
            }

            CheckPlacement(id, placement, destinations[0], floors, Exists, errors);
        }

        // 条件4：含まれるのは公開中（取り下げ以外）の spot だけで、漏れもない。
        var expected = published.Spots
            .Where(s => s.Value.Draft.Utilization != SpotUtilization.Withdrawn)
            .Select(s => s.Key).ToHashSet(StringComparer.Ordinal);
        foreach (var id in spotIds.Except(expected))
        {
            errors.Add($"公開中ではない spot {id} が含まれています。");
        }

        foreach (var id in expected.Except(spotIds))
        {
            errors.Add($"公開中の spot {id} が含まれていません。");
        }

        // 条件2：alias は一意で、spot・地図の ID と重ならず、解決先は bundle 内の spot。
        var aliases = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in root.GetProperty("id_aliases").EnumerateArray())
        {
            var alias = entry.GetProperty("alias").GetString()!;
            var target = entry.GetProperty("canonical_id").GetString()!;
            if (!aliases.Add(alias))
            {
                errors.Add($"id_aliases の alias {alias} が重複しています。");
            }

            if (spotIds.Contains(alias) || features.ContainsKey(alias) || floors.ContainsKey(alias))
            {
                errors.Add($"alias {alias} が spot・地図の ID と重なっています。");
            }

            if (!spotIds.Contains(target))
            {
                errors.Add($"alias {alias} の解決先 {target} が bundle の spot にありません。");
            }
        }

        return errors;
    }

    private static void CheckPlacement(string id, JsonElement placement, JsonElement feature, Dictionary<string, string?> floors,
        Func<string, Func<string?, bool>, bool> exists, List<string> errors)
    {
        var properties = feature.GetProperty("properties");
        var type = Text(properties, "feature_type")!;
        var buildingId = Text(placement, "building_id");
        var floorId = Text(placement, "floor_id");
        var accessNode = Text(placement, "access_node_id");

        if (Text(placement, "feature_type") != type)
        {
            errors.Add($"spot {id} の placement.feature_type が目的地Feature（{type}）と違います。");
        }

        // 値は目的地Featureの値と一致する（E2-5 §5.2 の表）。
        var expectedBuilding = type switch { "building" => id, "landmark" => null, _ => Text(properties, "building_id") };
        var expectedFloor = type is "room" or "formal_entrance" ? Text(properties, "floor_id") : null;
        var expectedNode = type == "formal_entrance" ? null : Text(properties, "access_node_id");
        if (buildingId != expectedBuilding || floorId != expectedFloor || accessNode != expectedNode)
        {
            errors.Add($"spot {id} の placement の建物・階・到達ノードが目的地Featureと一致しません。");
        }

        if (buildingId is null ? type != "landmark" : !exists(buildingId, t => t == "building"))
        {
            errors.Add($"spot {id} の placement.building_id（{buildingId ?? "null"}）が地図の建物を指していません。");
        }

        if (floorId is null ? type is "room" or "formal_entrance" : !floors.TryGetValue(floorId, out var owner) || owner != buildingId)
        {
            errors.Add($"spot {id} の placement.floor_id（{floorId ?? "null"}）が地図の階、またはその建物と合いません。");
        }

        if (accessNode is not null && !exists(accessNode, t => t is not null && NodeTypes.Contains(t)))
        {
            errors.Add($"spot {id} の placement.access_node_id（{accessNode}）が地図のノードにありません。");
        }

        var geometry = feature.GetProperty("geometry");
        var point = placement.GetProperty("point");
        var isPoint = geometry.GetProperty("type").GetString() == "Point";
        // 数値の表記を比べる（geojson 側の空白の有無に左右されない）。
        static IEnumerable<string> Numbers(JsonElement array) => array.EnumerateArray().Select(n => n.GetRawText());
        if (isPoint ? point.ValueKind != JsonValueKind.Array || !Numbers(point).SequenceEqual(Numbers(geometry.GetProperty("coordinates")))
                    : point.ValueKind != JsonValueKind.Null)
        {
            errors.Add($"spot {id} の placement.point が目的地Featureの座標と一致しません。");
        }
    }

    private static string? Text(JsonElement element, string name)
        => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
