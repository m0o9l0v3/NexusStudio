using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;

namespace StudioApi.Reference;

public enum SaveOutcome { Saved, Conflict, Replayed }

public sealed record EditorRef(Guid Id, string DisplayName);

/// <summary>参照データの保存に共通する処理（Revisionの作成、operationIdによる再送の判定、保存結果の分類）。</summary>
public static class ReferenceSaving
{
    public static Guid CurrentAdminId(ClaimsPrincipal principal, UserManager<StudioAdmin> userManager)
        => Guid.Parse(userManager.GetUserId(principal) ?? throw new InvalidOperationException("管理者IDを特定できません。"));

    public static Task<ReferenceRevision?> FindReplayAsync(StudioDbContext db, Guid operationId)
        => db.ReferenceRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.OperationId == operationId);

    public static ReferenceRevision NewRevision<T>(string kind, string targetId, T payload, Guid? adminId, DateTimeOffset now, string source, Guid? operationId) => new()
    {
        RevisionId = Guid.CreateVersion7(),
        Kind = kind,
        TargetId = targetId,
        Payload = JsonSerializer.Serialize(payload, EventDraftRules.JsonOptions),
        CreatedAt = now,
        CreatedBy = adminId,
        Source = source,
        OperationId = operationId,
    };

    public static void Touch(IEditableReference target, Guid adminId, DateTimeOffset now)
    {
        target.RowVersion++;
        target.UpdatedAt = now;
        target.UpdatedBy = adminId;
    }

    /// <summary>
    /// 保存する。行の版が読み込み後に進んでいれば Conflict、同じ operationId の並行した再送が先に保存していれば Replayed。
    /// それ以外の失敗は例外のまま伝える。
    /// </summary>
    public static async Task<SaveOutcome> TrySaveAsync(StudioDbContext db, Guid operationId, Func<Task>? save = null)
    {
        try
        {
            if (save is null)
            {
                await db.SaveChangesAsync();
            }
            else
            {
                await save();
            }

            return SaveOutcome.Saved;
        }
        catch (DbUpdateConcurrencyException)
        {
            db.ChangeTracker.Clear();
            return SaveOutcome.Conflict;
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            if (await FindReplayAsync(db, operationId) is not null)
            {
                return SaveOutcome.Replayed;
            }

            throw;
        }
    }

    public static async Task<Dictionary<Guid, string>> DisplayNamesAsync(StudioDbContext db, IEnumerable<Guid?> ids)
    {
        var wanted = ids.OfType<Guid>().Distinct().ToList();
        return await db.Users.AsNoTracking().Where(u => wanted.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
    }

    public static EditorRef? Editor(Guid? id, IReadOnlyDictionary<Guid, string> names)
        => id is { } value ? new EditorRef(value, names.GetValueOrDefault(value, "（不明な管理者）")) : null;
}

public sealed record ReferenceConflict<T>(string Code, string Title, T Latest);

public sealed record ReferenceValidationProblem(string Code, string Title, IReadOnlyList<DraftProblem> Problems)
{
    public static ReferenceValidationProblem Invalid(IReadOnlyList<DraftProblem> problems)
        => new("invalid_draft", "保存できない入力があります。", problems);

    public static ReferenceValidationProblem InvalidOperationId()
        => new("invalid_operation_id", "operationId を指定してください。", []);
}
