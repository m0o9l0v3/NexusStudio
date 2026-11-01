using System.Text.Json;
using System.Text.Json.Serialization;

namespace StudioApi.Services.MapValidation;

/// <summary>
/// 地図の版ごとの根拠（決定事項31 D3、deploy/map-validation/README.md の B）。地図を作った変換工程の出力から得る値で、Studio は作らない。
/// 取り込み時に GeoJSON と一緒に受け取り、版と一緒に保存して公開判定に渡す。
/// </summary>
public sealed record MapDatasetEvidence(
    IReadOnlyDictionary<string, double> ExpectedPathSeconds,
    IReadOnlyDictionary<string, FloorTransformEvidence> FloorTransforms)
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        RespectRequiredConstructorParameters = true,
        RespectNullableAnnotations = true,
    };

    /// <summary>形式だけを確かめて読む。値の妥当性（一致・上限）は検証器が調べる。</summary>
    public static MapDatasetEvidence Parse(string json)
    {
        try
        {
            var evidence = JsonSerializer.Deserialize<MapDatasetEvidence>(json, Options)
                ?? throw new InvalidOperationException("根拠のファイルが空です。");
            // canonical ID は大文字小文字を区別する。呼び出し側の比較子を引き継がない。
            return new MapDatasetEvidence(
                new Dictionary<string, double>(evidence.ExpectedPathSeconds, StringComparer.Ordinal),
                new Dictionary<string, FloorTransformEvidence>(evidence.FloorTransforms, StringComparer.Ordinal));
        }
        catch (JsonException exception)
        {
            throw new InvalidOperationException($"根拠のファイルを読み取れません: {exception.Message}", exception);
        }
    }

    public DatasetValidationContext ApplyTo(DatasetValidationContext context) => context with
    {
        ExpectedPathSeconds = ExpectedPathSeconds,
        FloorTransforms = FloorTransforms,
    };
}
