using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Publishing;

public sealed record PreviewRequest(IReadOnlyList<PublishEntry>? Entries);

public sealed record EventSides(EventDraft? Published, EventDraft? Candidate);

public sealed record OccurrenceSides(OccurrenceDraft? Published, OccurrenceDraft? Candidate);

public sealed record CategorySides(IReadOnlyList<CategoryDraft>? Published, IReadOnlyList<CategoryDraft>? Candidate);

public sealed record SpotSides(SpotDraft? Published, SpotDraft? Candidate);

/// <summary>公開確認の対象1件（左：公開中との差分。17 §3）。種類に応じて1つの Sides だけが入る。</summary>
/// <param name="Publication">現在の公開状態。</param>
public sealed record PreviewItem(
    string TargetKind,
    string TargetId,
    string Label,
    string Action,
    Guid? RevisionId,
    PublicationSummary Publication,
    EventSides? Event,
    OccurrenceSides? Occurrence,
    CategorySides? Categories,
    SpotSides? Spot);

/// <summary>差分の表示に使う参照先（開催日・Spot・カテゴリ）の名称と時間。公開中と公開後の候補の両方を返す。</summary>
public sealed record PreviewDay(Guid Id, Guid OccurrenceId, DateOnly? Date, string? PublicStart, string? PublicEnd, string Status);

public sealed record PreviewSpot(string CanonicalId, string Name, string? BuildingName, string? FloorName, string Utilization);

public sealed record PreviewReferences(IReadOnlyList<PreviewDay> Days, IReadOnlyList<PreviewSpot> Spots, IReadOnlyList<CategoryDraft> Categories);

public sealed record PublishPreview(
    ValidationRunResult Validation,
    IReadOnlyList<PreviewItem> Items,
    PreviewReferences Published,
    PreviewReferences Candidate);

public sealed record PublishRequest(Guid OperationId, IReadOnlyList<PublishEntry>? Entries, Guid ConfirmedValidationId, string? Message);

/// <param name="Code">recheck_required（確認後に変更があった）／blocked（公開阻止の問題がある、または検証処理が失敗した）。</param>
public sealed record PublishRejected(string Code, string Title, ValidationRunResult Validation);

public sealed record PublishBadRequest(string Code, string Title);

