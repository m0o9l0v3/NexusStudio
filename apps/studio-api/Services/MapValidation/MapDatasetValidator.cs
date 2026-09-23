using System.Text;
using System.Text.Json;
using Json.Schema;
using NetTopologySuite.Geometries;

namespace StudioApi.Services.MapValidation;

/// <summary>Pure validator for E2-2. No persistence, publication, source rewriting, or network access.</summary>
public sealed class MapDatasetValidator
{
    private static readonly Lazy<JsonSchema> Schema = new(() =>
    {
        using var source = typeof(MapDatasetValidator).Assembly.GetManifestResourceStream("StudioApi.MapDatasetSchema.json")!;
        using var json = JsonDocument.Parse(source);
        return JsonSchema.Build(json.RootElement.Clone(), new BuildOptions { Dialect = Dialect.Draft202012, SchemaRegistry = new() });
    });

    public DatasetValidationResult Validate(string payload, DatasetValidationContext? context = null, CancellationToken cancellationToken = default)
    {
        context ??= new();
        var errors = new List<ValidationFinding>();
        void Error(string code, string path, string message, string? id = null) => errors.Add(new(code, path, message, id));
        DatasetValidationResult Result() => new(errors.Distinct().OrderBy(e => e.Path, StringComparer.Ordinal)
            .ThenBy(e => e.Code, StringComparer.Ordinal).ThenBy(e => e.CanonicalId, StringComparer.Ordinal).ToArray(), context.ForPublication);
        if (payload is null || Encoding.UTF8.GetByteCount(payload) > 8 * 1024 * 1024)
        {
            Error("invalid_payload_size", "", "payload は8MiB以下のJSON文字列が必要です。");
            return Result();
        }
        JsonDocument document;
        try { document = JsonDocument.Parse(payload); }
        catch (JsonException) { Error("invalid_json", "", "JSONを読み取れません。"); return Result(); }
        using (document)
        {
            cancellationToken.ThrowIfCancellationRequested();
            CheckJson(document.RootElement, "");
            if (errors.Count > 0) return Result();
            var schemaResult = Schema.Value.Evaluate(document.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List });
            if (!schemaResult.IsValid)
            {
                SchemaErrors(schemaResult);
                if (errors.Count == 0) Error("schema_violation", "", "GeoJSONスキーマに適合しません。");
                return Result();
            }

            var root = document.RootElement;
            var floors = new Dictionary<string, (string Building, string Path)>(StringComparer.Ordinal);
            var features = new Dictionary<string, Feature>(StringComparer.Ordinal);
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var floorIndex = 0;
            foreach (var floor in root.GetProperty("nexus").GetProperty("floors").EnumerateArray())
            {
                var id = Text(floor, "id");
                var building = Text(floor, "building_id");
                var path = $"/nexus/floors/{floorIndex++}";
                if (!ids.Add(id)) Error("duplicate_canonical_id", path + "/id", "canonical IDが重複しています。", id);
                floors.TryAdd(id, (building, path));
                if (!id.StartsWith(building + "_", StringComparison.Ordinal)) Error("parent_id_mismatch", path, "フロアIDと建物IDが一致しません。", id);
            }
            var index = 0;
            foreach (var value in root.GetProperty("features").EnumerateArray())
            {
                cancellationToken.ThrowIfCancellationRequested();
                var id = Text(value, "id");
                var path = $"/features/{index++}";
                if (!ids.Add(id)) Error("duplicate_canonical_id", path + "/id", "canonical IDが重複しています。", id);
                var properties = value.GetProperty("properties");
                Geometry? geometry = null;
                try
                {
                    geometry = DatasetGeometry.Read(value.GetProperty("geometry"));
                    if (geometry.IsEmpty || !geometry.IsValid || (geometry is LineString line && line.Length == 0))
                        Error("invalid_geometry", path + "/geometry", "空形状、退化または自己交差などの不正な形状です。", id);
                    if (geometry is Polygon polygon && polygon.IsValid && !DatasetGeometry.CorrectOrientation(polygon))
                        Error("ring_orientation", path + "/geometry", "外環は反時計回り、内環は時計回りが必要です。", id);
                    foreach (var p in geometry.Coordinates)
                        if (Math.Abs(p.X - Math.Round(p.X, 6)) > 1e-10 || Math.Abs(p.Y - Math.Round(p.Y, 6)) > 1e-10)
                        { Error("coordinate_precision", path + "/geometry", "座標は小数6桁に丸める必要があります。", id); break; }
                }
                catch (ArgumentException) { Error("invalid_geometry", path + "/geometry", "閉じていない環などの不正な形状です。", id); }
                features.TryAdd(id, new(id, Text(properties, "feature_type"), properties, geometry, path));
            }

            foreach (var (id, floor) in floors)
                if (!features.TryGetValue(floor.Building, out var building) || building.Type != "building")
                    Error("undefined_reference", floor.Path + "/building_id", "建物Featureが存在しません。", id);

            foreach (var f in features.Values)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var p = f.Properties;
                if (p.TryGetProperty("building_id", out var buildingValue))
                {
                    var buildingId = buildingValue.GetString()!;
                    Reference(f, "building_id", "building");
                    var floorId = Text(p, "floor_id");
                    if (!floors.TryGetValue(floorId, out var floor)) Error("undefined_reference", f.Path + "/properties/floor_id", "フロアが存在しません。", f.Id);
                    else if (floor.Building != buildingId) Error("parent_id_mismatch", f.Path, "フロアと建物の所属が一致しません。", f.Id);
                    var prefix = f.Type == "formal_entrance" ? buildingId + "_ent_" : floorId + (f.Type == "walking_path" ? "_e_" : "_n_");
                    if (!f.Id.StartsWith(prefix, StringComparison.Ordinal)) Error("parent_id_mismatch", f.Path + "/id", "IDと所属の接頭辞が一致しません。", f.Id);
                }
                if (f.Type == "formal_entrance")
                {
                    Reference(f, "outside_node_id", "outdoor_node");
                    var inside = Reference(f, "inside_node_id", "indoor_node");
                    if (inside is not null && Text(inside.Properties, "floor_id") != Text(p, "floor_id"))
                        Error("parent_id_mismatch", f.Path, "入口と内側ノードのフロアが一致しません。", f.Id);
                }
                if (f.Type == "walking_path")
                {
                    var indoor = Text(p, "scope") == "indoor";
                    var from = Reference(f, "from_node_id", indoor ? "indoor_node" : "outdoor_node");
                    var to = Reference(f, "to_node_id", indoor ? "indoor_node" : "outdoor_node");
                    if (Text(p, "from_node_id") == Text(p, "to_node_id")) Error("self_loop_path", f.Path, "経路の始点と終点が同じです。", f.Id);
                    foreach (var node in new[] { from, to }.OfType<Feature>())
                        if (indoor && Text(node.Properties, "floor_id") != Text(p, "floor_id"))
                            Error("parent_id_mismatch", f.Path, "経路とノードのフロアが一致しません。", f.Id);
                    if (f.Geometry is LineString line && from?.Geometry is Point first && to?.Geometry is Point last &&
                        (!line.StartPoint.EqualsExact(first) || !line.EndPoint.EqualsExact(last)))
                        Error("path_endpoint_mismatch", f.Path + "/geometry", "経路端点が接続ノードの座標と一致しません。", f.Id);
                }
            }
            CheckGraph(features, context, Error);
            CheckIdentities(ids, context, Error);
            CheckPublication(features, floors.Keys.ToArray(), context, Error);
            if (context.ForPublication && !features.Values.Any(f => IsNode(f.Type)))
                Error("empty_navigation_graph", "/features", "公開用の経路ノードがありません。");
            return Result();

