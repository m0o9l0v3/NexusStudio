namespace StudioApi.Models;

/// <summary>
/// 参加者向け bundle の1版（nexus-mobile E2-5 §3.1、delivery.participant_bundles）。spot か地図を含む公開ごとに1行を追記し、
/// 行の変更・削除はしない（§3.2・§3.5。本番では実行時 role に UPDATE・DELETE を与えない）。
/// </summary>
public sealed class ParticipantBundle
{
    /// <summary>版。その公開の Release の通し番号（studio.releases.sequence）と同じ値。連続しない。</summary>
    public long BundleVersion { get; set; }
    public Guid ReleaseId { get; set; }
    /// <summary>payload 契約の版（例 2.0.0）。</summary>
    public string SchemaVersion { get; set; } = string.Empty;
    /// <summary>UTF-8 の JSON。保存したバイト列をそのまま配信する（jsonb にするとキー順・空白が変わり SHA-256 が合わなくなる）。</summary>
    public byte[] Payload { get; set; } = [];
    /// <summary>Payload の SHA-256（小文字16進数）。</summary>
    public string Sha256 { get; set; } = string.Empty;
    public int ByteLength { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>いま配信する bundle の版（E2-5 §3.1、delivery.current_bundle）。1行だけで、版は減らさない（§3.2）。</summary>
public sealed class CurrentBundle
{
    public bool Singleton { get; set; } = true;
    public long BundleVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
