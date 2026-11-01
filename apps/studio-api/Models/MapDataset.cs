namespace StudioApi.Models;

/// <summary>版管理する GeoJSON payload。公開・検証の状態遷移は管理サービスが担当する。</summary>
public sealed class MapDataset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long Version { get; set; }
    public string Status { get; set; } = MapDatasetStatus.Draft;
    public string Payload { get; set; } = string.Empty;
    /// <summary>保存した Payload の UTF-8 バイト列に対する SHA-256（小文字16進数）。</summary>
    public string Checksum { get; set; } = string.Empty;
    public DateTimeOffset? PublishedAt { get; set; }
    /// <summary>取り込み時に渡した版ごとの根拠（経路の所要時間・フロアの座標変換の検証結果）の JSON。無ければnull（公開判定で不足として止まる。決定事項31 D3）。</summary>
    public string? ValidationEvidence { get; set; }
}

public static class MapDatasetStatus
{
    public const string Draft = "draft";
    public const string Published = "published";
    public const string Archived = "archived";
}
