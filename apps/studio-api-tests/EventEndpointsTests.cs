using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Events;

namespace StudioApi.Tests;

public sealed class EventEndpointsTests : IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly StudioApiFactory _factory = new();
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _factory.InitializeDatabaseAsync();
        await _factory.AddAdminAsync();
        _client = _factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.NoContent, (await _client.LoginAsync()).StatusCode);
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    /// <summary>複数枠・複数会場・終日・随時参加・未選択を含む下書き（07 AC01〜AC08、AC21〜AC26 の組み合わせ）。</summary>
    private static JsonObject RichDraft() => JsonNode.Parse("""
        {
          "schemaVersion": "studio.event/1",
          "title": "ロボット操作体験",
          "description": "ロボットを操作し、\n技術の仕組みを体験します。",
          "categoryId": null,
          "occurrenceId": "0199a000-0000-7000-8000-000000000001",
          "slots": [
            {
              "slotId": "0199a000-0000-7000-8000-00000000a001",
              "ocDayId": "0199a000-0000-7000-8000-000000000101",
              "timeMode": "fixed",
              "fixed": { "start": "10:00", "end": "11:00" },
              "participation": "atStart",
              "status": "normal",
              "cancelNote": null,
              "venues": [ { "canonicalSpotId": "mb_f2_rm_2a", "note": "受付" } ]
            },
            {
              "slotId": "0199a000-0000-7000-8000-00000000a002",
              "ocDayId": "0199a000-0000-7000-8000-000000000101",
              "timeMode": "fixed",
              "fixed": { "start": "14:00", "end": null },
              "participation": "anytime",
              "status": "normal",
              "cancelNote": null,
              "venues": [
                { "canonicalSpotId": "mb_f2_rm_2b", "note": "体験会場" },
                { "canonicalSpotId": "mb_f2_rm_2a", "note": null },
                { "canonicalSpotId": "MB_F2_RM_2A", "note": "大文字小文字だけ違う別のID" }
              ]
            },
            {
              "slotId": "0199a000-0000-7000-8000-00000000a003",
              "ocDayId": "0199a000-0000-7000-8000-000000000102",
              "timeMode": "allDay",
              "fixed": null,
              "participation": null,
              "status": "normal",
              "cancelNote": null,
              "venues": []
            }
          ]
        }
        """)!.AsObject();

    private static JsonObject EmptyDraft() => JsonNode.Parse("""{ "schemaVersion": "studio.event/1", "title": null, "description": null, "categoryId": null, "occurrenceId": null, "slots": [] }""")!.AsObject();

    private async Task<(HttpResponseMessage Response, JsonObject? Body)> SendAsync(HttpMethod method, string path, object body)
    {
        var token = await _client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body, options: Json) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        var response = await _client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        return (response, text.Length == 0 ? null : JsonNode.Parse(text)!.AsObject());
    }

    private Task<(HttpResponseMessage Response, JsonObject? Body)> CreateAsync(JsonObject draft, Guid? operationId = null)
        => SendAsync(HttpMethod.Post, "/api/events", new JsonObject { ["operationId"] = (operationId ?? Guid.NewGuid()).ToString(), ["draft"] = draft.DeepClone() });

    private Task<(HttpResponseMessage Response, JsonObject? Body)> UpdateAsync(string id, long rowVersion, JsonObject draft, Guid? operationId = null)
        => SendAsync(HttpMethod.Put, $"/api/events/{id}", new JsonObject
        {
            ["operationId"] = (operationId ?? Guid.NewGuid()).ToString(),
            ["rowVersion"] = rowVersion,
            ["draft"] = draft.DeepClone(),
        });

    private async Task<JsonObject> GetAsync(string id)
        => JsonNode.Parse(await _client.GetStringAsync($"/api/events/{id}"))!.AsObject();

    [Fact]
    public async Task EventsApi_RequiresLogin()
    {
        var anonymous = _factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/events")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/reference")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/spots")).StatusCode);
    }

    [Fact]
    public async Task Create_WithoutCsrfToken_IsRejected()
    {
        var response = await _client.PostAsJsonAsync("/api/events", new { operationId = Guid.NewGuid(), draft = EmptyDraft() });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var scope = _factory.Services.CreateAsyncScope();
        Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<StudioDbContext>().EventHeads.CountAsync());
    }

    [Fact]
    public async Task Create_AcceptsAnIncompleteDraft()
    {
        // 会場0件・カテゴリ未選択・参加案内未選択でも下書き保存できる（15 v01 Step 2 完了条件1）。
        var (response, body) = await CreateAsync(RichDraft());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, body!["rowVersion"]!.GetValue<long>());
        Assert.Equal("unpublished", body["publication"]!.GetValue<string>());
        Assert.Equal("m09", body["updatedBy"]!["displayName"]!.GetValue<string>());

        var (emptyResponse, _) = await CreateAsync(EmptyDraft());
        Assert.Equal(HttpStatusCode.Created, emptyResponse.StatusCode);
    }

    [Fact]
    public async Task SavedDraft_RoundTripsWithoutLosingOrChangingAnything()
    {
        // 枠順・会場順・会場補足・時間方式・参加案内・canonical ID（大文字小文字）が1つも欠けない（完了条件2・3）。
        var draft = RichDraft();
        var (_, created) = await CreateAsync(draft);
        var reloaded = await GetAsync(created!["id"]!.GetValue<string>());

        Assert.True(JsonNode.DeepEquals(draft, reloaded["draft"]), $"expected {draft.ToJsonString()}\nactual   {reloaded["draft"]!.ToJsonString()}");
        var venues = reloaded["draft"]!["slots"]![1]!["venues"]!.AsArray().Select(v => v!["canonicalSpotId"]!.GetValue<string>()).ToArray();
        Assert.Equal(["mb_f2_rm_2b", "mb_f2_rm_2a", "MB_F2_RM_2A"], venues);
    }

    [Fact]
    public async Task Update_CreatesANewRevisionAndAdvancesTheHead()
    {
        var (_, created) = await CreateAsync(EmptyDraft());
        var id = created!["id"]!.GetValue<string>();

        var draft = RichDraft();
        var (response, updated) = await UpdateAsync(id, 1, draft);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, updated!["rowVersion"]!.GetValue<long>());
        Assert.NotEqual(created["revisionId"]!.GetValue<string>(), updated["revisionId"]!.GetValue<string>());
        Assert.True(JsonNode.DeepEquals(draft, (await GetAsync(id))["draft"]));

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
        var revisions = await db.EventRevisions.Where(r => r.EventId == Guid.Parse(id)).ToListAsync();
        Assert.Equal(2, revisions.Count);
        Assert.Contains(revisions, r => r.BaseRevisionId == Guid.Parse(created["revisionId"]!.GetValue<string>()));
    }

    [Fact]
    public async Task Update_WithStaleRowVersion_Returns409WithTheLatestAndDoesNotOverwrite()
    {
        // 2つのタブで同じイベントを開き、片方で保存してからもう片方で保存する（完了条件4）。
        var (_, created) = await CreateAsync(EmptyDraft());
        var id = created!["id"]!.GetValue<string>();

        var first = RichDraft();
        Assert.Equal(HttpStatusCode.OK, (await UpdateAsync(id, 1, first)).Response.StatusCode);

        var second = EmptyDraft();
        second["title"] = "別タブの入力";
        var (response, body) = await UpdateAsync(id, 1, second);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("conflict", body!["code"]!.GetValue<string>());
        Assert.Equal(2, body["latest"]!["rowVersion"]!.GetValue<long>());
        Assert.True(JsonNode.DeepEquals(first, body["latest"]!["draft"]));
        Assert.True(JsonNode.DeepEquals(first, (await GetAsync(id))["draft"]));
    }

    [Fact]
    public async Task RetriedSave_WithTheSameOperationId_DoesNotDuplicateOrConflict()
    {
        var createOperation = Guid.NewGuid();
        var (_, created) = await CreateAsync(EmptyDraft(), createOperation);
        var (retryCreate, retried) = await CreateAsync(EmptyDraft(), createOperation);
        Assert.Equal(HttpStatusCode.OK, retryCreate.StatusCode);
        Assert.Equal(created!["id"]!.GetValue<string>(), retried!["id"]!.GetValue<string>());

        var id = created["id"]!.GetValue<string>();
        var updateOperation = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await UpdateAsync(id, 1, RichDraft(), updateOperation)).Response.StatusCode);
        // 応答が届かなかったと判断した再送。rowVersionは古いままだが、同じ操作なので競合にしない。
        var (retryUpdate, body) = await UpdateAsync(id, 1, RichDraft(), updateOperation);
        Assert.Equal(HttpStatusCode.OK, retryUpdate.StatusCode);
        Assert.Equal(2, body!["rowVersion"]!.GetValue<long>());

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
        Assert.Equal(1, await db.EventHeads.CountAsync());
        Assert.Equal(2, await db.EventRevisions.CountAsync());
    }

    [Fact]
    public async Task Save_RejectsTheSameVenueTwiceInOneSlot()
    {
        var draft = RichDraft();
        draft["slots"]![0]!["venues"]!.AsArray().Add(new JsonObject { ["canonicalSpotId"] = "mb_f2_rm_2a", ["note"] = null });

        var (response, body) = await CreateAsync(draft);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(body!["problems"]!.AsArray(), p => p!["code"]!.GetValue<string>() == "duplicate_venue" && p["path"]!.GetValue<string>() == "slots[0].venues[1].canonicalSpotId");
    }

    [Theory]
    [InlineData("""{ "start": "9:00", "end": "10:00" }""", "fixed", "invalid_time")]
    [InlineData("""{ "start": "10:00", "end": "24:00" }""", "fixed", "invalid_time")]
    [InlineData("""{ "start": "10:00", "end": "11:00" }""", "allDay", "inconsistent")]
    public async Task Save_RejectsMalformedTimes(string fixedJson, string timeMode, string expectedCode)
    {
        var draft = RichDraft();
        draft["slots"]![0]!["timeMode"] = timeMode;
        draft["slots"]![0]!["fixed"] = JsonNode.Parse(fixedJson);

        var (response, body) = await CreateAsync(draft);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(body!["problems"]!.AsArray(), p => p!["code"]!.GetValue<string>() == expectedCode);
    }

    [Theory]
    [InlineData("timeMode", "sometimes")]
    [InlineData("participation", "always")]
    [InlineData("status", "paused")]
    public async Task Save_RejectsUnknownEnumValues(string field, string value)
    {
        var draft = RichDraft();
        draft["slots"]![0]![field] = value;
        if (field == "timeMode")
        {
            draft["slots"]![0]!["fixed"] = null;
        }

        var (response, _) = await CreateAsync(draft);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Save_RejectsDuplicateSlotIdsAndUnsupportedSchema()
    {
        var draft = RichDraft();
        draft["slots"]![1]!["slotId"] = draft["slots"]![0]!["slotId"]!.GetValue<string>();
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateAsync(draft)).Response.StatusCode);

        var unsupported = EmptyDraft();
        unsupported["schemaVersion"] = "studio.event/2";
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateAsync(unsupported)).Response.StatusCode);
    }

    [Fact]
    public async Task Update_UnknownEvent_Returns404()
    {
        var (response, _) = await UpdateAsync(Guid.NewGuid().ToString(), 1, EmptyDraft());
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/events/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task List_SummarizesSlotsVenuesAndDatesAndFilters()
    {
        await ReferenceDataTests.ImportSampleAsync(_factory);
        var (_, rich) = await CreateAsync(RichDraft());
        var other = EmptyDraft();
        other["title"] = "施設見学ツアー";
        await CreateAsync(other);

        var all = await _client.GetFromJsonAsync<List<EventListItem>>("/api/events", Json);
        Assert.Equal(2, all!.Count);
        var item = all.Single(i => i.Id == Guid.Parse(rich!["id"]!.GetValue<string>()));
        Assert.Equal(3, item.SlotCount);
        Assert.Equal(3, item.VenueCount); // mb_f2_rm_2a・mb_f2_rm_2b・MB_F2_RM_2A は別の会場
        Assert.Equal([new DateOnly(2026, 9, 20), new DateOnly(2026, 9, 20), new DateOnly(2026, 9, 21)], item.Slots.Select(s => s.Date!.Value));
        Assert.Equal("unpublished", item.Publication);

        var searched = await _client.GetFromJsonAsync<List<EventListItem>>("/api/events?q=ロボット", Json);
        Assert.Equal(item.Id, Assert.Single(searched!).Id);

        var byOccurrence = await _client.GetFromJsonAsync<List<EventListItem>>("/api/events?occurrenceId=0199a000-0000-7000-8000-000000000001", Json);
        Assert.Equal(item.Id, Assert.Single(byOccurrence!).Id);
    }
}
