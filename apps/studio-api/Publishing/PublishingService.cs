using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Publishing;

/// <summary>公開候補の検証結果。</summary>
/// <param name="Status">ok／failed（検証処理そのものの失敗。合格ではない）。</param>
public sealed record ValidationRunResult(
    Guid Id,
    DateTimeOffset CreatedAt,
    string Status,
    int BlockingCount,
    int WarningCount,
    IReadOnlyList<PublishEntry> Entries,
    IReadOnlyList<ValidationFinding> Findings);

/// <param name="Action">publish／withdraw／restore。</param>
/// <param name="RestoredFromRevisionId">復旧で戻した過去の版。</param>
/// <param name="StashedRevisionId">復旧の直前に退避した未公開の下書きの版。</param>
public sealed record ReleaseEntrySummary(
    string TargetKind,
    string TargetId,
    string Action,
    Guid RevisionId,
    Guid? PreviousRevisionId,
    string Label,
    Guid? RestoredFromRevisionId,
    Guid? StashedRevisionId);

public sealed record ReleaseSummary(
    Guid ReleaseId,
    long Sequence,
    DateTimeOffset CreatedAt,
    EditorRef? CreatedBy,
    string Source,
    string? Message,
    IReadOnlyList<ReleaseEntrySummary> Entries);

/// <summary>公開操作の結果（17 §4）。</summary>
/// <param name="Status">processing（公開処理中）／succeeded（公開成功）／failed（未反映の失敗）。</param>
/// <param name="Detail">失敗の理由。</param>
public sealed record OperationResult(Guid OperationId, string Status, DateTimeOffset StartedAt, ReleaseSummary? Release, string? Detail);

public enum PublishOutcomeKind { Done, InvalidRequest, RecheckRequired, Blocked }

public sealed record PublishOutcome(PublishOutcomeKind Kind, OperationResult? Result = null, ValidationRunResult? Validation = null, string? Error = null);

/// <summary>
/// 公開・取り下げ（15 v01 §5.3）。公開処理の実体は1つで、取り下げも新しい Release として記録する。
/// </summary>
public sealed class PublishingService(StudioDbContext db, CandidateValidator validator, TimeProvider timeProvider, ILogger<PublishingService> logger)
{
    /// <summary>処理中のまま、この時間を過ぎた操作は完了しなかった（未反映）とみなす。公開はトランザクション内で行うため、途中で止まれば何も反映されない。</summary>
    public static readonly TimeSpan AbandonedAfter = TimeSpan.FromMinutes(2);

    public const int MaxEntries = 100;

    /// <summary>公開候補を組み立てて検証し、結果を保存する。</summary>
    public async Task<(PublishCandidate Candidate, ValidationRunResult Validation)> ValidateAsync(IReadOnlyList<PublishEntry> entries, Guid adminId)
    {
        var candidate = await PublishCandidate.BuildAsync(db, entries);
        var run = new ValidationRun
        {
            Id = Guid.CreateVersion7(),
            CreatedAt = timeProvider.GetUtcNow(),
            CreatedBy = adminId,
            Entries = JsonSerializer.Serialize(entries, EventDraftRules.JsonOptions),
            Fingerprint = candidate.Fingerprint,
        };

        IReadOnlyList<ValidationFinding> findings;
        try
        {
            findings = validator.Validate(candidate);
            run.Status = ValidationRunStatus.Ok;
        }
        catch (Exception exception)
        {
            // 検証器の失敗を合格として扱わない（11 VA-10、RA-07）。
            logger.LogError(exception, "公開候補の検証に失敗しました");
            findings = [];
            run.Status = ValidationRunStatus.Failed;
        }

        run.Findings = JsonSerializer.Serialize(findings, EventDraftRules.JsonOptions);
        db.ValidationRuns.Add(run);
        await db.SaveChangesAsync();
        return (candidate, ToResult(run, entries, findings));
    }

