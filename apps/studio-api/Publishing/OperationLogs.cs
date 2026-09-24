using StudioApi.Data;
using StudioApi.Models;

namespace StudioApi.Publishing;

/// <summary>管理操作の記録を追加する（保存・取り込み・ログイン）。公開の記録は <see cref="PublishingService"/> が書く。</summary>
public static class OperationLogs
{
    /// <summary>下書きの保存。保存と同じ SaveChanges で書き、保存が失敗すれば記録も残らない。</summary>
    public static void AddSave(StudioDbContext db, Guid operationId, Guid adminId, DateTimeOffset now, string kind, string targetId, string label, Guid revisionId)
        => db.OperationLogs.Add(new OperationLog
        {
            Id = Guid.CreateVersion7(),
            OperationId = operationId,
            StartedAt = now,
            FinishedAt = now,
            ActorId = adminId,
            Action = OperationAction.Save,
            TargetKind = kind,
            TargetId = targetId,
            TargetLabel = Truncate(label),
            Status = OperationStatus.Succeeded,
            RevisionId = revisionId,
        });

    public static void Add(StudioDbContext db, DateTimeOffset now, string action, Guid? actorId, string status, string? detail = null, Guid? releaseId = null)
        => db.OperationLogs.Add(new OperationLog
        {
            Id = Guid.CreateVersion7(),
            StartedAt = now,
            FinishedAt = now,
            ActorId = actorId,
            Action = action,
            Status = status,
            Detail = detail is null ? null : detail.Length <= 2000 ? detail : detail[..2000],
            ReleaseId = releaseId,
        });

    private static string Truncate(string value) => value.Length <= 500 ? value : value[..500];
}
