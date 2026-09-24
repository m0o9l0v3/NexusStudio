namespace StudioApi.Models;

/// <summary>
/// イベントの編集head（15 v01 §4.1）。現在の下書きRevisionを指す可変の行で、RowVersionで楽観的排他制御を行う。
/// 公開状態は持たない（公開は Step 4 で Release から算出する）。
/// </summary>
public sealed class EventHead
{
    public Guid EventId { get; set; }
    public Guid CurrentRevisionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid UpdatedBy { get; set; }
    public long RowVersion { get; set; }
}

/// <summary>保存1回ごとの不変スナップショット。更新・削除しない。</summary>
public sealed class EventRevision
{
    public Guid RevisionId { get; set; }
    public Guid EventId { get; set; }
    /// <summary>`studio.event/1` 形式のJSON。</summary>
    public string Payload { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public Guid CreatedBy { get; set; }
    public Guid? BaseRevisionId { get; set; }
    /// <summary>クライアントが保存操作ごとに発行するID。再送で重複したRevisionを作らない。</summary>
    public Guid OperationId { get; set; }
}