    public async Task<PublishOutcome> PublishAsync(Guid operationId, IReadOnlyList<PublishEntry> entries, Guid confirmedValidationId, string? message, Guid adminId)
    {
        if (operationId == Guid.Empty || entries.Count is 0 or > MaxEntries || confirmedValidationId == Guid.Empty || message is { Length: > 500 })
        {
            return new(PublishOutcomeKind.InvalidRequest, Error: "operationId・entries（1〜100件）・confirmedValidationId を指定してください。公開メッセージは500文字以内です。");
        }

        // 同じ操作IDの再送：新しい公開を作らず、最初の操作の結果を返す（RA-05）。
        if (await FindAsync(operationId) is { } existing)
        {
            return existing.Action == OperationAction.Publish
                ? new(PublishOutcomeKind.Done, await ToResultAsync(existing))
                : new(PublishOutcomeKind.InvalidRequest, Error: "この operationId は別の操作で使われています。");
        }

        var confirmed = await db.ValidationRuns.AsNoTracking().SingleOrDefaultAsync(r => r.Id == confirmedValidationId);
        if (confirmed is null || confirmed.CreatedBy != adminId)
        {
            return new(PublishOutcomeKind.InvalidRequest, Error: "確認した検証結果が見つかりません。公開内容を確認し直してください。");
        }

        var now = timeProvider.GetUtcNow();
        var first = entries[0];
        var log = new OperationLog
        {
            Id = Guid.CreateVersion7(),
            OperationId = operationId,
            StartedAt = now,
            StartedAtMs = now.ToUnixTimeMilliseconds(),
            ActorId = adminId,
            Action = OperationAction.Publish,
            TargetKind = first.TargetKind,
            TargetId = first.TargetId,
            Status = OperationStatus.Processing,
        };

        // 「公開処理中」を先に記録する。応答が届かなくても、同じ操作IDで状態を照会できる（17 §4、RA-06）。
        db.OperationLogs.Add(log);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            if (await FindAsync(operationId) is { } raced)
            {
                return new(PublishOutcomeKind.Done, await ToResultAsync(raced));
            }

            throw;
        }

