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

    private async Task<(ParticipantBundle Bundle, JsonNode Payload)> CurrentBundleAsync()
    {
        var (current, bundle) = await WithDbAsync(async db =>
        {
            var pointer = await db.CurrentBundle.AsNoTracking().SingleAsync();
            return (pointer, await db.ParticipantBundles.AsNoTracking().SingleAsync(b => b.BundleVersion == pointer.BundleVersion));
        });
        Assert.Equal(bundle.BundleVersion, current.BundleVersion);
        Assert.Equal(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(bundle.Payload)), bundle.Sha256);
        Assert.Equal(bundle.Payload.Length, bundle.ByteLength);
        ParticipantBundleSchema.AssertValid(bundle.Payload);
        var payload = JsonNode.Parse(bundle.Payload)!;
        var release = await WithDbAsync(db => db.Releases.AsNoTracking().SingleAsync(r => r.ReleaseId == bundle.ReleaseId));
        Assert.Equal(release.Sequence, payload["nexus_bundle"]!["bundle_version"]!.GetValue<long>());
        return (bundle, payload);
    }

    /// <summary>spot・地図を含む公開ごとに、公開中の全件から bundle の新しい版を作る（nexus-mobile E2-5 §3.3）。</summary>
    [Fact]
    public async Task PublishingMapAndSpots_ProjectsEachReleaseIntoANewBundle()
    {
        var dataset = await ImportAsync(MapImportTests.FixturePayload);
        await PreviewAndPublishAsync(Entry("map", "map", revisionId: dataset.Id));

        var (first, mapOnly) = await CurrentBundleAsync();
        Assert.Empty(mapOnly["spots"]!.AsArray());
        Assert.Empty(mapOnly["id_aliases"]!.AsArray());
        Assert.Equal(1, mapOnly["map"]!["dataset_version"]!.GetValue<long>());
        Assert.Equal(dataset.Checksum, mapOnly["map"]!["dataset_sha256"]!.GetValue<string>());
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(MapImportTests.FixturePayload), mapOnly["map"]!["geojson"]));

        // 旧 ID は、解決先が公開中の spot のときだけ配信する（§5.5）。
        await WithDbAsync(async db =>
        {
            new StudioApi.Publishing.IdReservationLedger(db, await StudioApi.Publishing.IdReservationSnapshot.LoadAsync(db), TimeProvider.System)
                .AddAlias("old_cl_001", "mb_1f_cl_001", IdEntityKind.Spot, IdReservationSource.Import, null);
            return await db.SaveChangesAsync();
        });
        var spotRevision = await AddSpotAsync("mb_1f_cl_001");
        await PreviewAndPublishAsync(Entry("spot", "mb_1f_cl_001", revisionId: spotRevision));

        var (second, withSpot) = await CurrentBundleAsync();
        Assert.True(second.BundleVersion > first.BundleVersion);
        var spot = withSpot["spots"]!.AsArray().Single()!;
        Assert.Equal("mb_1f_cl_001", spot["id"]!.GetValue<string>());
        Assert.Equal("1A教室", spot["name"]!.GetValue<string>());
        Assert.Equal("classroom", spot["kind"]!.GetValue<string>());
        Assert.Equal(["1A"], spot["search_aliases"]!.AsArray().Select(a => a!.GetValue<string>()));
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""
            { "feature_type": "room", "building_id": "mb", "floor_id": "mb_1f", "point": [141.6813, 42.7715], "access_node_id": "mb_1f_n_005" }
            """), spot["placement"]));
        var alias = withSpot["id_aliases"]!.AsArray().Single()!;
        Assert.Equal(("old_cl_001", "mb_1f_cl_001"), (alias["alias"]!.GetValue<string>(), alias["canonical_id"]!.GetValue<string>()));

        // すべての spot を取り下げても bundle は消さず、空の spots の版を作る（§3.3 の4）。
        await PreviewAndPublishAsync(Entry("spot", "mb_1f_cl_001", "withdraw"));
        var (third, withdrawn) = await CurrentBundleAsync();
        Assert.True(third.BundleVersion > second.BundleVersion);
        Assert.Empty(withdrawn["spots"]!.AsArray());
        Assert.Empty(withdrawn["id_aliases"]!.AsArray());
        Assert.Equal(3, await WithDbAsync(db => db.ParticipantBundles.CountAsync()));
    }

    /// <summary>復旧も公開と同じく、戻した内容で bundle の新しい版を作る（nexus-mobile E2-5 §9 の受入条件）。</summary>
    [Fact]
    public async Task RestoringASpot_ProjectsTheRestoredVersionIntoANewBundle()
    {
        var dataset = await ImportAsync(MapImportTests.FixturePayload);
        await PreviewAndPublishAsync(Entry("map", "map", revisionId: dataset.Id));
        var original = await AddSpotAsync("mb_1f_cl_001");
        await PreviewAndPublishAsync(Entry("spot", "mb_1f_cl_001", revisionId: original));
        var renamed = await AddSpotAsync("mb_1f_cl_001", "1A教室（改称）");
        await PreviewAndPublishAsync(Entry("spot", "mb_1f_cl_001", revisionId: renamed));
        var (before, changed) = await CurrentBundleAsync();
        Assert.Equal("1A教室（改称）", changed["spots"]![0]!["name"]!.GetValue<string>());

        await PreviewAndPublishAsync(Entry("spot", "mb_1f_cl_001", "restore", original));

        var (after, restored) = await CurrentBundleAsync();
        Assert.True(after.BundleVersion > before.BundleVersion);
        Assert.Equal("1A教室", restored["spots"]![0]!["name"]!.GetValue<string>());
        Assert.Equal(4, await WithDbAsync(db => db.ParticipantBundles.CountAsync()));
    }

    /// <summary>bundle を書けなければ、Release・公開状態・予約表も残さない（nexus-mobile E2-5 §9 の受入条件）。</summary>
    [Fact]
    public async Task FailingToWriteTheBundle_LeavesNoRelease()
    {
        var dataset = await ImportAsync(MapImportTests.FixturePayload);
        await PreviewAndPublishAsync(Entry("map", "map", revisionId: dataset.Id));
        var spotRevision = await AddSpotAsync("mb_1f_cl_001");
        var preview = await PreviewAsync(Entry("spot", "mb_1f_cl_001", revisionId: spotRevision));
        Assert.Empty(Codes(preview));

        // 次の Release の番号の bundle を先に置き、射影の書き込みだけを失敗させる。
        var (pointer, releases, reservations) = await WithDbAsync(async db =>
        {
            var next = await db.Releases.MaxAsync(r => r.Sequence) + 1;
            db.ParticipantBundles.Add(new ParticipantBundle
            {
                BundleVersion = next, ReleaseId = Guid.CreateVersion7(), SchemaVersion = "2.0.0", Payload = "{}"u8.ToArray(),
                Sha256 = new string('0', 64), ByteLength = 2, CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
            return ((await db.CurrentBundle.AsNoTracking().SingleAsync()).BundleVersion, await db.Releases.CountAsync(), await db.IdReservations.CountAsync());
        });

        var (response, body) = await SendAsync("/api/releases", new JsonObject
        {
            ["operationId"] = Guid.NewGuid().ToString(),
            ["entries"] = preview["validation"]!["entries"]!.DeepClone(),
            ["confirmedValidationId"] = preview["validation"]!["id"]!.DeepClone(),
            ["message"] = null,
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("failed", body!["status"]!.GetValue<string>());

        await WithDbAsync(async db =>
        {
            Assert.Equal(releases, await db.Releases.CountAsync());
            Assert.Equal(reservations, await db.IdReservations.CountAsync());
            Assert.Equal(pointer, (await db.CurrentBundle.AsNoTracking().SingleAsync()).BundleVersion);
            Assert.False(await db.Publications.AnyAsync(p => p.TargetKind == "spot"));
            return 0;
        });

        // 失敗の原因が射影の書き込みだけだったことを確かめる：置いた bundle を除けば同じ内容で公開できる。
        // （アプリは bundle の削除を拒否するため、試験の後片付けとして直接消す）
        Assert.Equal(1, await WithDbAsync(db => db.ParticipantBundles.Where(b => b.BundleVersion == releases + 1).ExecuteDeleteAsync()));
        await PreviewAndPublishAsync(Entry("spot", "mb_1f_cl_001", revisionId: spotRevision));
    }

    /// <summary>建物の Spot の名称と地図の建物名の食い違いは警告し、公開は止めない（nexus-mobile E2-5 O-1c）。</summary>
    [Fact]
    public async Task BuildingSpotNameDifferingFromTheMap_IsWarned()
    {
        var dataset = await ImportAsync(MapImportTests.FixturePayload);
        await PreviewAndPublishAsync(Entry("map", "map", revisionId: dataset.Id));

        var same = await AddSpotAsync("mb", "教室棟");
        Assert.DoesNotContain("building_name_differs", Codes(await PreviewAsync(Entry("spot", "mb", revisionId: same)), "warning"));
        var renamed = await AddSpotAsync("mb", "メインキャンパス教室棟");
        var preview = await PreviewAsync(Entry("spot", "mb", revisionId: renamed));
        Assert.Contains("building_name_differs", Codes(preview, "warning"));
        Assert.Empty(Codes(preview));
        await PreviewAndPublishAsync(Entry("spot", "mb", revisionId: renamed));

        // 地図側の建物名を変えて公開するときも、公開中の建物の Spot との食い違いを地図の確認に出す。
        var data = JsonNode.Parse(MapImportTests.FixturePayload)!.AsObject();
        Feature(data, "mb")["properties"]!["name"] = "メインキャンパス教室棟";
        var aligned = await ImportAsync(data.ToJsonString());
        Assert.DoesNotContain("building_name_differs", Codes(await PreviewAsync(Entry("map", "map", revisionId: aligned.Id)), "warning"));
        Feature(data, "mb")["properties"]!["name"] = "第2教室棟";
        var differing = await ImportAsync(data.ToJsonString());
        Assert.Contains("building_name_differs", Codes(await PreviewAsync(Entry("map", "map", revisionId: differing.Id)), "warning"));
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

    private async Task<Guid> AddSpotAsync(string canonicalId, string name = "1A教室")
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<ReferenceImporter>().ImportAsync(new ReferenceFile(null, null,
            [new ReferenceFileSpot(canonicalId, name, ["1A"], null, null, false, null, Kind: "classroom")]));
        Assert.True(result.Succeeded, string.Join("\n", result.Messages));
        var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
        return (await db.Spots.AsNoTracking().SingleAsync(s => s.CanonicalId == canonicalId)).CurrentRevisionId!.Value;
    }
}
