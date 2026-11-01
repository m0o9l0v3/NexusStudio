using System.Text.Json;

namespace StudioApi.Services.MapValidation;

/// <summary>地図の GeoJSON に含まれる ID の一覧（検証器に合格した payload を前提に、ID と種別だけを読む）。</summary>
public sealed class MapFeatureIndex
{
    /// <summary>フロアの ID → 所属建物の ID。</summary>
    public required IReadOnlyDictionary<string, string> Floors { get; init; }
    /// <summary>Feature の ID → feature_type。</summary>
    public required IReadOnlyDictionary<string, string> Features { get; init; }

    public static MapFeatureIndex Parse(string payload)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        var floors = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var floor in root.GetProperty("nexus").GetProperty("floors").EnumerateArray())
        {
            floors[floor.GetProperty("id").GetString()!] = floor.GetProperty("building_id").GetString()!;
        }

        var features = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var feature in root.GetProperty("features").EnumerateArray())
        {
            features[feature.GetProperty("id").GetString()!] = feature.GetProperty("properties").GetProperty("feature_type").GetString()!;
        }

        return new MapFeatureIndex { Floors = floors, Features = features };
    }
}
