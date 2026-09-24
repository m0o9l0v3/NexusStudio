using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Models;
using StudioApi.Publishing;

namespace StudioApi.Tests;

/// <summary>公開・取り下げ（15 v01 §8 Step 4 の障害試験、07 AC08〜AC16、11 RA-01〜RA-07）。</summary>
public sealed class PublishingTests : IAsyncLifetime
{
    private const string Occurrence = "0199a000-0000-7000-8000-000000000001";
    private const string AutumnOccurrence = "0199a000-0000-7000-8000-000000000002";
    private const string Day0920 = "0199a000-0000-7000-8000-000000000101";
    private const string Day1104WithoutHours = "0199a000-0000-7000-8000-000000000202";
    private const string Category = "0199a000-0000-7000-8000-000000000301";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly StudioApiFactory _root = new();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    /// <summary>設計用サンプルの開催日（2026-09-20 など）が未来になる日時。</summary>
    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FailingValidator(TimeProvider time) : CandidateValidator(time)
    {
        public override IReadOnlyList<ValidationFinding> Validate(PublishCandidate candidate) => throw new InvalidOperationException("検証サービスの障害（試験）");
    }

    private readonly FixedTime _time = new(new DateTimeOffset(2026, 9, 10, 1, 0, 0, TimeSpan.Zero));