/// <summary>公開確認・公開・結果の照会（15 v01 §5.3、17、11 RL-01〜RL-07・RL-13）。</summary>
public static class ReleaseEndpoints
{
    public static IEndpointRouteBuilder MapReleaseEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/releases").WithTags("Releases");
        group.MapPost("/preview", PreviewAsync);
        group.MapPost("/", PublishAsync);
        group.MapGet("/{id:guid}", GetAsync);
        app.MapGet("/api/operations/{operationId:guid}", GetOperationAsync).WithTags("Releases");
        return app;
    }

    private static async Task<Results<Ok<PublishPreview>, BadRequest<PublishBadRequest>>> PreviewAsync(
        PreviewRequest request, PublishingService publishing, ClaimsPrincipal principal, UserManager<StudioAdmin> userManager)
    {
        if (request.Entries is not { Count: > 0 and <= PublishingService.MaxEntries })
        {
            return TypedResults.BadRequest(new PublishBadRequest("invalid_request", "公開する対象を1〜100件指定してください。"));
        }

        var (candidate, validation) = await publishing.ValidateAsync(request.Entries, ReferenceSaving.CurrentAdminId(principal, userManager));
        var items = candidate.Items.Select(item => ToPreviewItem(candidate, item)).ToList();
        return TypedResults.Ok(new PublishPreview(
            validation,
            items,
            References(candidate.Before, candidate, items),
            References(candidate.After, candidate, items)));
    }

    private static async Task<Results<Ok<OperationResult>, BadRequest<PublishBadRequest>, Conflict<PublishRejected>, UnprocessableEntity<PublishRejected>>> PublishAsync(
        PublishRequest request, PublishingService publishing, ClaimsPrincipal principal, UserManager<StudioAdmin> userManager)
    {
        var outcome = await publishing.PublishAsync(
            request.OperationId, request.Entries ?? [], request.ConfirmedValidationId, request.Message, ReferenceSaving.CurrentAdminId(principal, userManager));
        return outcome.Kind switch
        {
            PublishOutcomeKind.InvalidRequest => TypedResults.BadRequest(new PublishBadRequest("invalid_request", outcome.Error!)),
            PublishOutcomeKind.RecheckRequired => TypedResults.Conflict(new PublishRejected("recheck_required", "確認した後に内容が変わりました。最新の内容で確認し直してください。", outcome.Validation!)),
            PublishOutcomeKind.Blocked => TypedResults.UnprocessableEntity(new PublishRejected("blocked", "公開できない問題があるため公開しませんでした。", outcome.Validation!)),
            _ => TypedResults.Ok(outcome.Result!),
        };
    }

    private static async Task<Results<Ok<ReleaseSummary>, NotFound>> GetAsync(Guid id, PublishingService publishing)
        => await publishing.LoadReleaseAsync(id) is { } release ? TypedResults.Ok(release) : TypedResults.NotFound();

    /// <summary>結果確認中からの照会。記録が無ければ、その操作はサーバーに届いていない（何も反映していない）。</summary>
    private static async Task<Results<Ok<OperationResult>, NotFound>> GetOperationAsync(Guid operationId, PublishingService publishing)
        => await publishing.GetOperationAsync(operationId) is { } result ? TypedResults.Ok(result) : TypedResults.NotFound();

    private static PreviewItem ToPreviewItem(PublishCandidate candidate, CandidateItem item)
    {
        var entry = item.Entry;
        var summary = new PublicationSummary(PublicationState.Of(item.Publication, item.CurrentRevisionId), item.Publication?.RevisionId, item.Publication?.UpdatedAt);
        EventSides? eventSides = null;
        OccurrenceSides? occurrenceSides = null;
        CategorySides? categorySides = null;
        SpotSides? spotSides = null;

        switch (entry.TargetKind)
        {
            case PublishTargetKind.Event when Guid.TryParse(entry.TargetId, out var id):
                eventSides = new(candidate.Before.Events.TryGetValue(id, out var e) ? e.Draft : null, item.CandidatePayload as EventDraft);
                break;
            case PublishTargetKind.Occurrence when Guid.TryParse(entry.TargetId, out var id):
                occurrenceSides = new(candidate.Before.Occurrences.TryGetValue(id, out var o) ? o.Draft : null, item.CandidatePayload as OccurrenceDraft);
                break;
            case PublishTargetKind.Categories:
                categorySides = new(candidate.Before.Categories?.Items, item.CandidatePayload as List<CategoryDraft>);
                break;
            case PublishTargetKind.Spot:
                spotSides = new(candidate.Before.Spots.TryGetValue(entry.TargetId, out var s) ? s.Draft : null, item.CandidatePayload as SpotDraft);
                break;
        }

        return new PreviewItem(entry.TargetKind, entry.TargetId, item.Label, entry.Action, entry.RevisionId, summary, eventSides, occurrenceSides, categorySides, spotSides);
    }

    /// <summary>差分に出てくる開催日・Spot・カテゴリだけを返す。</summary>
    private static PreviewReferences References(PublishedSet set, PublishCandidate candidate, IReadOnlyList<PreviewItem> items)
    {
        var events = items.SelectMany(i => new[] { i.Event?.Published, i.Event?.Candidate }).OfType<EventDraft>().ToList();
        var dayIds = events.SelectMany(e => e.Slots).Select(s => s.OcDayId).OfType<Guid>().ToHashSet();
        var occurrenceIds = items.Where(i => i.TargetKind == PublishTargetKind.Occurrence && Guid.TryParse(i.TargetId, out _)).Select(i => Guid.Parse(i.TargetId)).ToHashSet();
        var spotIds = events.SelectMany(e => e.Slots).SelectMany(s => s.Venues).Select(v => v.CanonicalSpotId).ToHashSet(StringComparer.Ordinal);

        var days = set.Occurrences
            .SelectMany(o => o.Value.Draft.Days.Select(d => (OccurrenceId: o.Key, Day: d)))
            .Where(x => dayIds.Contains(x.Day.Id) || occurrenceIds.Contains(x.OccurrenceId))
            .Select(x => new PreviewDay(x.Day.Id, x.OccurrenceId, x.Day.Date, x.Day.PublicStart, x.Day.PublicEnd, x.Day.Status))
            .ToList();

        // 公開されていないSpotも、名称が分かるよう現在の行から返す（公開状態は検証の所見で示す）。
        var spots = spotIds.Select(id => set.Spots.TryGetValue(id, out var published)
                ? new PreviewSpot(id, published.Draft.Name ?? id, candidate.SpotRows.GetValueOrDefault(id)?.BuildingName, candidate.SpotRows.GetValueOrDefault(id)?.FloorName, published.Draft.Utilization)
                : candidate.SpotRows.TryGetValue(id, out var row) ? new PreviewSpot(id, row.Name, row.BuildingName, row.FloorName, row.Utilization) : null)
            .OfType<PreviewSpot>()
            .ToList();

        return new PreviewReferences(days, spots, set.Categories?.Items ?? []);
    }
}