        try
        {
            return await PublishInTransactionAsync(log, entries, confirmed, message, adminId);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "公開処理 {OperationId} に失敗しました", operationId);
            db.ChangeTracker.Clear();
            await FinishAsync(log.Id, OperationStatus.Failed, "公開処理中にエラーが発生しました。公開内容は変わっていません。", null);
            return new(PublishOutcomeKind.Done, await ToResultAsync((await FindAsync(operationId))!));
        }
    }

    private async Task<PublishOutcome> PublishInTransactionAsync(OperationLog log, IReadOnlyList<PublishEntry> entries, ValidationRun confirmed, string? message, Guid adminId)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (db.Database.IsNpgsql())
        {
            // 公開は1つずつ行う（公開候補の組み立てから書き込みまでの間に、別の公開を挟まない）。
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7201)");
        }

        var candidate = await PublishCandidate.BuildAsync(db, entries);
        IReadOnlyList<ValidationFinding> findings;
        string status;
        try
        {
            findings = validator.Validate(candidate);
            status = ValidationRunStatus.Ok;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "公開直前の検証に失敗しました");
            findings = [];
            status = ValidationRunStatus.Failed;
        }

        var labels = candidate.Items.Select(i => i.Label).ToList();
        var logRow = await db.OperationLogs.SingleAsync(l => l.Id == log.Id);
        logRow.TargetLabel = Truncate(labels.Count == 1 ? labels[0] : $"{labels[0]} ほか{labels.Count - 1}件", 500);

        // 確認した後に対象や関連する公開データが変わっていれば、古い確認結果で公開しない（11 RA-04、07 E06）。
        if (status != ValidationRunStatus.Ok || candidate.Fingerprint != confirmed.Fingerprint || findings.Any(f => f.Severity == FindingSeverity.Blocking))
        {
            var run = new ValidationRun
            {
                Id = Guid.CreateVersion7(),
                CreatedAt = timeProvider.GetUtcNow(),
                CreatedBy = adminId,
                Entries = JsonSerializer.Serialize(entries, EventDraftRules.JsonOptions),
                Fingerprint = candidate.Fingerprint,
                Status = status,
                Findings = JsonSerializer.Serialize(findings, EventDraftRules.JsonOptions),
            };
            db.ValidationRuns.Add(run);
            // 確認後に変わっていれば、新しい所見に公開阻止があっても「再確認」として返す（確認した内容と違うことを先に伝える）。
            var recheck = status == ValidationRunStatus.Ok && candidate.Fingerprint != confirmed.Fingerprint;
            logRow.Status = OperationStatus.Failed;
            logRow.FinishedAt = timeProvider.GetUtcNow();
            logRow.Detail = status != ValidationRunStatus.Ok
                ? "検証処理が完了しなかったため公開しませんでした。"
                : recheck ? "確認した後に内容が変わったため公開しませんでした（再確認が必要）。" : "公開阻止の問題があるため公開しませんでした。";
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return new(recheck ? PublishOutcomeKind.RecheckRequired : PublishOutcomeKind.Blocked, Validation: ToResult(run, entries, findings));
        }

        var now = timeProvider.GetUtcNow();
        var release = new Release
        {
            ReleaseId = Guid.CreateVersion7(),
            Sequence = await NextSequenceAsync(),
            OperationId = log.OperationId,
            CreatedAt = now,
            CreatedBy = adminId,
            Source = ReleaseSource.Studio,
            Message = string.IsNullOrWhiteSpace(message) ? null : message.Trim(),
            ValidationRunId = confirmed.Id,
        };

        foreach (var item in candidate.Items)
        {
            var publication = await db.Publications.SingleOrDefaultAsync(p => p.TargetKind == item.Entry.TargetKind && p.TargetId == item.Entry.TargetId);
            var withdraw = item.Entry.Action == ReleaseAction.Withdraw;
            var restore = item.Entry.Action == ReleaseAction.Restore;
            Guid? stashed = null;
            Guid revisionId;
            if (withdraw)
            {
                revisionId = publication!.RevisionId;
            }
            else if (restore)
            {
                // 未公開の下書きがあれば退避してから、過去の版の内容を新しい下書きの版として写し、それを公開する（11 RL-12、28 S4-5）。
                stashed = item.CurrentRevisionId != publication?.RevisionId ? item.CurrentRevisionId : null;
                revisionId = await ApplyRestoreAsync(item, adminId, now);
            }
            else
            {
                revisionId = item.Entry.RevisionId!.Value;
            }

            release.Entries.Add(new ReleaseEntry
            {
                TargetKind = item.Entry.TargetKind,
                TargetId = item.Entry.TargetId,
                Action = item.Entry.Action,
                RevisionId = revisionId,
                PreviousRevisionId = publication?.State == PublicationRowState.Published ? publication.RevisionId : null,
                Label = Truncate(item.Label, 500),
                RestoredFromRevisionId = restore ? item.Entry.RevisionId : null,
                StashedRevisionId = stashed,
            });

            if (publication is null)
            {
                db.Publications.Add(publication = new Publication { TargetKind = item.Entry.TargetKind, TargetId = item.Entry.TargetId });
            }

            publication.State = withdraw ? PublicationRowState.Withdrawn : PublicationRowState.Published;
            publication.RevisionId = revisionId;
            publication.ReleaseId = release.ReleaseId;
            publication.UpdatedAt = now;
        }

        db.Releases.Add(release);
        logRow.Status = OperationStatus.Succeeded;
        logRow.FinishedAt = now;
        logRow.ReleaseId = release.ReleaseId;
        logRow.Action = OperationAction.Publish;
        logRow.Detail = string.Join("・", entries.Select(e => e.Action).Distinct().Select(action => action switch
        {
            ReleaseAction.Withdraw => "取り下げ",
            ReleaseAction.Restore => "復旧",
            _ => "公開",
        }));
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new(PublishOutcomeKind.Done, await ToResultAsync(logRow));
    }

    /// <summary>復旧：過去の版の内容を現在の下書きへ反映し、新しい版を作る。返すのは新しい版のID。</summary>
    private async Task<Guid> ApplyRestoreAsync(CandidateItem item, Guid adminId, DateTimeOffset now)
    {
        var id = item.Entry.TargetId;
        switch (item.CandidatePayload)
        {
            case EventDraft draft:
            {
                var head = await db.EventHeads.SingleAsync(h => h.EventId == Guid.Parse(id));
                var revision = new EventRevision
                {
                    RevisionId = Guid.CreateVersion7(),
                    EventId = head.EventId,
                    Payload = JsonSerializer.Serialize(draft, EventDraftRules.JsonOptions),
                    CreatedAt = now,
                    CreatedBy = adminId,
                    BaseRevisionId = head.CurrentRevisionId,
                    OperationId = Guid.CreateVersion7(),
                };
                db.EventRevisions.Add(revision);
                head.CurrentRevisionId = revision.RevisionId;
                head.UpdatedAt = now;
                head.UpdatedBy = adminId;
                head.RowVersion++;
                return revision.RevisionId;
            }

            case OccurrenceDraft draft:
            {
                var occurrence = await db.Occurrences.Include(o => o.Days).SingleAsync(o => o.Id == Guid.Parse(id));
                await OccurrenceEndpoints.ApplyAsync(db, occurrence, draft);
                ReferenceSaving.Touch(occurrence, adminId, now);
                return ReferenceSaving.AddRevision(db, occurrence, ReferenceSaving.NewRevision(
                    ReferenceRevisionKind.Occurrence, id, draft, adminId, now, ReferenceRevisionSource.Restore, null)).RevisionId;
            }

            case List<CategoryDraft> items:
            {
                var state = await db.CategoryListStates.SingleAsync();
                var categories = await db.Categories.ToListAsync();
                for (var i = 0; i < items.Count; i++)
                {
                    var category = categories.SingleOrDefault(c => c.Id == items[i].Id);
                    if (category is null)
                    {
                        db.Categories.Add(category = new Category { Id = items[i].Id });
                    }

                    category.Name = items[i].Name?.Trim() ?? string.Empty;
                    category.Selectable = items[i].Selectable;
                    category.SortOrder = i + 1;
                }

                ReferenceSaving.Touch(state, adminId, now);
                return ReferenceSaving.AddRevision(db, state, ReferenceSaving.NewRevision(
                    ReferenceRevisionKind.Categories, ReferenceRevisionKind.Categories, items, adminId, now, ReferenceRevisionSource.Restore, null)).RevisionId;
            }

            case SpotDraft draft:
            {
                var spot = (await db.Spots.Include(s => s.NameAliases).Where(s => s.CanonicalId == id).ToListAsync())
                    .Single(s => string.Equals(s.CanonicalId, id, StringComparison.Ordinal));
                spot.Name = draft.Name?.Trim() ?? string.Empty;
                spot.Utilization = draft.Utilization;
                spot.NameAliases.RemoveAll(a => !draft.Aliases.Contains(a.Alias, StringComparer.Ordinal));
                foreach (var alias in draft.Aliases.Where(a => spot.NameAliases.All(existing => existing.Alias != a)))
                {
                    spot.NameAliases.Add(new SpotNameAlias { CanonicalId = spot.CanonicalId, Alias = alias });
                }

                ReferenceSaving.Touch(spot, adminId, now);
                return ReferenceSaving.AddRevision(db, spot, ReferenceSaving.NewRevision(
                    ReferenceRevisionKind.Spot, id, draft, adminId, now, ReferenceRevisionSource.Restore, null)).RevisionId;
            }

            default:
                throw new InvalidOperationException($"復旧できない対象です: {item.Entry.TargetKind}");
        }
    }

    /// <summary>Release の通し番号。公開は直列化しているため最大値＋1で重複しない（重複すれば一意制約で失敗し、何も反映しない）。</summary>
    private async Task<long> NextSequenceAsync() => (await db.Releases.MaxAsync(r => (long?)r.Sequence) ?? 0) + 1;

    /// <summary>操作IDで公開操作の実際の状態を照会する（17 §4 結果確認中）。</summary>
    public async Task<OperationResult?> GetOperationAsync(Guid operationId)
        => await FindAsync(operationId) is { Action: OperationAction.Publish } log ? await ToResultAsync(log) : null;

    private Task<OperationLog?> FindAsync(Guid operationId)
        => db.OperationLogs.AsNoTracking().SingleOrDefaultAsync(l => l.OperationId == operationId);

    private async Task FinishAsync(Guid logId, string status, string? detail, Guid? releaseId)
    {
        var row = await db.OperationLogs.SingleAsync(l => l.Id == logId);
        row.Status = status;
        row.Detail = detail;
        row.ReleaseId = releaseId;
        row.FinishedAt = timeProvider.GetUtcNow();
        await db.SaveChangesAsync();
    }

    private async Task<OperationResult> ToResultAsync(OperationLog log)
    {
        var status = log.Status;
        var detail = log.Detail;
        if (status == OperationStatus.Processing && timeProvider.GetUtcNow() - log.StartedAt > AbandonedAfter)
        {
            status = OperationStatus.Failed;
            detail = "公開処理が完了しませんでした。公開内容は変わっていません。";
        }

        return new OperationResult(log.OperationId!.Value, status, log.StartedAt, log.ReleaseId is { } releaseId ? await LoadReleaseAsync(releaseId) : null, detail);
    }

    public async Task<ReleaseSummary?> LoadReleaseAsync(Guid releaseId)
    {
        var release = await db.Releases.AsNoTracking().Include(r => r.Entries).SingleOrDefaultAsync(r => r.ReleaseId == releaseId);
        if (release is null)
        {
            return null;
        }

        var names = await ReferenceSaving.DisplayNamesAsync(db, [release.CreatedBy]);
        return new ReleaseSummary(
            release.ReleaseId,
            release.Sequence,
            release.CreatedAt,
            ReferenceSaving.Editor(release.CreatedBy, names),
            release.Source,
            release.Message,
            release.Entries
                .OrderBy(e => Array.IndexOf(PublishTargetKind.All, e.TargetKind)).ThenBy(e => e.Label, StringComparer.CurrentCulture)
                .Select(ReleaseHistory.ToSummary)
                .ToList());
    }

    private static ValidationRunResult ToResult(ValidationRun run, IReadOnlyList<PublishEntry> entries, IReadOnlyList<ValidationFinding> findings) => new(
        run.Id,
        run.CreatedAt,
        run.Status,
        findings.Count(f => f.Severity == FindingSeverity.Blocking),
        findings.Count(f => f.Severity == FindingSeverity.Warning),
        entries,
        findings);

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}