    public async Task InitializeAsync()
    {
        _factory = _root.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(_time)));
        await _root.InitializeDatabaseAsync();
        await _root.AddAdminAsync();
        await ReferenceDataTests.ImportSampleAsync(_root);
        _client = await LoginAsync(_factory);
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _root.DisposeAsync();
    }

    private static async Task<HttpClient> LoginAsync(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        Assert.Equal(HttpStatusCode.NoContent, (await client.LoginAsync()).StatusCode);
        return client;
    }

    private async Task<(HttpResponseMessage Response, JsonNode? Body)> SendAsync(HttpMethod method, string path, object body, HttpClient? client = null)
    {
        client ??= _client;
        var token = await client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body, options: Json) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        var response = await client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        return (response, text.Length == 0 ? null : JsonNode.Parse(text));
    }

    private async Task<JsonNode> GetJsonAsync(string path) => JsonNode.Parse(await _client.GetStringAsync(path))!;

    private static JsonObject Entry(string kind, string id, string action = "publish", string? revisionId = null)
        => new() { ["targetKind"] = kind, ["targetId"] = id, ["action"] = action, ["revisionId"] = revisionId };

    private async Task<JsonNode> PreviewAsync(params JsonObject[] entries)
    {
        var (response, body) = await SendAsync(HttpMethod.Post, "/api/releases/preview", new JsonObject { ["entries"] = new JsonArray(entries) });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return body!;
    }

    private async Task<(HttpResponseMessage Response, JsonNode? Body)> PublishAsync(JsonNode preview, Guid? operationId = null, HttpClient? client = null)
        => await SendAsync(HttpMethod.Post, "/api/releases", new JsonObject
        {
            ["operationId"] = (operationId ?? Guid.NewGuid()).ToString(),
            ["entries"] = preview["validation"]!["entries"]!.DeepClone(),
            ["confirmedValidationId"] = preview["validation"]!["id"]!.DeepClone(),
            ["message"] = null,
        }, client);

    /// <summary>確認してから公開し、成功したことを確かめる。</summary>
    private async Task<JsonNode> PreviewAndPublishAsync(params JsonObject[] entries)
    {
        var preview = await PreviewAsync(entries);
        Assert.Equal(0, preview["validation"]!["blockingCount"]!.GetValue<int>());
        var (response, body) = await PublishAsync(preview);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("succeeded", body!["status"]!.GetValue<string>());
        return body;
    }

    private async Task PublishReferencesAsync()
    {
        var occurrence = await GetJsonAsync($"/api/occurrences/{Occurrence}");
        var categories = await GetJsonAsync("/api/categories");
        await PreviewAndPublishAsync(
            Entry("occurrence", Occurrence, revisionId: occurrence["revisionId"]!.GetValue<string>()),
            Entry("categories", "categories", revisionId: categories["revisionId"]!.GetValue<string>()));
    }

    private async Task<(string Id, string RevisionId)> CreateEventAsync(string dayId = Day0920, string spot = "mb_f2_cr_2a", string? title = "ロボット操作体験", string? occurrence = Occurrence)
    {
        var draft = new JsonObject
        {
            ["schemaVersion"] = "studio.event/1",
            ["title"] = title,
            ["description"] = "ロボットを操作します（設計用サンプル）",
            ["categoryId"] = Category,
            ["occurrenceId"] = occurrence,
            ["slots"] = new JsonArray(new JsonObject
            {
                ["slotId"] = Guid.NewGuid().ToString(),
                ["ocDayId"] = dayId,
                ["timeMode"] = "allDay",
                ["fixed"] = null,
                ["participation"] = "anytime",
                ["status"] = "normal",
                ["cancelNote"] = null,
                ["venues"] = new JsonArray(new JsonObject { ["canonicalSpotId"] = spot, ["note"] = null }),
            }),
        };
        var (response, body) = await SendAsync(HttpMethod.Post, "/api/events", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["draft"] = draft });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (body!["id"]!.GetValue<string>(), body["revisionId"]!.GetValue<string>());
    }

    private static IEnumerable<string> Codes(JsonNode preview, string severity = "blocking")
        => preview["validation"]!["findings"]!.AsArray().Where(f => f!["severity"]!.GetValue<string>() == severity).Select(f => f!["code"]!.GetValue<string>());

    private async Task<T> WithDbAsync<T>(Func<StudioDbContext, Task<T>> action)
    {
        await using var scope = _root.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<StudioDbContext>());
    }

    [Fact]
    public async Task Import_PublishesSpotsMarkedAsPublishedInTheFile()
    {
        var directory = await GetJsonAsync("/api/spots/directory");
        var states = directory["items"]!.AsArray().ToDictionary(i => i!["canonicalId"]!.GetValue<string>(), i => i!["publication"]!.GetValue<string>());
        Assert.Equal("published", states["mb_f2_cr_2a"]);
        Assert.Equal("unpublished", states["mb_f2_cr_2b"]);

        var release = await WithDbAsync(db => db.Releases.Include(r => r.Entries).SingleAsync());
        Assert.Equal(ReleaseSource.Import, release.Source);
        Assert.Equal(3, release.Entries.Count);
    }

    [Fact]
    public async Task Event_CannotBePublishedBeforeItsOccurrenceAndCategories()
    {
        var (id, revision) = await CreateEventAsync();
        var preview = await PreviewAsync(Entry("event", id, revisionId: revision));
        Assert.Contains("occurrence_unpublished", Codes(preview));
        Assert.Contains("category_unpublished", Codes(preview));

        // 公開阻止があるまま公開を送っても、公開しない。
        var (response, body) = await PublishAsync(preview);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("blocked", body!["code"]!.GetValue<string>());
        Assert.Equal("unpublished", (await GetJsonAsync($"/api/events/{id}"))["publication"]!["state"]!.GetValue<string>());
    }

    [Fact]
    public async Task Event_PublishesAfterReferences_AndLaterEditsShowAsUnpublishedChanges()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        var result = await PreviewAndPublishAsync(Entry("event", id, revisionId: revision));
        Assert.Equal("event", result["release"]!["entries"]![0]!["targetKind"]!.GetValue<string>());

        var detail = await GetJsonAsync($"/api/events/{id}");
        Assert.Equal("published", detail["publication"]!["state"]!.GetValue<string>());
        Assert.Equal(revision, detail["publication"]!["publishedRevisionId"]!.GetValue<string>());

        var draft = detail["draft"]!.DeepClone();
        draft["title"] = "ロボット操作体験（改題）";
        var (saved, _) = await SendAsync(HttpMethod.Put, $"/api/events/{id}", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = 1, ["draft"] = draft });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var list = await _client.GetFromJsonAsync<JsonArray>("/api/events", Json);
        Assert.Equal("publishedWithChanges", list!.Single()!["publication"]!.GetValue<string>());
    }

    [Fact]
    public async Task SameOperationId_CreatesOnlyOneRelease()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        var preview = await PreviewAsync(Entry("event", id, revisionId: revision));
        var operationId = Guid.NewGuid();

        var (first, firstBody) = await PublishAsync(preview, operationId);
        var (second, secondBody) = await PublishAsync(preview, operationId);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(firstBody!["release"]!["releaseId"]!.GetValue<string>(), secondBody!["release"]!["releaseId"]!.GetValue<string>());
        Assert.Equal(1, await WithDbAsync(db => db.Releases.CountAsync(r => r.OperationId == operationId)));

        // 結果確認中からの照会（RA-06）。届いていない操作IDは404（何も反映していない）。
        var lookup = await GetJsonAsync($"/api/operations/{operationId}");
        Assert.Equal("succeeded", lookup["status"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/operations/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task EditingAfterConfirmation_RequiresARecheck()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        var preview = await PreviewAsync(Entry("event", id, revisionId: revision));

        // 別のタブで保存してから、古い確認結果で公開する（07 E06、11 RA-04）。
        var detail = await GetJsonAsync($"/api/events/{id}");
        var draft = detail["draft"]!.DeepClone();
        draft["description"] = "別のタブで変更";
        await SendAsync(HttpMethod.Put, $"/api/events/{id}", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = 1, ["draft"] = draft });

        var (response, body) = await PublishAsync(preview);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("recheck_required", body!["code"]!.GetValue<string>());
        Assert.Contains("stale_revision", body!["validation"]!["findings"]!.AsArray().Select(f => f!["code"]!.GetValue<string>()));
        Assert.Equal("unpublished", (await GetJsonAsync($"/api/events/{id}"))["publication"]!["state"]!.GetValue<string>());
    }

    [Fact]
    public async Task RelatedPublicationChangedAfterConfirmation_RequiresARecheck()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        var preview = await PreviewAsync(Entry("event", id, revisionId: revision));

        // 確認の後に、会場のSpotが別の操作で公開し直された（07 AC15）。
        var spot = await GetJsonAsync("/api/spots/item?id=mb_f2_cr_2a");
        var spotDraft = spot["draft"]!.DeepClone();
        spotDraft["name"] = "2A教室（改称）";
        var (saved, savedBody) = await SendAsync(HttpMethod.Put, "/api/spots/item?id=mb_f2_cr_2a", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = spot["rowVersion"]!.DeepClone(), ["draft"] = spotDraft });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        await PreviewAndPublishAsync(Entry("spot", "mb_f2_cr_2a", revisionId: savedBody!["revisionId"]!.GetValue<string>()));

        var (response, body) = await PublishAsync(preview);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("recheck_required", body!["code"]!.GetValue<string>());
    }

    [Fact]
    public async Task UnrelatedIncompleteDrafts_DoNotBlockPublishing()
    {
        await PublishReferencesAsync();
        await CreateEventAsync(title: null, occurrence: null, spot: "mb_f2_cr_2b"); // 無関係な不完全な下書き（RA-01、AC10）
        var (id, revision) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: revision));
    }

    [Fact]
    public async Task UnpublishedSpot_BlocksAndIsNotPublishedAutomatically()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync(spot: "mb_f2_cr_2b");
        var preview = await PreviewAsync(Entry("event", id, revisionId: revision));
        var finding = preview["validation"]!["findings"]!.AsArray().Single(f => f!["code"]!.GetValue<string>() == "venue_spot_unpublished")!;
        Assert.Equal("slots[0].venues[0]", finding["path"]!.GetValue<string>());
        Assert.Equal("unpublished", (await GetJsonAsync("/api/spots/item?id=mb_f2_cr_2b"))["publication"]!["state"]!.GetValue<string>());
    }

    [Fact]
    public async Task AllDaySlot_WithoutPublicHours_IsBlocked()
    {
        var occurrence = await GetJsonAsync($"/api/occurrences/{AutumnOccurrence}");
        var categories = await GetJsonAsync("/api/categories");
        await PreviewAndPublishAsync(
            Entry("occurrence", AutumnOccurrence, revisionId: occurrence["revisionId"]!.GetValue<string>()),
            Entry("categories", "categories", revisionId: categories["revisionId"]!.GetValue<string>()));
        var (id, revision) = await CreateEventAsync(dayId: Day1104WithoutHours, occurrence: AutumnOccurrence);
        Assert.Contains("slot_all_day_hours_missing", Codes(await PreviewAsync(Entry("event", id, revisionId: revision))));
    }

    [Fact]
    public async Task PastSlot_IsAWarningNotABlock()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        _time.Now = new DateTimeOffset(2026, 9, 25, 1, 0, 0, TimeSpan.Zero);
        _client = await LoginAsync(_factory); // 時計を進めるとセッションの期限が切れるため
        var preview = await PreviewAsync(Entry("event", id, revisionId: revision));
        Assert.Contains("slot_in_past", Codes(preview, "warning"));
        Assert.Empty(Codes(preview));
    }

    [Fact]
    public async Task ValidatorFailure_IsNotTreatedAsPassing()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        await using var failing = _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => services.AddScoped<CandidateValidator, FailingValidator>()));
        var client = await LoginAsync(failing);

        var token = await client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/releases/preview") { Content = JsonContent.Create(new JsonObject { ["entries"] = new JsonArray(Entry("event", id, revisionId: revision)) }) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        var preview = JsonNode.Parse(await (await client.SendAsync(request)).Content.ReadAsStringAsync())!;
        Assert.Equal("failed", preview["validation"]!["status"]!.GetValue<string>());

        var (response, body) = await PublishAsync(preview, client: client);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("failed", body!["validation"]!["status"]!.GetValue<string>());
        Assert.Equal(0, await WithDbAsync(db => db.Publications.CountAsync(p => p.TargetKind == PublishTargetKind.Event)));
    }

    [Fact]
    public async Task Withdraw_IgnoresIncompleteDrafts_AndHidesTheEventFromTheDefaultList()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: revision));

        // 公開後に下書きを不完全にしても、取り下げはできる（07 AC13）。
        var detail = await GetJsonAsync($"/api/events/{id}");
        var draft = detail["draft"]!.DeepClone();
        draft["title"] = null;
        draft["slots"] = new JsonArray();
        await SendAsync(HttpMethod.Put, $"/api/events/{id}", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = 1, ["draft"] = draft });
        await PreviewAndPublishAsync(Entry("event", id, "withdraw"));

        Assert.Equal("withdrawn", (await GetJsonAsync($"/api/events/{id}"))["publication"]!["state"]!.GetValue<string>());
        Assert.Empty((await _client.GetFromJsonAsync<JsonArray>("/api/events", Json))!);
        Assert.Single((await _client.GetFromJsonAsync<JsonArray>("/api/events?publication=withdrawn", Json))!);
        // 下書きは残る。
        Assert.Null((await GetJsonAsync($"/api/events/{id}"))["draft"]!["title"]);
    }

    [Fact]
    public async Task Occurrence_UsedByAPublishedEvent_CannotBeWithdrawn()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: revision));
        Assert.Contains("occurrence_in_use", Codes(await PreviewAsync(Entry("occurrence", Occurrence, "withdraw"))));
    }

    [Fact]
    public async Task ChangingPublicHours_ReportsTheAllDaySlotsItMoves()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: revision));

        var occurrence = await GetJsonAsync($"/api/occurrences/{Occurrence}");
        var draft = occurrence["draft"]!.DeepClone();
        draft["days"]![0]!["publicEnd"] = "17:00";
        var (_, saved) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{Occurrence}", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = occurrence["rowVersion"]!.DeepClone(), ["draft"] = draft });
        var preview = await PreviewAsync(Entry("occurrence", Occurrence, revisionId: saved!["revisionId"]!.GetValue<string>()));
        var impact = preview["validation"]!["findings"]!.AsArray().Single(f => f!["code"]!.GetValue<string>() == "all_day_times_change")!;
        Assert.Equal("event", impact["targetKind"]!.GetValue<string>());
        Assert.Equal(id, impact["targetId"]!.GetValue<string>());
    }

    [Fact]
    public async Task SavesPublishesAndSignInsAreLogged()
    {
        await PublishReferencesAsync();
        await CreateEventAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().LoginAsync(password: "wrong password here")).StatusCode);

        var actions = await WithDbAsync(db => db.OperationLogs.Select(l => new { l.Action, l.Status, l.Detail }).ToListAsync());
        Assert.Contains(actions, a => a.Action == OperationAction.Import);
        Assert.Contains(actions, a => a.Action == OperationAction.SignIn);
        Assert.Contains(actions, a => a.Action == OperationAction.Save);
        Assert.Contains(actions, a => a.Action == OperationAction.Publish && a.Status == OperationStatus.Succeeded);
        var failed = Assert.Single(actions, a => a.Action == OperationAction.SignInFailed);
        Assert.DoesNotContain("wrong", failed.Detail ?? string.Empty);
    }

    // ---- 復旧・履歴・操作ログ（Step 4-2） ----

    private async Task<string> SaveEventAsync(string id, Action<JsonNode> change)
    {
        var detail = await GetJsonAsync($"/api/events/{id}");
        var draft = detail["draft"]!.DeepClone();
        change(draft);
        var (response, body) = await SendAsync(HttpMethod.Put, $"/api/events/{id}", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = detail["rowVersion"]!.DeepClone(), ["draft"] = draft });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return body!["revisionId"]!.GetValue<string>();
    }

    [Fact]
    public async Task Restore_PublishesTheOldVersion_AndStashesTheUnpublishedDraft()
    {
        await PublishReferencesAsync();
        var (id, first) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: first));
        var second = await SaveEventAsync(id, draft => draft["title"] = "第2版");
        await PreviewAndPublishAsync(Entry("event", id, revisionId: second));
        var unpublished = await SaveEventAsync(id, draft => draft["title"] = "公開していない下書き");

        var preview = await PreviewAsync(Entry("event", id, "restore", first));
        Assert.Contains("restore_stashes_draft", Codes(preview, "info"));
        var result = await PreviewAndPublishAsync(Entry("event", id, "restore", first));
        var entry = result["release"]!["entries"]![0]!;
        Assert.Equal("restore", entry["action"]!.GetValue<string>());
        Assert.Equal(first, entry["restoredFromRevisionId"]!.GetValue<string>());
        Assert.Equal(unpublished, entry["stashedRevisionId"]!.GetValue<string>());

        // 下書きも戻した版の内容になり、公開中と一致する。退避した下書きは履歴の詳細から参照できる（RL-12、RA-09）。
        var detail = await GetJsonAsync($"/api/events/{id}");
        Assert.Equal("ロボット操作体験", detail["draft"]!["title"]!.GetValue<string>());
        Assert.Equal("published", detail["publication"]!["state"]!.GetValue<string>());
        var history = await GetJsonAsync($"/api/releases/{result["release"]!["releaseId"]!.GetValue<string>()}");
        Assert.Equal("公開していない下書き", history["entries"]![0]!["stash"]!["event"]!["published"]!["title"]!.GetValue<string>());
        Assert.Equal("第2版", history["entries"]![0]!["changes"]!["event"]!["published"]!["title"]!.GetValue<string>());
    }

    [Fact]
    public async Task Restore_RequiresAVersionThatWasPublished()
    {
        await PublishReferencesAsync();
        var (id, first) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: first));
        var neverPublished = await SaveEventAsync(id, draft => draft["title"] = "未公開の版");
        Assert.Contains("restore_revision_not_published", Codes(await PreviewAsync(Entry("event", id, "restore", neverPublished))));
        Assert.Contains("no_changes", Codes(await PreviewAsync(Entry("event", id, "restore", first))) );
    }

    [Fact]
    public async Task Restore_Occurrence_CannotDropADayThatDraftsUse()
    {
        await PublishReferencesAsync();
        var original = (await GetJsonAsync($"/api/occurrences/{Occurrence}"))["revisionId"]!.GetValue<string>();
        var occurrence = await GetJsonAsync($"/api/occurrences/{Occurrence}");
        var draft = occurrence["draft"]!.DeepClone();
        var newDay = Guid.NewGuid().ToString();
        draft["days"]!.AsArray().Add(new JsonObject { ["id"] = newDay, ["date"] = "2026-09-22", ["publicStart"] = "10:00", ["publicEnd"] = "15:00", ["status"] = "normal", ["cancelNote"] = null });
        var (savedResponse, saved) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{Occurrence}", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = occurrence["rowVersion"]!.DeepClone(), ["draft"] = draft });
        Assert.True(savedResponse.IsSuccessStatusCode, saved?.ToJsonString());
        await PreviewAndPublishAsync(Entry("occurrence", Occurrence, revisionId: saved!["revisionId"]!.GetValue<string>()));
        await CreateEventAsync(dayId: newDay);

        Assert.Contains("restore_day_in_use", Codes(await PreviewAsync(Entry("occurrence", Occurrence, "restore", original))));
    }

    [Fact]
    public async Task Restore_WarnsWhenAllDayTimesDifferFromThen()
    {
        await PublishReferencesAsync();
        var (id, first) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: first));

        var occurrence = await GetJsonAsync($"/api/occurrences/{Occurrence}");
        var draft = occurrence["draft"]!.DeepClone();
        draft["days"]![0]!["publicEnd"] = "17:00";
        var (_, saved) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{Occurrence}", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["rowVersion"] = occurrence["rowVersion"]!.DeepClone(), ["draft"] = draft });
        await PreviewAndPublishAsync(Entry("occurrence", Occurrence, revisionId: saved!["revisionId"]!.GetValue<string>()));
        var second = await SaveEventAsync(id, d => d["title"] = "第2版");
        await PreviewAndPublishAsync(Entry("event", id, revisionId: second));

        // 当時は 10:00–16:00、現在は 10:00–17:00（11 RA-10）。
        Assert.Contains("restore_all_day_time_differs", Codes(await PreviewAsync(Entry("event", id, "restore", first)), "warning"));
    }

    [Fact]
    public async Task ReleaseHistory_ListsNewestFirst_AndFiltersByTarget()
    {
        await PublishReferencesAsync();
        var (id, first) = await CreateEventAsync();
        await PreviewAndPublishAsync(Entry("event", id, revisionId: first));

        var all = await GetJsonAsync("/api/releases");
        var sequences = all["items"]!.AsArray().Select(i => i!["sequence"]!.GetValue<long>()).ToList();
        Assert.Equal(new long[] { 3, 2, 1 }, sequences);
        var events = await GetJsonAsync($"/api/releases?targetKind=event&targetId={id}");
        var release = Assert.Single(events["items"]!.AsArray())!;

        var detail = await GetJsonAsync($"/api/releases/{release["releaseId"]!.GetValue<string>()}");
        var entry = detail["entries"]![0]!;
        Assert.True(entry["isCurrent"]!.GetValue<bool>());
        Assert.False(entry["canRestore"]!.GetValue<bool>());
        Assert.Null(entry["changes"]!["event"]!["published"]);
        Assert.Equal("ロボット操作体験", entry["changes"]!["event"]!["candidate"]!["title"]!.GetValue<string>());
        // 当時の参照データ（終日の時刻）も返す。
        Assert.Contains(detail["candidate"]!["days"]!.AsArray(), d => d!["id"]!.GetValue<string>() == Day0920);
    }

    [Fact]
    public async Task Logs_CanBeFilteredByActionStatusAndDate()
    {
        await PublishReferencesAsync();
        await CreateEventAsync();
        await _factory.CreateClient().LoginAsync(password: "wrong password here");

        var publishes = await GetJsonAsync("/api/logs?action=publish");
        var publish = Assert.Single(publishes["items"]!.AsArray())!;
        Assert.Equal(1, publish["releaseSequence"]!.GetValue<long>() - 1); // 取り込みの公開が #1
        Assert.Equal("m09", publish["actor"]!["displayName"]!.GetValue<string>());

        Assert.Single((await GetJsonAsync("/api/logs?status=failed"))["items"]!.AsArray());
        Assert.NotEmpty((await GetJsonAsync("/api/logs?date=2026-09-10"))["items"]!.AsArray());
        Assert.Empty((await GetJsonAsync("/api/logs?date=2026-09-11"))["items"]!.AsArray());

        var id = publish["id"]!.GetValue<string>();
        Assert.Equal(id, (await GetJsonAsync($"/api/logs/{id}"))["id"]!.GetValue<string>());
    }

    // ---- 全下書き診断（Step 4-3） ----

    private async Task<JsonNode> DiagnoseAsync(HttpClient? client = null)
    {
        var (response, body) = await SendAsync(HttpMethod.Post, "/api/validation/draft", new JsonObject(), client);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return body!;
    }

    private static JsonNode Area(JsonNode diagnosis, string kind)
        => diagnosis["areas"]!.AsArray().Single(a => a!["targetKind"]!.GetValue<string>() == kind)!;

    [Fact]
    public async Task Diagnosis_ChecksUnpublishedDrafts_AndSkipsTargetsThatMatchThePublishedVersion()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await _client.GetAsync("/api/validation/draft/latest")).StatusCode);
        await PublishReferencesAsync();
        var (id, _) = await CreateEventAsync(title: null);

        var diagnosis = await DiagnoseAsync();
        Assert.Equal("ok", diagnosis["status"]!.GetValue<string>());
        Assert.False(diagnosis["stale"]!.GetValue<bool>());
        Assert.Equal(1, Area(diagnosis, "event")["targetCount"]!.GetValue<int>());
        // 公開済みで変更の無い開催回（9/20・9/21）とカテゴリ一覧は診断しない。未公開の秋の開催回は診断する。
        Assert.Equal(1, Area(diagnosis, "occurrence")["targetCount"]!.GetValue<int>());
        Assert.Equal(0, Area(diagnosis, "categories")["targetCount"]!.GetValue<int>());
        // 取り込みで公開済みのSpotは対象外、未公開の mb_f2_cr_2b だけが対象。
        Assert.Equal(1, Area(diagnosis, "spot")["targetCount"]!.GetValue<int>());
        var finding = diagnosis["findings"]!.AsArray().Single(f => f!["code"]!.GetValue<string>() == "title_required")!;
        Assert.Equal(id, finding["targetId"]!.GetValue<string>());

        var latest = await GetJsonAsync("/api/validation/draft/latest");
        Assert.Equal(diagnosis["id"]!.GetValue<string>(), latest["id"]!.GetValue<string>());
    }

    [Fact]
    public async Task Diagnosis_IsMarkedStaleAfterADraftChanges()
    {
        var (id, _) = await CreateEventAsync();
        await DiagnoseAsync();
        await SaveEventAsync(id, draft => draft["title"] = "診断の後に変更");
        Assert.True((await GetJsonAsync("/api/validation/draft/latest"))["stale"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Diagnosis_CannotBeUsedToConfirmAPublish()
    {
        await PublishReferencesAsync();
        var (id, revision) = await CreateEventAsync();
        var diagnosis = await DiagnoseAsync();
        var (response, _) = await SendAsync(HttpMethod.Post, "/api/releases", new JsonObject
        {
            ["operationId"] = Guid.NewGuid().ToString(),
            ["entries"] = new JsonArray(Entry("event", id, revisionId: revision)),
            ["confirmedValidationId"] = diagnosis["id"]!.DeepClone(),
            ["message"] = null,
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("unpublished", (await GetJsonAsync($"/api/events/{id}"))["publication"]!["state"]!.GetValue<string>());
    }

    [Fact]
    public async Task Diagnosis_ValidatorFailure_IsNotReportedAsNoProblems()
    {
        await CreateEventAsync(title: null);
        await using var failing = _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => services.AddScoped<CandidateValidator, FailingValidator>()));
        var diagnosis = await DiagnoseAsync(await LoginAsync(failing));
        Assert.Equal("failed", diagnosis["status"]!.GetValue<string>());
        Assert.Empty(diagnosis["findings"]!.AsArray());
    }
}
