using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Map;
using StudioApi.Models;
using StudioApi.Reference;
using StudioApi.Services.MapValidation;

namespace StudioApi.Tests;

/// <summary>地図の公開対象（29 M1-D5、決定事項31）。公開判定は承認済み設定と版ごとの根拠がそろったときだけ通る。</summary>
public sealed class MapPublishingTests : IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // MapDatasetValidatorTests の Complete() と同じ、フィクスチャに合わせた形を確かめるための値（実測値・承認値ではない）。
    private const string ApprovedSettings = """
        {
          "status": "approved",
          "approvedBy": "試験",
          "approvedAt": "2026-11-01",
          "campusBoundary": { "type": "Polygon", "coordinates": [[[141.68, 42.77], [141.69, 42.77], [141.69, 42.78], [141.68, 42.78], [141.68, 42.77]]] },
          "enuOrigin": { "longitude": 141.68, "latitude": 42.77 },
          "entranceMaxGapMetres": 5,
          "pathDistanceToleranceMetres": 1,
          "startNodeIds": ["campus_n_020"]
        }
        """;

    private readonly StudioApiFactory _root = new();
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "studio-map-publish-" + Guid.NewGuid().ToString("N"));
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    private string SettingsPath => Path.Combine(_directory, "approved-settings.json");

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(SettingsPath, ApprovedSettings, new UTF8Encoding(false));
        _factory = _root.WithWebHostBuilder(builder => builder.UseSetting(ApprovedMapSettingsSource.ConfigurationKey, SettingsPath));
        await _root.InitializeDatabaseAsync();
        await _root.AddAdminAsync();
        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.LoginAsync()).StatusCode);
    }

    public async Task DisposeAsync()
    {
        Directory.Delete(_directory, recursive: true);
        await _factory.DisposeAsync();
        await _root.DisposeAsync();
    }

    private async Task<MapDataset> ImportAsync(string payload, string? evidence = MapImportTests.Evidence)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<MapImporter>().ImportAsync(payload, evidence);
        Assert.True(result.Succeeded, string.Join("\n", result.Messages));
        return await scope.ServiceProvider.GetRequiredService<StudioDbContext>().MapDatasets.AsNoTracking().OrderByDescending(m => m.Version).FirstAsync();
    }

    private async Task<T> WithDbAsync<T>(Func<StudioDbContext, Task<T>> action)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<StudioDbContext>());
    }

    private async Task<(HttpResponseMessage Response, JsonNode? Body)> SendAsync(string path, JsonObject body)
    {
        var token = await _client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: Json) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        var response = await _client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        return (response, text.Length == 0 ? null : JsonNode.Parse(text));
    }

    private static JsonObject Entry(string kind, string id, string action = "publish", Guid? revisionId = null)
        => new() { ["targetKind"] = kind, ["targetId"] = id, ["action"] = action, ["revisionId"] = revisionId?.ToString() };

    private async Task<JsonNode> PreviewAsync(params JsonObject[] entries)
    {
        var (response, body) = await SendAsync("/api/releases/preview", new JsonObject { ["entries"] = new JsonArray(entries) });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return body!;
    }

    private static JsonObject Feature(JsonObject data, string id)
        => data["features"]!.AsArray().Single(f => f!["id"]!.GetValue<string>() == id)!.AsObject();

    private static List<string> Codes(JsonNode preview, string severity = "blocking")
        => preview["validation"]!["findings"]!.AsArray().Where(f => f!["severity"]!.GetValue<string>() == severity).Select(f => f!["code"]!.GetValue<string>()).ToList();

    private async Task<JsonNode> PreviewAndPublishAsync(params JsonObject[] entries)
    {
        var preview = await PreviewAsync(entries);
        Assert.True(Codes(preview).Count == 0, string.Join("\n", preview["validation"]!["findings"]!.AsArray().Select(f => f!.ToJsonString())));
        var (response, body) = await SendAsync("/api/releases", new JsonObject
        {
            ["operationId"] = Guid.NewGuid().ToString(),
            ["entries"] = preview["validation"]!["entries"]!.DeepClone(),
            ["confirmedValidationId"] = preview["validation"]!["id"]!.DeepClone(),
            ["message"] = null,
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(body!["status"]!.GetValue<string>() == "succeeded", body.ToJsonString());
        return body;
    }

    [Fact]
    public async Task PublishingMap_PassesWithApprovedSettingsAndRegistersItsIds()
    {
        var dataset = await ImportAsync(MapImportTests.FixturePayload);

        var preview = await PreviewAsync(Entry("map", "map", revisionId: dataset.Id));
        var item = preview["items"]!.AsArray().Single()!;
        Assert.Equal("地図 v1", item["label"]!.GetValue<string>());
        Assert.Null(item["map"]!["published"]);
        Assert.Equal(dataset.Checksum, item["map"]!["candidate"]!["checksum"]!.GetValue<string>());
        Assert.Equal(12, item["map"]!["candidate"]!["featureCount"]!.GetValue<int>());

        await PreviewAndPublishAsync(Entry("map", "map", revisionId: dataset.Id));

        var stored = await WithDbAsync(db => db.MapDatasets.AsNoTracking().SingleAsync());
        Assert.Equal(MapDatasetStatus.Published, stored.Status);
        Assert.NotNull(stored.PublishedAt);
        var reservations = await WithDbAsync(db => db.IdReservations.AsNoTracking().ToListAsync());
        Assert.Contains(reservations, r => (r.Id, r.EntityKind, r.State) == ("mb_1f", IdEntityKind.Floor, IdReservationState.Active));
        Assert.Contains(reservations, r => (r.Id, r.EntityKind) == ("mb_1f_cl_001", IdEntityKind.Room));
        Assert.Contains(reservations, r => (r.Id, r.EntityKind) == ("campus_e_012", IdEntityKind.WalkingPath));
        Assert.Equal(13, reservations.Count);
    }

    [Fact]
    public async Task PublishingMap_IsBlockedWithoutApprovedSettingsOrEvidence()
    {
        File.WriteAllText(SettingsPath, """{ "status": "draft" }""");
        var withoutSettings = await ImportAsync(MapImportTests.FixturePayload);
        Assert.Contains("map_missing_validation_context", Codes(await PreviewAsync(Entry("map", "map", revisionId: withoutSettings.Id))));

        File.WriteAllText(SettingsPath, ApprovedSettings);
        var data = JsonNode.Parse(MapImportTests.FixturePayload)!.AsObject();
        data["nexus"]!["floors"]![0]!["name"] = "1階";
        var withoutEvidence = await ImportAsync(data.ToJsonString(), evidence: null);
        var codes = Codes(await PreviewAsync(Entry("map", "map", revisionId: withoutEvidence.Id)));
        Assert.Contains("map_missing_validation_context", codes);
        Assert.Contains("map_missing_transform_evidence", codes);
    }

    [Fact]
    public async Task PublishingMap_WithAnUnreadableSettingsFile_FailsTheValidation()
    {
        File.WriteAllText(SettingsPath, """{ "status": "approved", "unknown": 1 }""");
        var dataset = await ImportAsync(MapImportTests.FixturePayload);

        var preview = await PreviewAsync(Entry("map", "map", revisionId: dataset.Id));
        Assert.Equal("failed", preview["validation"]!["status"]!.GetValue<string>());
    }

    [Fact]
    public async Task ChangingApprovedSettingsAfterConfirmation_RequiresARecheck()
    {
        var dataset = await ImportAsync(MapImportTests.FixturePayload);
        var preview = await PreviewAsync(Entry("map", "map", revisionId: dataset.Id));
        Assert.Empty(Codes(preview));

        // 値は同じでも、ファイルが変われば確認し直す（承認の記録も設定の一部）。
        File.WriteAllText(SettingsPath, ApprovedSettings.Replace("\"試験\"", "\"試験（再承認）\"", StringComparison.Ordinal));
        var (response, body) = await SendAsync("/api/releases", new JsonObject
        {
            ["operationId"] = Guid.NewGuid().ToString(),
            ["entries"] = preview["validation"]!["entries"]!.DeepClone(),
            ["confirmedValidationId"] = preview["validation"]!["id"]!.DeepClone(),
            ["message"] = null,
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("recheck_required", body!["code"]!.GetValue<string>());
    }

    [Fact]
    public async Task ChangingApprovedSettings_MakesTheDraftDiagnosisStale()
    {
        await ImportAsync(MapImportTests.FixturePayload);
        var (response, body) = await SendAsync("/api/validation/draft", new JsonObject());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(body!["stale"]!.GetValue<bool>());
        Assert.Contains(body["areas"]!.AsArray(), a => a!["targetKind"]!.GetValue<string>() == "map" && a["targetCount"]!.GetValue<int>() == 1);

        File.WriteAllText(SettingsPath, """{ "status": "draft" }""");
        var latest = JsonNode.Parse(await _client.GetStringAsync("/api/validation/draft/latest"))!;
        Assert.True(latest["stale"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Spots_DependOnThePublishedMap()
    {
        var dataset = await ImportAsync(MapImportTests.FixturePayload);
        await PreviewAndPublishAsync(Entry("map", "map", revisionId: dataset.Id));
        var spotRevision = await AddSpotAsync("mb_1f_cl_001");
        await PreviewAndPublishAsync(Entry("spot", "mb_1f_cl_001", revisionId: spotRevision));

        // 公開中の Spot が使っている地図は取り下げられない。
        Assert.Contains("map_in_use", Codes(await PreviewAsync(Entry("map", "map", "withdraw"))));

        // 公開中の Spot の目的地が無い版は公開できない。
        var data = JsonNode.Parse(MapImportTests.FixturePayload)!.AsObject();
        var features = data["features"]!.AsArray();
        features.Remove(features.Single(f => f!["id"]!.GetValue<string>() == "mb_1f_cl_001"));
        var withoutRoom = await ImportAsync(data.ToJsonString());
        Assert.Contains("map_undefined_navigation_id", Codes(await PreviewAsync(Entry("map", "map", revisionId: withoutRoom.Id))));
    }

    [Fact]
    public async Task RestoringMap_RepublishesThePastVersionWithoutCopyingIt()
    {
        var first = await ImportAsync(MapImportTests.FixturePayload);
        await PreviewAndPublishAsync(Entry("map", "map", revisionId: first.Id));
        var data = JsonNode.Parse(MapImportTests.FixturePayload)!.AsObject();
        data["nexus"]!["floors"]![0]!["name"] = "1階";
        var second = await ImportAsync(data.ToJsonString());
        await PreviewAndPublishAsync(Entry("map", "map", revisionId: second.Id));

        var restore = await PreviewAsync(Entry("map", "map", "restore", first.Id));
        Assert.DoesNotContain("restore_stashes_draft", Codes(restore, "info"));
        await PreviewAndPublishAsync(Entry("map", "map", "restore", first.Id));

        var datasets = await WithDbAsync(db => db.MapDatasets.AsNoTracking().OrderBy(m => m.Version).ToListAsync());
        Assert.Equal([MapDatasetStatus.Published, MapDatasetStatus.Archived], datasets.Select(d => d.Status));
        var publication = await WithDbAsync(db => db.Publications.AsNoTracking().SingleAsync(p => p.TargetKind == "map"));
        Assert.Equal(first.Id, publication.RevisionId);
    }

    private async Task<Guid> AddSpotAsync(string canonicalId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<ReferenceImporter>().ImportAsync(new ReferenceFile(null, null,
            [new ReferenceFileSpot(canonicalId, "1A教室", null, null, null, false, null, Kind: "classroom")]));
        Assert.True(result.Succeeded, string.Join("\n", result.Messages));
        var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
        return (await db.Spots.AsNoTracking().SingleAsync(s => s.CanonicalId == canonicalId)).CurrentRevisionId!.Value;
    }
}