            Feature? Reference(Feature f, string property, string expected)
            {
                var id = Text(f.Properties, property);
                if (!features.TryGetValue(id, out var target)) { Error("undefined_reference", f.Path + "/properties/" + property, "参照先が存在しません。", f.Id); return null; }
                if (target.Type != expected) { Error("reference_type_mismatch", f.Path + "/properties/" + property, "参照先の種別が一致しません。", f.Id); return null; }
                return target;
            }
        }

        void CheckJson(JsonElement value, string path)
        {
            if (value.ValueKind == JsonValueKind.Number && (!value.TryGetDouble(out var number) || !double.IsFinite(number)))
                Error("non_finite_number", path, "有限の数値が必要です。");
            if (value.ValueKind == JsonValueKind.Object)
            {
                var names = new HashSet<string>(StringComparer.Ordinal);
                foreach (var property in value.EnumerateObject())
                {
                    var location = path + "/" + property.Name.Replace("~", "~0").Replace("/", "~1");
                    if (!names.Add(property.Name)) Error("duplicate_json_member", location, "JSONのキーが重複しています。");
                    CheckJson(property.Value, location);
                }
            }
            else if (value.ValueKind == JsonValueKind.Array)
            { var i = 0; foreach (var item in value.EnumerateArray()) CheckJson(item, path + "/" + i++); }
        }
        void SchemaErrors(EvaluationResults result)
        {
            if (result.IsValid) return;
            if (result.Errors is not null) foreach (var error in result.Errors)
                Error("schema_violation", result.InstanceLocation.ToString(), error.Key + ": " + error.Value);
            if (result.Details is not null) foreach (var detail in result.Details) SchemaErrors(detail);
        }
    }

    private sealed record Feature(string Id, string Type, JsonElement Properties, Geometry? Geometry, string Path);
    private static string Text(JsonElement value, string property) => value.GetProperty(property).GetString()!;
    private static bool IsNode(string type) => type is "indoor_node" or "outdoor_node";
    private delegate void AddError(string code, string path, string message, string? id = null);

    private static void CheckGraph(Dictionary<string, Feature> features, DatasetValidationContext context, AddError error)
    {
        var graph = features.Values.Where(f => IsNode(f.Type)).ToDictionary(f => f.Id, _ => new HashSet<string>(StringComparer.Ordinal), StringComparer.Ordinal);
        var incident = graph.Keys.ToDictionary(k => k, _ => 0, StringComparer.Ordinal);
        var edges = new HashSet<(string From, string To)>();
        void Add(string from, string to, Feature source)
        {
            if (!graph.ContainsKey(from) || !graph.ContainsKey(to)) return;
            if (!edges.Add((from, to))) error("duplicate_edge", source.Path, "同じ向きのノード間接続が重複しています。", source.Id);
            graph[from].Add(to);
            if (from != to) { incident[from]++; incident[to]++; }
        }
        foreach (var f in features.Values)
        {
            if (f.Type == "walking_path")
            {
                var from = Text(f.Properties, "from_node_id"); var to = Text(f.Properties, "to_node_id");
                Add(from, to, f);
                if (f.Properties.GetProperty("bidirectional").GetBoolean()) Add(to, from, f);
            }
            if (f.Type == "formal_entrance")
            {
                var outside = Text(f.Properties, "outside_node_id"); var inside = Text(f.Properties, "inside_node_id");
                Add(outside, inside, f); Add(inside, outside, f);
            }
        }
        foreach (var (id, count) in incident) if (count == 0) error("isolated_node", features[id].Path, "接続されていないノードです。", id);
        if (context.StartNodeIds is null || context.StartNodeIds.Count == 0)
        {
            if (context.ForPublication) error("missing_validation_context", "/context/startNodeIds", "到達性検証の出発ノードを明示してください。");
            return;
        }
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<string>();
        foreach (var id in context.StartNodeIds)
            if (string.IsNullOrWhiteSpace(id) || !graph.ContainsKey(id)) error("undefined_start_node", "/context/startNodeIds", "出発ノードが存在しません。", id);
            else if (visited.Add(id)) queue.Enqueue(id);
        while (queue.TryDequeue(out var current)) foreach (var next in graph[current]) if (visited.Add(next)) queue.Enqueue(next);
        foreach (var id in graph.Keys) if (!visited.Contains(id)) error("unreachable_node", features[id].Path, "指定された出発ノードから到達できません。", id);
    }

    private static void CheckIdentities(HashSet<string> ids, DatasetValidationContext context, AddError error)
    {
        if (context.ForPublication && (context.DatabaseSpots is null || context.PublishedNavigationSpotIds is null || context.Aliases is null || context.OtherReservedCanonicalIds is null))
            error("missing_validation_context", "/context/identities", "DB Spot・公開ナビID・alias・他の予約済みIDのスナップショットが必要です。");
        var spots = context.DatabaseSpots ?? [];
        var aliases = context.Aliases ?? [];
        var aliasCodes = new HashSet<string>(StringComparer.Ordinal);
        var reserved = new HashSet<string>(ids, StringComparer.Ordinal);
        reserved.UnionWith(context.OtherReservedCanonicalIds ?? []);
        foreach (var alias in aliases)
        {
            if (string.IsNullOrWhiteSpace(alias.AliasCode)) error("invalid_alias", "/context/aliases", "空のaliasは使用できません。");
            if (!aliasCodes.Add(alias.AliasCode)) error("duplicate_alias", "/context/aliases", "aliasが重複しています。", alias.AliasCode);
            if (reserved.Contains(alias.AliasCode)) error("alias_canonical_collision", "/context/aliases", "aliasとcanonical IDが衝突しています。", alias.AliasCode);
        }
        foreach (var group in spots.GroupBy(s => s.Id)) if (group.Count() > 1) error("duplicate_spot_row", "/context/databaseSpots", "DB行IDが重複しています。");
        foreach (var group in spots.GroupBy(s => s.Code, StringComparer.Ordinal))
        {
            if (group.Count() > 1) error("duplicate_spot_code", "/context/databaseSpots", "異なるDB行が同じcanonical IDを使用しています。", group.Key);
            if (!ids.Contains(group.Key) && (group.Any(s => s.IsPublished) || !reserved.Contains(group.Key)))
                error("undefined_spot_canonical_id", "/context/databaseSpots", "Spot.Codeに対応するcanonical IDがありません。", group.Key);
        }
        foreach (var alias in aliases)
        {
            var targets = spots.Where(s => s.Id == alias.SpotId).ToArray();
            if (targets.Length != 1) error("alias_target_missing", "/context/aliases", "aliasの参照先Spotを一意に特定できません。", alias.AliasCode);
            else if (aliasCodes.Contains(targets[0].Code)) error("alias_chain", "/context/aliases", "aliasの参照先が別のaliasになっています。", alias.AliasCode);
        }
        if (context.PublishedNavigationSpotIds is not null && context.DatabaseSpots is not null)
        {
            var navigation = new HashSet<string>(StringComparer.Ordinal);
            var published = spots.Where(s => s.IsPublished).Select(s => s.Code).ToHashSet(StringComparer.Ordinal);
            foreach (var id in context.PublishedNavigationSpotIds)
            {
                if (!navigation.Add(id)) error("duplicate_navigation_id", "/context/publishedNavigationSpotIds", "ナビIDが重複しています。", id);
                if (!ids.Contains(id)) error("undefined_navigation_id", "/context/publishedNavigationSpotIds", "ナビIDがcanonical IDに一致しません。", id);
                if (!published.Contains(id)) error("navigation_spot_mismatch", "/context/publishedNavigationSpotIds", "対応する公開DB Spotがありません。", id);
            }
            foreach (var id in published) if (!navigation.Contains(id)) error("missing_navigation_spot", "/context/databaseSpots", "公開DB Spotに対応する公開ナビIDがありません。", id);
        }
    }

    private static void CheckPublication(Dictionary<string, Feature> features, string[] floorIds, DatasetValidationContext context, AddError error)
    {
        // Do not inherit case-insensitive comparers from a caller's dictionary.
        var expectedTimes = context.ExpectedPathSeconds?.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);
        var transforms = context.FloorTransforms?.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);
        Polygon? boundary = null;
        if (context.CampusBoundaryGeoJson is not null)
        {
            try
            {
                using var document = JsonDocument.Parse(context.CampusBoundaryGeoJson);
                boundary = DatasetGeometry.Read(document.RootElement) as Polygon;
                if (boundary is null || boundary.IsEmpty || !boundary.IsValid) throw new ArgumentException();
            }
            catch (Exception ex) when (ex is JsonException or ArgumentException or InvalidOperationException or KeyNotFoundException or FormatException)
            { boundary = null; error("invalid_validation_context", "/context/campusBoundaryGeoJson", "有効なCRS84 Polygonの許容範囲が必要です。"); }
        }
        else if (context.ForPublication) error("missing_validation_context", "/context/campusBoundaryGeoJson", "承認されたキャンパス許容範囲が必要です。");

        var origin = context.EnuOrigin;
        if (origin is not null && (!double.IsFinite(origin.Longitude) || !double.IsFinite(origin.Latitude) || Math.Abs(origin.Longitude) > 180 || Math.Abs(origin.Latitude) > 90))
        { error("invalid_validation_context", "/context/enuOrigin", "ENU原点の座標が不正です。"); origin = null; }
        if (origin is null && context.ForPublication) error("missing_validation_context", "/context/enuOrigin", "メートル単位の距離検証に使用するENU原点が必要です。");
        var entranceTolerance = Tolerance(context.EntranceMaxGapMetres, "entranceMaxGapMetres");
        var pathTolerance = Tolerance(context.PathDistanceToleranceMetres, "pathDistanceToleranceMetres");
        foreach (var f in features.Values)
        {
            if (f.Geometry is not { IsValid: true, IsEmpty: false } geometry) continue;
            if (boundary is not null && !boundary.Covers(geometry)) error("outside_campus", f.Path + "/geometry", "キャンパス許容範囲から外れています。", f.Id);
            if (f.Type == "formal_entrance" && origin is not null && entranceTolerance is not null)
                foreach (var key in new[] { "outside_node_id", "inside_node_id" })
                    if (features.TryGetValue(Text(f.Properties, key), out var node) && node.Geometry is Point point &&
                        DatasetGeometry.Distance(geometry.Coordinate, point.Coordinate, origin) > entranceTolerance)
                        error("entrance_connection_gap", f.Path + "/properties/" + key, "入口と接続ノードの距離が許容値を超えています。", f.Id);
            if (f.Type == "walking_path")
            {
                if (origin is not null && pathTolerance is not null)
                {
                    var points = geometry.Coordinates;
                    var length = Enumerable.Range(1, points.Length - 1).Sum(i => DatasetGeometry.Distance(points[i - 1], points[i], origin));
                    if (Math.Abs(length - f.Properties.GetProperty("distance_m").GetDouble()) > pathTolerance)
                        error("path_distance_mismatch", f.Path + "/properties/distance_m", "ENU上の経路長とdistance_mが許容値を超えて異なります。", f.Id);
                }
                if (expectedTimes?.TryGetValue(f.Id, out var expected) == true)
                {
                    if (!double.IsFinite(expected) || expected <= 0 || Math.Abs(expected - f.Properties.GetProperty("estimated_seconds").GetDouble()) > 1e-9)
                        error("path_seconds_mismatch", f.Path + "/properties/estimated_seconds", "元データの所要時間と一致しません。", f.Id);
                }
                else if (context.ForPublication) error("missing_validation_context", "/context/expectedPathSeconds", "経路の元データに基づく所要時間が必要です。", f.Id);
            }
        }
        foreach (var floorId in floorIds)
        {
            if (transforms?.TryGetValue(floorId, out var evidence) != true || evidence is null)
            {
                if (context.ForPublication) error("missing_transform_evidence", "/context/floorTransforms", "フロアの座標変換検証結果が必要です。", floorId);
                continue;
            }
            var actual = new[] { evidence.RoundTripMaxMetres, evidence.FitRmsMetres, evidence.FitMaxMetres, evidence.CheckMaxMetres, evidence.RoundingMaxMetres };
            var limits = new[] { .05, 2, 3, 3, .10 };
            if (actual.Where((value, i) => !double.IsFinite(value) || value < 0 || value > limits[i]).Any())
                error("transform_tolerance_exceeded", "/context/floorTransforms", "E1-5の座標変換許容値を満たしません。", floorId);
        }
        double? Tolerance(double? value, string key)
        {
            if (value is null) { if (context.ForPublication) error("missing_validation_context", "/context/" + key, "承認された許容値を指定してください。"); return null; }
            if (!double.IsFinite(value.Value) || value < 0) { error("invalid_validation_context", "/context/" + key, "許容値は0以上の有限数が必要です。"); return null; }
            return value;
        }
    }
}
