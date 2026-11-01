using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;
using StudioApi.Services.MapValidation;

namespace StudioApi.Publishing;

/// <param name="Applied">公開まで行ったか（false は確認だけで、何も変えていない）。</param>
/// <param name="Messages">確認・公開の内容と所見。</param>
public sealed record SpotRenameResult(bool Succeeded, bool Applied, IReadOnlyList<string> Messages, Guid? ReleaseId = null);

public sealed partial class PublishingService
{
    /// <summary>
    /// 公開中の Spot の canonical ID を改名する（nexus-mobile E2-5 §5.5 O-3c、決定事項32）。主キーは書き換えず、次を1つの Release・1つのトランザクションで行う。
    /// <list type="number">
    /// <item>新しい ID の目的地を持つ地図の版（取り込み済みの下書き）を公開する。</item>
    /// <item>新しい ID の Spot を旧 Spot の内容で作って公開し、旧 Spot を取り下げる。</item>
    /// <item>旧 ID を会場にしているイベントを、新しい ID を会場にする新しい版へ移す（公開中のものは同じ Release で公開し直す）。</item>
    /// <item>予約表に、旧 ID の廃止（公開中の全種別）、旧 ID → 新 ID の alias、既存 alias の付け替えを追記する。</item>
    /// <item>参加者向け bundle を作り直す。</item>
    /// </list>
    /// 公開の検証は通常の公開と同じ検証器で行う。apply が false なら、確認だけして何も残さない（トランザクションを取り消す）。
    /// </summary>
    public async Task<SpotRenameResult> RenameSpotAsync(string from, string to, long mapVersion, Guid adminId, string? message, bool apply)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (db.Database.IsNpgsql())
        {
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7201)");
        }

        var messages = new List<string>();
        var plan = await PlanRenameAsync(from, to, mapVersion, messages);
        if (plan is null)
        {
            return new(false, false, messages);
        }

        var now = timeProvider.GetUtcNow();
        var operationId = Guid.CreateVersion7();

        // 新しい ID の Spot：旧 Spot の公開中の内容（未公開の変更が無いことは確かめた）をそのまま写す。
        var renamed = new Spot
        {
            CanonicalId = to,
            Name = plan.Spot.Name,
            BuildingName = plan.Spot.BuildingName,
            FloorName = plan.Spot.FloorName,
            Utilization = plan.Spot.Utilization,
            Kind = plan.Spot.Kind,
            Description = plan.Spot.Description,
            NameAliases = plan.Spot.NameAliases.Select(a => new SpotNameAlias { CanonicalId = to, Alias = a.Alias }).ToList(),
        };
        db.Spots.Add(renamed);
        ReferenceSaving.Touch(renamed, adminId, now);
        var spotRevision = ReferenceSaving.AddRevision(db, renamed, ReferenceSaving.NewRevision(
            ReferenceRevisionKind.Spot, to,
            new SpotDraft(renamed.Name, renamed.NameAliases.Select(a => a.Alias).ToList(), renamed.Utilization, renamed.Kind, renamed.Description),
            adminId, now, ReferenceRevisionSource.Rename, operationId)).RevisionId;

        var entries = new List<PublishEntry>
        {
            new(PublishTargetKind.Map, "map", ReleaseAction.Publish, plan.Map.Id),
            new(PublishTargetKind.Spot, to, ReleaseAction.Publish, spotRevision),
            new(PublishTargetKind.Spot, from, ReleaseAction.Withdraw, null),
        };

        // 旧 ID を会場にしているイベントは、会場だけを新しい ID に替えた版を作る。既存の版は書き換えない。
        foreach (var (head, draft, published) in plan.Events)
        {
            var moved = draft with
            {
                Slots = draft.Slots.Select(slot => slot with
                {
                    Venues = slot.Venues.Select(v => string.Equals(v.CanonicalSpotId, from, StringComparison.Ordinal) ? v with { CanonicalSpotId = to } : v).ToList(),
                }).ToList(),
            };
            var revision = new EventRevision
            {
                RevisionId = Guid.CreateVersion7(),
                EventId = head.EventId,
                Payload = JsonSerializer.Serialize(moved, EventDraftRules.JsonOptions),
                CreatedAt = now,
                CreatedBy = adminId,
                BaseRevisionId = head.CurrentRevisionId,
                // 版ごとに一意の値（保存の操作 ID）。改名の操作 ID は Release と操作ログに残す。
                OperationId = Guid.CreateVersion7(),
            };
            db.EventRevisions.Add(revision);
            head.CurrentRevisionId = revision.RevisionId;
            head.UpdatedAt = now;
            head.UpdatedBy = adminId;
            head.RowVersion++;
            if (published)
            {
                entries.Add(new(PublishTargetKind.Event, head.EventId.ToString(), ReleaseAction.Publish, revision.RevisionId));
            }

            messages.Add($"イベント「{PublishCandidate.EventLabel(draft.Title)}」の会場を {to} に替えます{(published ? "（公開し直す）" : "（下書きのみ）")}。");
        }

        await db.SaveChangesAsync();

        var candidate = await PublishCandidate.BuildAsync(db, entries);
        IReadOnlyList<ValidationFinding> findings;
        var status = ValidationRunStatus.Ok;
        try
        {
            findings = validator.Validate(candidate);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "改名の検証に失敗しました");
            findings = [];
            status = ValidationRunStatus.Failed;
        }

        foreach (var finding in findings)
        {
            messages.Add($"[{finding.Severity}] {finding.TargetLabel}：{finding.Code} {finding.Message}");
        }

        if (status != ValidationRunStatus.Ok || findings.Any(f => f.Severity == FindingSeverity.Blocking))
        {
            messages.Add(status != ValidationRunStatus.Ok ? "検証処理が完了しなかったため改名しませんでした。" : "公開阻止の問題があるため改名しませんでした。何も変えていません。");
            return new(false, false, messages);
        }

        if (!apply)
        {
            messages.Add("確認だけ行いました。何も変えていません。改名するには --apply を付けて実行してください。");
            return new(true, false, messages);
        }

        var run = new ValidationRun
        {
            Id = Guid.CreateVersion7(),
            CreatedAt = now,
            CreatedBy = adminId,
            Entries = JsonSerializer.Serialize(entries, EventDraftRules.JsonOptions),
            Fingerprint = FingerprintOf(candidate),
            Status = status,
            Findings = JsonSerializer.Serialize(findings, EventDraftRules.JsonOptions),
        };
        db.ValidationRuns.Add(run);
        var text = string.IsNullOrWhiteSpace(message) ? $"改名 {from} → {to}" : $"改名 {from} → {to}：{message.Trim()}";
        var release = await WriteReleaseAsync(candidate, operationId, run.Id, text, adminId, now, (ledger, releaseId) =>
        {
            // 旧 ID は公開中のすべての種別（spot と目的地Featureの種別）で廃止してから alias にする（alias は種別によらず ID を占める）。
            foreach (var kind in ledger.Snapshot.ActiveKinds(from))
            {
                ledger.Retire(from, kind, IdReservationSource.Rename, releaseId, $"改名 → {to}");
            }

            ledger.AddAlias(from, to, IdEntityKind.Spot, IdReservationSource.Rename, releaseId, $"改名 {from} → {to}");
        });
        db.OperationLogs.Add(new OperationLog
        {
            Id = Guid.CreateVersion7(),
            OperationId = operationId,
            StartedAt = now,
            StartedAtMs = now.ToUnixTimeMilliseconds(),
            FinishedAt = now,
            ActorId = adminId,
            Action = OperationAction.Publish,
            TargetKind = PublishTargetKind.Spot,
            TargetId = to,
            TargetLabel = Truncate(PublishCandidate.SpotLabel(renamed.Name, to), 500),
            Status = OperationStatus.Succeeded,
            ReleaseId = release.ReleaseId,
            Detail = text,
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        messages.Add($"改名しました（Release #{release.Sequence}、{release.ReleaseId}）。");
        return new(true, true, messages, release.ReleaseId);
    }

    private sealed record RenamePlan(Spot Spot, MapDataset Map, IReadOnlyList<(EventHead Head, EventDraft Draft, bool Published)> Events);

    /// <summary>改名の前提を確かめる。満たさなければ理由を messages に書いて null を返す（何も変えない）。</summary>
    private async Task<RenamePlan?> PlanRenameAsync(string from, string to, long mapVersion, List<string> messages)
    {
        if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to) || string.Equals(from, to, StringComparison.Ordinal))
        {
            messages.Add("旧 ID と新しい ID を、異なる値で指定してください。");
            return null;
        }

        var spots = await db.Spots.Include(s => s.NameAliases).Where(s => s.CanonicalId == from || s.CanonicalId == to).ToListAsync();
        var spot = spots.SingleOrDefault(s => string.Equals(s.CanonicalId, from, StringComparison.Ordinal));
        var publications = await db.Publications.Where(p => p.TargetKind == PublishTargetKind.Spot || p.TargetKind == PublishTargetKind.Map || p.TargetKind == PublishTargetKind.Event).ToListAsync();
        var spotPublication = publications.SingleOrDefault(p => p.TargetKind == PublishTargetKind.Spot && string.Equals(p.TargetId, from, StringComparison.Ordinal));
        if (spot is null || spotPublication?.State != PublicationRowState.Published)
        {
            // 一度も公開していない ID は参加者に届いていないため、改名ではなく作り直しで足りる（E2-5 §5.5 は公開した ID の規則）。
            messages.Add($"Spot {from} は公開中ではありません。改名できるのは公開中の Spot だけです。");
            return null;
        }

        if (spot.CurrentRevisionId != spotPublication.RevisionId)
        {
            messages.Add($"Spot {from} に未公開の変更があります。先に公開するか、公開中の内容に戻してから改名してください。");
            return null;
        }

        if (spots.Any(s => string.Equals(s.CanonicalId, to, StringComparison.Ordinal)))
        {
            messages.Add($"Spot {to} はすでにあります。新しい ID には、まだ使われていない ID を指定してください。");
            return null;
        }

        var reservations = await IdReservationSnapshot.LoadAsync(db);
        if (reservations.IsReserved(to))
        {
            messages.Add($"ID {to} は予約表にあります（公開済み・廃止済み・旧 ID のいずれか）。廃止した ID は再利用できません。");
            return null;
        }

        var currentMap = publications.SingleOrDefault(p => p.TargetKind == PublishTargetKind.Map && p.State == PublicationRowState.Published);
        var datasets = await db.MapDatasets.Where(m => m.Version == mapVersion || (currentMap != null && m.Id == currentMap.RevisionId)).ToListAsync();
        var map = datasets.SingleOrDefault(m => m.Version == mapVersion);
        var current = currentMap is null ? null : datasets.SingleOrDefault(m => m.Id == currentMap.RevisionId);
        if (map is null || map.Status != MapDatasetStatus.Draft)
        {
            messages.Add($"地図 v{mapVersion} は取り込み済みの下書きではありません。新しい ID の目的地を持つ地図を map import で取り込み、その版を指定してください。");
            return null;
        }

        if (current is null || !MapFeatureIndex.Parse(current.Payload).Features.TryGetValue(from, out var oldType))
        {
            messages.Add($"公開中の地図に {from} の目的地がありません。");
            return null;
        }

        var next = MapFeatureIndex.Parse(map.Payload);
        if (!next.Features.TryGetValue(to, out var newType) || newType != oldType)
        {
            messages.Add($"地図 v{mapVersion} に、{from} と同じ種別（{oldType}）の目的地 {to} がありません。");
            return null;
        }

        if (next.Features.ContainsKey(from) || next.Floors.ContainsKey(from))
        {
            messages.Add($"地図 v{mapVersion} にまだ {from} があります。改名後の地図からは旧 ID を除いてください（旧 ID は廃止します）。");
            return null;
        }

        // 旧 ID を会場にしているイベント：現在の下書きか公開中の版のどちらかが参照していれば対象。
        var heads = await db.EventHeads.ToListAsync();
        var eventPublications = publications.Where(p => p.TargetKind == PublishTargetKind.Event).ToDictionary(p => p.TargetId, StringComparer.Ordinal);
        var revisionIds = heads.Select(h => h.CurrentRevisionId)
            .Concat(eventPublications.Values.Where(p => p.State == PublicationRowState.Published).Select(p => p.RevisionId)).ToHashSet();
        var payloads = await db.EventRevisions.AsNoTracking().Where(r => revisionIds.Contains(r.RevisionId)).ToDictionaryAsync(r => r.RevisionId, r => r.Payload);
        bool Uses(Guid revisionId) => payloads.TryGetValue(revisionId, out var payload)
            && JsonSerializer.Deserialize<EventDraft>(payload, EventDraftRules.JsonOptions)!.Slots
                .Any(s => s.Venues.Any(v => string.Equals(v.CanonicalSpotId, from, StringComparison.Ordinal)));

        var events = new List<(EventHead, EventDraft, bool)>();
        var blocked = false;
        foreach (var head in heads.OrderBy(h => h.EventId))
        {
            var publication = eventPublications.GetValueOrDefault(head.EventId.ToString());
            var published = publication?.State == PublicationRowState.Published;
            if (!Uses(head.CurrentRevisionId) && !(published && Uses(publication!.RevisionId)))
            {
                continue;
            }

            var draft = JsonSerializer.Deserialize<EventDraft>(payloads[head.CurrentRevisionId], EventDraftRules.JsonOptions)!;
            if (published && head.CurrentRevisionId != publication!.RevisionId)
            {
                // 未公開の変更を、改名に紛れて公開しない。
                messages.Add($"イベント「{PublishCandidate.EventLabel(draft.Title)}」に未公開の変更があります。先に公開するか、公開中の内容に戻してから改名してください。");
                blocked = true;
                continue;
            }

            events.Add((head, draft, published));
        }

        return blocked ? null : new RenamePlan(spot, map, events);
    }
}
