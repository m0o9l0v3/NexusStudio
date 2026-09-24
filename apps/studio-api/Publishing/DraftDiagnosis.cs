using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Publishing;

/// <summary>領域ごとの診断の集計（11 VA-01）。</summary>
/// <param name="TargetCount">診断した下書きの数（公開中と同じ内容の対象は数えない）。</param>
public sealed record DiagnosisArea(string TargetKind, int TargetCount, int BlockingCount, int WarningCount, int InfoCount);

/// <summary>全下書き診断の結果。</summary>
/// <param name="Status">ok／failed（診断処理そのものの失敗。問題なしとは扱わない。11 VA-10）。</param>
/// <param name="Stale">診断の後に下書きや公開が変わった（結果が古い。11 VA-08）。</param>
public sealed record DraftDiagnosisResult(
    Guid Id,
    DateTimeOffset CreatedAt,
    EditorRef CreatedBy,
    string Status,
    bool Stale,
    IReadOnlyList<DiagnosisArea> Areas,
    IReadOnlyList<ValidationFinding> Findings);

/// <summary>
/// 全下書き診断（11 VA-01・VA-02、15 v01 §5.2 validate/draft）。
/// 公開中と違う下書きを1件ずつ「その下書きだけを今の公開データと組み合わせて公開したら」で検証する。
/// ここで見つかった問題は、無関係な公開を止めない（RA-01）。公開の可否は各公開確認で判定する。
/// </summary>
public static class DraftDiagnosis
{
    public static IEndpointRouteBuilder MapDraftDiagnosisEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/validation/draft").WithTags("Validation");
        group.MapPost("/", RunAsync);
        group.MapGet("/latest", LatestAsync);
        return app;
    }

    private static async Task<Ok<DraftDiagnosisResult>> RunAsync(
        StudioDbContext db, CandidateValidator validator, TimeProvider timeProvider, ClaimsPrincipal principal, UserManager<StudioAdmin> userManager, ILoggerFactory loggerFactory)
    {
        var adminId = ReferenceSaving.CurrentAdminId(principal, userManager);
        var (targets, fingerprint) = await LoadTargetsAsync(db);
        var findings = new List<ValidationFinding>();
        var status = ValidationRunStatus.Ok;
        try
        {
            var shared = await PublishCandidate.LoadBaseAsync(db);
            foreach (var entry in targets)
            {
                findings.AddRange(validator.Validate(await PublishCandidate.BuildAsync(db, [entry], shared)));
            }
        }
        catch (Exception exception)
        {
            loggerFactory.CreateLogger("StudioApi.Validation").LogError(exception, "全下書き診断に失敗しました");
            findings.Clear();
            status = ValidationRunStatus.Failed;
        }

        var run = new ValidationRun
        {
            Id = Guid.CreateVersion7(),
            Kind = ValidationRunKind.Draft,
            CreatedAt = timeProvider.GetUtcNow(),
            CreatedBy = adminId,
            Entries = JsonSerializer.Serialize(targets, EventDraftRules.JsonOptions),
            Fingerprint = fingerprint,
            Status = status,
            Findings = JsonSerializer.Serialize(findings, EventDraftRules.JsonOptions),
        };
        db.ValidationRuns.Add(run);
        await db.SaveChangesAsync();
        return TypedResults.Ok(await ToResultAsync(db, run, fingerprint));
    }

    /// <summary>最後の診断結果。まだ一度も診断していなければ 204（未検証）。</summary>
    private static async Task<Results<Ok<DraftDiagnosisResult>, NoContent>> LatestAsync(StudioDbContext db)
    {
        // Id は時刻順に並ぶ UUID v7。
        var run = await db.ValidationRuns.AsNoTracking().Where(r => r.Kind == ValidationRunKind.Draft).OrderByDescending(r => r.Id).FirstOrDefaultAsync();
        if (run is null)
        {
            return TypedResults.NoContent();
        }

        var (_, fingerprint) = await LoadTargetsAsync(db);
        return TypedResults.Ok(await ToResultAsync(db, run, fingerprint));
    }

    private static async Task<DraftDiagnosisResult> ToResultAsync(StudioDbContext db, ValidationRun run, string currentFingerprint)
    {
        var targets = JsonSerializer.Deserialize<List<PublishEntry>>(run.Entries, EventDraftRules.JsonOptions) ?? [];
        var findings = JsonSerializer.Deserialize<List<ValidationFinding>>(run.Findings, EventDraftRules.JsonOptions) ?? [];
        var names = await ReferenceSaving.DisplayNamesAsync(db, [run.CreatedBy]);
        var areas = PublishTargetKind.All
            .Select(kind => new DiagnosisArea(
                kind,
                targets.Count(t => t.TargetKind == kind),
                findings.Count(f => f.TargetKind == kind && f.Severity == FindingSeverity.Blocking),
                findings.Count(f => f.TargetKind == kind && f.Severity == FindingSeverity.Warning),
                findings.Count(f => f.TargetKind == kind && f.Severity == FindingSeverity.Info)))
            .ToList();
        return new DraftDiagnosisResult(
            run.Id,
            run.CreatedAt,
            ReferenceSaving.Editor(run.CreatedBy, names)!,
            run.Status,
            run.Fingerprint != currentFingerprint,
            areas,
            findings);
    }

    /// <summary>
    /// 診断する下書き（公開中と同じ内容ではないもの）と、下書き・公開の状態から作る値（結果が古いかの判定に使う）。
    /// </summary>
    private static async Task<(List<PublishEntry> Targets, string Fingerprint)> LoadTargetsAsync(StudioDbContext db)
    {
        var publications = await PublicationIndex.LoadAsync(db);
        var current = new List<(string Kind, string Id, Guid? Revision)>();
        current.AddRange((await db.EventHeads.AsNoTracking().Select(h => new { h.EventId, h.CurrentRevisionId }).ToListAsync())
            .Select(h => (PublishTargetKind.Event, h.EventId.ToString(), (Guid?)h.CurrentRevisionId)));
        current.AddRange((await db.Occurrences.AsNoTracking().Select(o => new { o.Id, o.CurrentRevisionId }).ToListAsync())
            .Select(o => (PublishTargetKind.Occurrence, o.Id.ToString(), o.CurrentRevisionId)));
        current.Add((PublishTargetKind.Categories, PublishTargetKind.Categories, (await db.CategoryListStates.AsNoTracking().SingleAsync()).CurrentRevisionId));
        current.AddRange((await db.Spots.AsNoTracking().Select(s => new { s.CanonicalId, s.CurrentRevisionId }).ToListAsync())
            .Select(s => (PublishTargetKind.Spot, s.CanonicalId, s.CurrentRevisionId)));

        var builder = new StringBuilder();
        var targets = new List<PublishEntry>();
        foreach (var (kind, id, revision) in current.OrderBy(c => c.Kind, StringComparer.Ordinal).ThenBy(c => c.Id, StringComparer.Ordinal))
        {
            var row = publications.Find(kind, id);
            builder.Append($"{kind}|{id}|{revision}|{row?.State}|{row?.RevisionId}\n");
            if (revision is { } revisionId && PublicationState.Of(row, revisionId) != PublicationState.Published)
            {
                targets.Add(new PublishEntry(kind, id, ReleaseAction.Publish, revisionId));
            }
        }

        return (targets, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString()))));
    }
}
