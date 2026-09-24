using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;
using StudioApi.Reference;

namespace StudioApi.Tests;

public sealed class ReferenceEditingTests : IAsyncLifetime
{
    private const string SampleOccurrence = "0199a000-0000-7000-8000-000000000001";
    private const string Day0920 = "0199a000-0000-7000-8000-000000000101";
    private const string Day0921 = "0199a000-0000-7000-8000-000000000102";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly StudioApiFactory _factory = new();
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _factory.InitializeDatabaseAsync();
        await _factory.AddAdminAsync();
        await ReferenceDataTests.ImportSampleAsync(_factory);
        _client = _factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.NoContent, (await _client.LoginAsync()).StatusCode);
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<(HttpResponseMessage Response, JsonNode? Body)> SendAsync(HttpMethod method, string path, object body)
    {
        var token = await _client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body, options: Json) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        var response = await _client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        return (response, text.Length == 0 ? null : JsonNode.Parse(text));
    }

    private async Task<JsonNode> GetJsonAsync(string path) => JsonNode.Parse(await _client.GetStringAsync(path))!;

    private static JsonObject Save(long rowVersion, JsonNode draft, Guid? operationId = null) => new()
    {
        ["operationId"] = (operationId ?? Guid.NewGuid()).ToString(),
        ["rowVersion"] = rowVersion,
        ["draft"] = draft.DeepClone(),
    };

    /// <summary>設計用サンプルの開催日9/20を参照するイベントを作る。</summary>
    private async Task CreateEventOnDayAsync(string dayId, string canonicalId = "mb_f2_cr_2a", string? categoryId = null)
    {
        var draft = new JsonObject
        {
            ["schemaVersion"] = "studio.event/1",
            ["title"] = "参照するイベント",
            ["description"] = null,
            ["categoryId"] = categoryId,
            ["occurrenceId"] = SampleOccurrence,
            ["slots"] = new JsonArray(new JsonObject
            {
                ["slotId"] = Guid.NewGuid().ToString(),
                ["ocDayId"] = dayId,
                ["timeMode"] = "allDay",
                ["fixed"] = null,
                ["participation"] = "anytime",
                ["status"] = "normal",
                ["cancelNote"] = null,
                ["venues"] = new JsonArray(new JsonObject { ["canonicalSpotId"] = canonicalId, ["note"] = null }),
            }),
        };
        var (response, _) = await SendAsync(HttpMethod.Post, "/api/events", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["draft"] = draft });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    // ---- 開催回・開催日 ----

    [Fact]
    public async Task Occurrence_CreateAndUpdate_RoundTripsDaysAndAdvancesTheVersion()
    {
        var dayId = Guid.NewGuid().ToString();
        var draft = JsonNode.Parse($$"""
            { "name": "2027 オープンキャンパス", "sourceNote": "入試課の案内（設計用サンプル）",
              "days": [ { "id": "{{dayId}}", "date": "2027-08-01", "publicStart": "10:00", "publicEnd": null, "status": "normal", "cancelNote": null } ] }
            """)!;
        var (created, body) = await SendAsync(HttpMethod.Post, "/api/occurrences", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["draft"] = draft });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(1, body!["rowVersion"]!.GetValue<long>());
        // 一般公開時間の片方だけでも下書きとして保存できる（08 OV-01 は公開阻止であって保存阻止ではない）。
        Assert.True(JsonNode.DeepEquals(draft, body["draft"]));

        var id = body["id"]!.GetValue<string>();
        var updated = draft.DeepClone();
        updated["days"]![0]!["publicEnd"] = "09:00"; // 開始より前。下書きでは保存できる。
        updated["days"]![0]!["status"] = "cancelled";
        updated["days"]![0]!["cancelNote"] = "台風のため中止します";
        var (response, saved) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{id}", Save(1, updated));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, saved!["rowVersion"]!.GetValue<long>());
        Assert.True(JsonNode.DeepEquals(updated, (await GetJsonAsync($"/api/occurrences/{id}"))["draft"]));

        await using var scope = _factory.Services.CreateAsyncScope();
        var revisions = await scope.ServiceProvider.GetRequiredService<StudioDbContext>().ReferenceRevisions
            .Where(r => r.Kind == ReferenceRevisionKind.Occurrence && r.TargetId == id).ToListAsync();
        Assert.Equal(2, revisions.Count);
        Assert.All(revisions, r => Assert.Equal(ReferenceRevisionSource.Editor, r.Source));
    }

    [Fact]
    public async Task Occurrence_StaleRowVersion_Returns409AndKeepsTheOtherSave()
    {
        var detail = await GetJsonAsync($"/api/occurrences/{SampleOccurrence}");
        var rowVersion = detail["rowVersion"]!.GetValue<long>();
        var first = detail["draft"]!.DeepClone();
        first["name"] = "先に保存した名称";
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, first))).Response.StatusCode);

        var second = detail["draft"]!.DeepClone();
        second["name"] = "後から保存した名称";
        var (response, body) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, second));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("先に保存した名称", body!["latest"]!["draft"]!["name"]!.GetValue<string>());
    }

    [Fact]
    public async Task Occurrence_RetryWithSameOperationId_IsNotAConflict()
    {
        var detail = await GetJsonAsync($"/api/occurrences/{SampleOccurrence}");
        var rowVersion = detail["rowVersion"]!.GetValue<long>();
        var draft = detail["draft"]!.DeepClone();
        draft["name"] = "再送の確認";
        var operation = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, draft, operation))).Response.StatusCode);
        var (retry, body) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, draft, operation));

        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(rowVersion + 1, body!["rowVersion"]!.GetValue<long>());
    }

    [Fact]
    public async Task Occurrence_ReferencedDay_CannotBeDeletedOrMoved()
    {
        await CreateEventOnDayAsync(Day0920);
        var detail = await GetJsonAsync($"/api/occurrences/{SampleOccurrence}");
        var rowVersion = detail["rowVersion"]!.GetValue<long>();
        Assert.Contains(detail["references"]!.AsArray(), r => r!["ocDayId"]!.GetValue<string>() == Day0920);

        var removed = detail["draft"]!.DeepClone();
        removed["days"] = new JsonArray(removed["days"]!.AsArray().Where(d => d!["id"]!.GetValue<string>() != Day0920).Select(d => d!.DeepClone()).ToArray());
        var (deleteResponse, deleteBody) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, removed));
        Assert.Equal(HttpStatusCode.BadRequest, deleteResponse.StatusCode);
        Assert.Contains(deleteBody!["problems"]!.AsArray(), p => p!["code"]!.GetValue<string>() == "day_in_use");

        var moved = detail["draft"]!.DeepClone();
        moved["days"]![0]!["date"] = "2026-09-19";
        var (moveResponse, moveBody) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, moved));
        Assert.Equal(HttpStatusCode.BadRequest, moveResponse.StatusCode);
        Assert.Contains(moveBody!["problems"]!.AsArray(), p => p!["code"]!.GetValue<string>() == "day_in_use");

        // 時間の変更や中止は参照中でもできる（影響の確認は画面で行う）。
        var changedHours = detail["draft"]!.DeepClone();
        changedHours["days"]![0]!["publicEnd"] = "17:00";
        changedHours["days"]![0]!["status"] = "cancelled";
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, changedHours))).Response.StatusCode);
    }

    [Fact]
    public async Task Occurrence_RejectsDuplicateDatesButAllowsSwappingUnreferencedDates()
    {
        var detail = await GetJsonAsync($"/api/occurrences/{SampleOccurrence}");
        var rowVersion = detail["rowVersion"]!.GetValue<long>();

        var duplicate = detail["draft"]!.DeepClone();
        duplicate["days"]![1]!["date"] = duplicate["days"]![0]!["date"]!.GetValue<string>();
        var (duplicateResponse, body) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, duplicate));
        Assert.Equal(HttpStatusCode.BadRequest, duplicateResponse.StatusCode);
        Assert.Contains(body!["problems"]!.AsArray(), p => p!["code"]!.GetValue<string>() == "duplicate_date");

        // 9/20 と 9/21 を入れ替えても、(occurrence_id, date) の一意制約に途中で当たらない。
        var swapped = detail["draft"]!.DeepClone();
        swapped["days"]![0]!["date"] = "2026-09-21";
        swapped["days"]![1]!["date"] = "2026-09-20";
        var (swapResponse, _) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, swapped));
        Assert.Equal(HttpStatusCode.OK, swapResponse.StatusCode);
        var reloaded = await GetJsonAsync($"/api/occurrences/{SampleOccurrence}");
        Assert.Equal(Day0921, reloaded["draft"]!["days"]![0]!["id"]!.GetValue<string>());
    }

    [Fact]
    public async Task Occurrence_ImportWhileEditing_IsReportedAsAConflict()
    {
        var rowVersion = (await GetJsonAsync($"/api/occurrences/{SampleOccurrence}"))["rowVersion"]!.GetValue<long>();
        await ReferenceDataTests.ImportSampleAsync(_factory);

        var draft = (await GetJsonAsync($"/api/occurrences/{SampleOccurrence}"))["draft"]!.DeepClone();
        var (response, _) = await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(rowVersion, draft));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task OccurrenceList_CountsRelatedEvents()
    {
        await CreateEventOnDayAsync(Day0921);
        var list = await _client.GetFromJsonAsync<List<OccurrenceListItem>>("/api/occurrences", Json);
        Assert.Equal(1, list!.Single(o => o.Id == Guid.Parse(SampleOccurrence)).RelatedEventCount);
        Assert.Equal(0, list.Single(o => o.Id != Guid.Parse(SampleOccurrence)).RelatedEventCount);
    }

    // ---- カテゴリ一覧 ----

    [Fact]
    public async Task Categories_SaveRenamesReordersAddsAndStops()
    {
        var detail = await _client.GetFromJsonAsync<CategoryListDetail>("/api/categories", Json);
        var items = detail!.Items.Select(i => new CategoryDraft(i.Id, i.Name, i.Selectable)).Reverse().ToList();
        items[0] = items[0] with { Name = "旧カテゴリ（改名）", Selectable = true };
        var added = new CategoryDraft(Guid.NewGuid(), "展示", true);
        items.Add(added);

        var (response, body) = await SendAsync(HttpMethod.Put, "/api/categories", new { operationId = Guid.NewGuid(), rowVersion = detail.RowVersion, items });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = body.Deserialize<CategoryListDetail>(Json)!;
        Assert.Equal(detail.RowVersion + 1, saved.RowVersion);
        Assert.Equal(items.Select(i => i.Id), saved.Items.Select(i => i.Id));
        Assert.Equal("旧カテゴリ（改名）", saved.Items[0].Name);
        Assert.True(saved.Items[0].Selectable);

        // 参照データの一覧（イベント編集で使う）にも、保存した順序で出る。
        var reference = await _client.GetFromJsonAsync<ReferenceData>("/api/reference", Json);
        Assert.Equal(items.Select(i => i.Id), reference!.Categories.Select(c => c.Id));
    }

    [Fact]
    public async Task Categories_CannotBeDeletedAndCountReferences()
    {
        var detail = await _client.GetFromJsonAsync<CategoryListDetail>("/api/categories", Json);
        await CreateEventOnDayAsync(Day0920, categoryId: detail!.Items[0].Id.ToString());
        detail = await _client.GetFromJsonAsync<CategoryListDetail>("/api/categories", Json);
        Assert.Equal(1, detail!.Items[0].ReferenceCount);

        var withoutFirst = detail.Items.Skip(1).Select(i => new CategoryDraft(i.Id, i.Name, i.Selectable)).ToList();
        var (response, body) = await SendAsync(HttpMethod.Put, "/api/categories", new { operationId = Guid.NewGuid(), rowVersion = detail.RowVersion, items = withoutFirst });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(body!["problems"]!.AsArray(), p => p!["code"]!.GetValue<string>() == "category_removed");
    }

    [Fact]
    public async Task Categories_StaleRowVersion_Returns409()
    {
        var detail = await _client.GetFromJsonAsync<CategoryListDetail>("/api/categories", Json);
        var items = detail!.Items.Select(i => new CategoryDraft(i.Id, i.Name, i.Selectable)).ToList();
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Put, "/api/categories", new { operationId = Guid.NewGuid(), rowVersion = detail.RowVersion, items })).Response.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(HttpMethod.Put, "/api/categories", new { operationId = Guid.NewGuid(), rowVersion = detail.RowVersion, items })).Response.StatusCode);
    }

    // ---- Spot ----

    [Fact]
    public async Task Spot_SaveAttributes_KeepsTheCanonicalIdAndRecordsARevision()
    {
        await CreateEventOnDayAsync(Day0920, "mb_f2_cr_2a");
        var detail = await GetJsonAsync("/api/spots/item?id=mb_f2_cr_2a");
        Assert.Equal("参照するイベント", detail["draftEvents"]![0]!["eventTitle"]!.GetValue<string>());
        var draft = detail["draft"]!.DeepClone();
        draft["name"] = "2A教室（改称）";
        draft["aliases"] = new JsonArray("2A", "ロボット実験室");
        draft["utilization"] = "noNewSelection";

        var (response, body) = await SendAsync(HttpMethod.Put, "/api/spots/item?id=mb_f2_cr_2a", Save(detail["rowVersion"]!.GetValue<long>(), draft));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("mb_f2_cr_2a", body!["canonicalId"]!.GetValue<string>());
        Assert.Equal("2A教室（改称）", body["draft"]!["name"]!.GetValue<string>());

        // 新規選択停止にすると会場の検索でも選べないSpotとして出る（イベントの既存参照は残る）。
        var search = await _client.GetFromJsonAsync<SpotSearchResult>("/api/spots?q=ロボット実験室", Json);
        Assert.Equal("noNewSelection", Assert.Single(search!.Items).Utilization);
    }

    [Fact]
    public async Task Spot_IsFoundOnlyByTheExactCanonicalId()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/api/spots/item?id=MB_F2_CR_2A")).StatusCode);
        var (response, _) = await SendAsync(HttpMethod.Put, "/api/spots/item?id=MB_F2_CR_2A", Save(1, JsonNode.Parse("""{ "name": "x", "aliases": [], "buildingName": null, "floorName": null, "utilization": "available" }""")!));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("buildingName", "存在しない建物", "unknown_building")]
    [InlineData("floorName", "99階", "unknown_floor")]
    [InlineData("utilization", "withdrawn", "invalid_value")]
    public async Task Spot_RejectsUnknownPlacementsAndWithdrawal(string field, string value, string code)
    {
        var detail = await GetJsonAsync("/api/spots/item?id=mb_f2_cr_2b");
        var draft = detail["draft"]!.DeepClone();
        draft[field] = value;
        var (response, body) = await SendAsync(HttpMethod.Put, "/api/spots/item?id=mb_f2_cr_2b", Save(detail["rowVersion"]!.GetValue<long>(), draft));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(body!["problems"]!.AsArray(), p => p!["code"]!.GetValue<string>() == code);
    }

    [Fact]
    public async Task SpotDirectory_IncludesWithdrawnSpots()
    {
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
            (await db.Spots.SingleAsync(s => s.CanonicalId == "sample_lobby_1f")).Utilization = SpotUtilization.Withdrawn;
            await db.SaveChangesAsync();
        }

        var directory = await _client.GetFromJsonAsync<SpotSearchResult>("/api/spots/directory", Json);
        Assert.Contains(directory!.Items, s => s.CanonicalId == "sample_lobby_1f");
        var picker = await _client.GetFromJsonAsync<SpotSearchResult>("/api/spots", Json);
        Assert.DoesNotContain(picker!.Items, s => s.CanonicalId == "sample_lobby_1f");
    }

    // ---- イベント一覧の開催状況 ----

    [Fact]
    public async Task EventList_ReportsDayCancellationSeparatelyFromSlotCancellation()
    {
        await CreateEventOnDayAsync(Day0920);
        var detail = await GetJsonAsync($"/api/occurrences/{SampleOccurrence}");
        var draft = detail["draft"]!.DeepClone();
        draft["days"]![0]!["status"] = "cancelled";
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Put, $"/api/occurrences/{SampleOccurrence}", Save(detail["rowVersion"]!.GetValue<long>(), draft))).Response.StatusCode);

        var list = await _client.GetFromJsonAsync<List<EventListItem>>("/api/events", Json);
        var slot = Assert.Single(Assert.Single(list!).Slots);
        Assert.True(slot.DayCancelled);
        Assert.Equal("normal", slot.Status);
    }
}
