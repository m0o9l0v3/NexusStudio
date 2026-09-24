using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Publishing;

/// <param name="Action">save／import／publish／signIn／signInFailed／signOut。</param>
/// <param name="Status">processing／succeeded／failed。処理中のまま時間が過ぎた公開は failed として返す。</param>
/// <param name="ReleaseSequence">関連する Release の通し番号（公開・取り込みで公開したとき）。</param>
public sealed record LogItem(
    Guid Id,
    Guid? OperationId,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    EditorRef? Actor,
    string Action,
    string? TargetKind,
    string? TargetId,
    string? TargetLabel,
    string Status,
    Guid? ReleaseId,
    long? ReleaseSequence,
    Guid? RevisionId,
    string? Detail);

/// <param name="Actors">絞り込みに使う管理者（無効化済みを含む）。</param>
public sealed record LogPage(IReadOnlyList<LogItem> Items, int? NextOffset, IReadOnlyList<EditorRef> Actors);

/// <summary>操作ログ（12 UI-18・UI-19、28 S4-8）。誰が・いつ・何をしたか。秘密値は記録していない。</summary>
public static class LogEndpoints
{
    public const int PageSize = 50;

    private static readonly TimeZoneInfo Campus = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    public static IEndpointRouteBuilder MapLogEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/logs").WithTags("Logs");
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:guid}", GetAsync);
        return app;
    }

    /// <param name="date">キャンパス現地時刻（JST）の日付で絞る。</param>
    /// <param name="offset">次のページの開始位置（前の応答の NextOffset）。</param>
    private static async Task<Ok<LogPage>> ListAsync(
        StudioDbContext db, TimeProvider timeProvider, string? action, string? status, Guid? actorId, string? targetKind, DateOnly? date, int? offset)
    {
        var query = db.OperationLogs.AsNoTracking();
        if (!string.IsNullOrEmpty(action))
        {
            query = query.Where(l => l.Action == action);
        }

        if (actorId is { } actor)
        {
            query = query.Where(l => l.ActorId == actor);
        }

        if (!string.IsNullOrEmpty(targetKind))
        {
            query = query.Where(l => l.TargetKind == targetKind);
        }

        if (date is { } day)
        {
            var from = new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), Campus.GetUtcOffset(day.ToDateTime(TimeOnly.MinValue))).ToUnixTimeMilliseconds();
            var to = from + (long)TimeSpan.FromDays(1).TotalMilliseconds;
            query = query.Where(l => l.StartedAtMs >= from && l.StartedAtMs < to);
        }

        var abandonedBefore = (timeProvider.GetUtcNow() - PublishingService.AbandonedAfter).ToUnixTimeMilliseconds();
        query = status switch
        {
            OperationStatus.Processing => query.Where(l => l.Status == OperationStatus.Processing && l.StartedAtMs >= abandonedBefore),
            OperationStatus.Failed => query.Where(l => l.Status == OperationStatus.Failed || (l.Status == OperationStatus.Processing && l.StartedAtMs < abandonedBefore)),
            OperationStatus.Succeeded => query.Where(l => l.Status == OperationStatus.Succeeded),
            _ => query,
        };

        var start = Math.Max(offset ?? 0, 0);
        var rows = await query.OrderByDescending(l => l.StartedAtMs).ThenByDescending(l => l.Id).Skip(start).Take(PageSize + 1).ToListAsync();
        var admins = await db.Users.AsNoTracking().OrderBy(u => u.DisplayName).Select(u => new EditorRef(u.Id, u.DisplayName)).ToListAsync();
        var items = await ToItemsAsync(db, timeProvider, rows.Take(PageSize).ToList(), admins);
        return TypedResults.Ok(new LogPage(items, rows.Count > PageSize ? start + PageSize : null, admins));
    }

    private static async Task<Results<Ok<LogItem>, NotFound>> GetAsync(Guid id, StudioDbContext db, TimeProvider timeProvider)
    {
        var row = await db.OperationLogs.AsNoTracking().SingleOrDefaultAsync(l => l.Id == id);
        if (row is null)
        {
            return TypedResults.NotFound();
        }

        var admins = await db.Users.AsNoTracking().Select(u => new EditorRef(u.Id, u.DisplayName)).ToListAsync();
        return TypedResults.Ok((await ToItemsAsync(db, timeProvider, [row], admins))[0]);
    }

    private static async Task<List<LogItem>> ToItemsAsync(StudioDbContext db, TimeProvider timeProvider, List<OperationLog> rows, List<EditorRef> admins)
    {
        var releaseIds = rows.Select(r => r.ReleaseId).OfType<Guid>().Distinct().ToList();
        var sequences = await db.Releases.AsNoTracking().Where(r => releaseIds.Contains(r.ReleaseId)).ToDictionaryAsync(r => r.ReleaseId, r => r.Sequence);
        var names = admins.ToDictionary(a => a.Id);
        var now = timeProvider.GetUtcNow();

        return rows.Select(row =>
        {
            var abandoned = row.Status == OperationStatus.Processing && now - row.StartedAt > PublishingService.AbandonedAfter;
            return new LogItem(
                row.Id,
                row.OperationId,
                row.StartedAt,
                row.FinishedAt,
                row.ActorId is { } actor ? names.GetValueOrDefault(actor) ?? new EditorRef(actor, "（不明な管理者）") : null,
                row.Action,
                row.TargetKind,
                row.TargetId,
                row.TargetLabel,
                abandoned ? OperationStatus.Failed : row.Status,
                row.ReleaseId,
                row.ReleaseId is { } releaseId && sequences.TryGetValue(releaseId, out var sequence) ? sequence : null,
                row.RevisionId,
                abandoned ? "処理が完了しませんでした。公開内容は変わっていません。" : row.Detail);
        }).ToList();
    }
}
