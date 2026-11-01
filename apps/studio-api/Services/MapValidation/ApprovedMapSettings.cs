using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StudioApi.Services.MapValidation;

/// <summary>
/// 地図の公開判定に使う、オーナーが承認した設定値（決定事項31、deploy/map-validation/README.md）。
/// 値を推測・補完しない。承認前（status が approved でない）の設定は1つも検証器へ渡さず、
/// 公開判定は検証器の missing_validation_context で止まる。
/// </summary>
public sealed record ApprovedMapSettings
{
    public const string Approved = "approved";
    public const string Draft = "draft";

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        // enuOrigin の経度・緯度の書き忘れを 0 にしない（0 は実在する座標として検証を通ってしまう）。
        RespectRequiredConstructorParameters = true,
    };

    /// <summary>draft／approved。</summary>
    public string Status { get; init; } = Draft;
    public string? ApprovedBy { get; init; }
    public DateOnly? ApprovedAt { get; init; }
    /// <summary>キャンパスの許容範囲（GeoJSON の Polygon、CRS84）。</summary>
    public JsonElement? CampusBoundary { get; init; }
    /// <summary>距離をメートルで比べるときの基準点（ENU 原点）。</summary>
    public GeoOrigin? EnuOrigin { get; init; }
    public double? EntranceMaxGapMetres { get; init; }
    public double? PathDistanceToleranceMetres { get; init; }
    /// <summary>到達性を調べる出発ノードの canonical ID。</summary>
    public IReadOnlyList<string>? StartNodeIds { get; init; }

    /// <summary>読み込んだファイルの SHA-256（小文字16進数）。設定が変わったら公開の再確認を求めるために使う。</summary>
    [JsonIgnore]
    public string Sha256 { get; private init; } = string.Empty;

    [JsonIgnore]
    public bool IsApproved => Status == Approved;

    public static ApprovedMapSettings Load(string path)
    {
        var bytes = File.ReadAllBytes(path);
        ApprovedMapSettings settings;
        try
        {
            settings = JsonSerializer.Deserialize<ApprovedMapSettings>(bytes, Options)
                ?? throw new InvalidOperationException("地図の検証設定が空です。");
        }
        catch (JsonException exception)
        {
            throw new InvalidOperationException($"地図の検証設定を読み取れません: {exception.Message}", exception);
        }

        if (settings.Status is not (Draft or Approved))
            throw new InvalidOperationException("地図の検証設定の status は draft か approved です。");
        if (settings.IsApproved && (string.IsNullOrWhiteSpace(settings.ApprovedBy) || settings.ApprovedAt is null))
            throw new InvalidOperationException("承認済みの地図の検証設定には approvedBy と approvedAt が必要です。");

        return settings with { Sha256 = Convert.ToHexStringLower(SHA256.HashData(bytes)) };
    }

    /// <summary>承認済みなら設定値を context に加える。承認前は context をそのまま返す。値の妥当性は検証器が調べる。</summary>
    public DatasetValidationContext ApplyTo(DatasetValidationContext context) => !IsApproved ? context : context with
    {
        CampusBoundaryGeoJson = CampusBoundary?.GetRawText(),
        EnuOrigin = EnuOrigin,
        EntranceMaxGapMetres = EntranceMaxGapMetres,
        PathDistanceToleranceMetres = PathDistanceToleranceMetres,
        StartNodeIds = StartNodeIds,
    };
}
