using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Map;
using StudioApi.Models;
using StudioApi.Publishing;
using StudioApi.Reference;
using StudioApi.Services.MapValidation;

namespace StudioApi.Tests;

/// <summary>Spot の改名（管理コマンド `spot rename`。nexus-mobile E2-5 §5.5 O-3c、決定事項32）。</summary>
public sealed class SpotRenameTests : IAsyncLifetime
{
    private const string OldId = "mb_1f_cl_001";
    private const string NewId = "mb_1f_cl_002";
    private static readonly Guid Occurrence = Guid.Parse("0199a000-0000-7000-8000-000000000001");
    private static readonly Guid Day = Guid.Parse("0199a000-0000-7000-8000-000000000101");
    private static readonly Guid Category = Guid.Parse("0199a000-0000-7000-8000-000000000301");
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // MapPublishingTests と同じ、フィクスチャに合わせた試験用の値（実測値・承認値ではない）。
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
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "studio-spot-rename-" + Guid.NewGuid().ToString("N"));
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(_directory);
        var settings = Path.Combine(_directory, "approved-settings.json");
        File.WriteAllText(settings, ApprovedSettings, new UTF8Encoding(false));
        _factory = _root.WithWebHostBuilder(builder => builder.UseSetting(ApprovedMapSettingsSource.ConfigurationKey, settings));
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

    private async Task<T> WithDbAsync<T>(Func<StudioDbContext, Task<T>> action)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<StudioDbContext>());
    }

    private async Task<JsonNode?> SendAsync(HttpMethod method, string path, JsonObject body, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var token = await _client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body, options: Json) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        var response = await _client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, text);
        return text.Length == 0 ? null : JsonNode.Parse(text);
    }

    private async Task<JsonNode> GetAsync(string path) => JsonNode.Parse(await _client.GetStringAsync(path))!;

    private static JsonObject Entry(string kind, string id, string? revisionId) => new() { ["targetKind"] = kind, ["targetId"] = id, ["action"] = "publish", ["revisionId"] = revisionId };

    private async Task PublishAsync(params JsonObject[] entries)
    {
        var preview = (await SendAsync(HttpMethod.Post, "/api/releases/preview", new JsonObject { ["entries"] = new JsonArray(entries) }))!;
        var findings = preview["validation"]!["findings"]!.AsArray();
        Assert.True(findings.All(f => f!["severity"]!.GetValue<string>() != "blocking"), string.Join("\n", findings.Select(f => f!.ToJsonString())));
        var body = await SendAsync(HttpMethod.Post, "/api/releases", new JsonObject
        {
            ["operationId"] = Guid.NewGuid().ToString(),
            ["entries"] = preview["validation"]!["entries"]!.DeepClone(),
            ["confirmedValidationId"] = preview["validation"]!["id"]!.DeepClone(),
            ["message"] = null,
        });
        Assert.Equal("succeeded", body!["status"]!.GetValue<string>());
    }

    private async Task<MapDataset> ImportMapAsync(Func<JsonObject, JsonObject>? change = null)
    {
        var data = JsonNode.Parse(MapImportTests.FixturePayload)!.AsObject();
        var payload = (change?.Invoke(data) ?? data).ToJsonString();
        await using var scope = _factory.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<MapImporter>().ImportAsync(payload, MapImportTests.Evidence);
        Assert.True(result.Succeeded, string.Join("\n", result.Messages));
        return await scope.ServiceProvider.GetRequiredService<StudioDbContext>().MapDatasets.AsNoTracking().OrderByDescending(m => m.Version).FirstAsync();
    }

    private static JsonObject RenameRoom(JsonObject data)
    {
        data["features"]!.AsArray().Single(f => f!["id"]!.GetValue<string>() == OldId)!["id"] = NewId;
        return data;
    }

    private async Task<string> CreateEventAsync(string title, string venue)
    {
        var draft = new JsonObject
        {
            ["schemaVersion"] = "studio.event/1",
            ["title"] = title,
            ["description"] = "改名の試験用",
            ["categoryId"] = Category.ToString(),
            ["occurrenceId"] = Occurrence.ToString(),
            ["slots"] = new JsonArray(new JsonObject
            {
                ["slotId"] = Guid.NewGuid().ToString(),
                ["ocDayId"] = Day.ToString(),
                ["timeMode"] = "allDay",
                ["fixed"] = null,
                ["participation"] = "anytime",
                ["status"] = "normal",
                ["cancelNote"] = null,
                ["venues"] = new JsonArray(new JsonObject { ["canonicalSpotId"] = venue, ["note"] = null }),
            }),
        };
        var body = await SendAsync(HttpMethod.Post, "/api/events", new JsonObject { ["operationId"] = Guid.NewGuid().ToString(), ["draft"] = draft }, HttpStatusCode.Created);
        return body!["id"]!.GetValue<string>();
    }

    /// <summary>地図 v1・Spot・開催回とカテゴリ・公開中のイベント（と下書きだけのイベント）を用意し、旧 ID の alias を1件置く。</summary>
    private async Task<(string Published, string DraftOnly)> SeedAsync()
    {
        var map = await ImportMapAsync();
        await PublishAsync(Entry("map", "map", map.Id.ToString()));

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var result = await scope.ServiceProvider.GetRequiredService<ReferenceImporter>().ImportAsync(new ReferenceFile(
                [new ReferenceFileOccurrence(Occurrence, "試験の開催回", [new ReferenceFileDay(Day, new DateOnly(2027, 9, 20), "10:00", "16:00", null, null)])],
                [new ReferenceFileCategory(Category, "体験", 1, true)],
                [new ReferenceFileSpot(OldId, "1A教室", ["1A"], null, null, false, null, Kind: "classroom")]));
            Assert.True(result.Succeeded, string.Join("\n", result.Messages));
        }

        var occurrence = await GetAsync($"/api/occurrences/{Occurrence}");
        var categories = await GetAsync("/api/categories");
        var spot = await GetAsync($"/api/spots/item?id={OldId}");
        await PublishAsync(
            Entry("occurrence", Occurrence.ToString(), occurrence["revisionId"]!.GetValue<string>()),
            Entry("categories", "categories", categories["revisionId"]!.GetValue<string>()),
            Entry("spot", OldId, spot["revisionId"]!.GetValue<string>()));

        var published = await CreateEventAsync("公開中のイベント", OldId);
        var revision = (await GetAsync($"/api/events/{published}"))["revisionId"]!.GetValue<string>();
        await PublishAsync(Entry("event", published, revision));
        var draftOnly = await CreateEventAsync("下書きだけのイベント", OldId);

        await WithDbAsync(async db =>
        {
            new IdReservationLedger(db, await IdReservationSnapshot.LoadAsync(db), TimeProvider.System)
                .AddAlias("old_cl_001", OldId, IdEntityKind.Spot, IdReservationSource.Import, null);
            return await db.SaveChangesAsync();
        });
        return (published, draftOnly);
    }

    private async Task<(int ExitCode, string Output, string Error)> RunAsync(params string[] args)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var output = new StringWriter();
        var error = new StringWriter();
        var exitCode = await SpotCommand.RunAsync(args, scope.ServiceProvider.GetRequiredService<PublishingService>(),
            scope.ServiceProvider.GetRequiredService<UserManager<StudioAdmin>>(), output, error);
        return (exitCode, output.ToString(), error.ToString());
    }

    private Task<(int ExitCode, string Output, string Error)> RenameAsync(long mapVersion, bool apply, string from = OldId, string to = NewId)
        => RunAsync(["rename", "--from", from, "--to", to, "--map-version", mapVersion.ToString(), "--admin", StudioApiFactory.AdminEmail, .. apply ? new[] { "--apply" } : []]);

    private Task<(int Releases, int Spots, int Reservations, int EventRevisions, int Bundles)> CountsAsync()
        => WithDbAsync(async db => (await db.Releases.CountAsync(), await db.Spots.CountAsync(), await db.IdReservations.CountAsync(),
            await db.EventRevisions.CountAsync(), await db.ParticipantBundles.CountAsync()));

    private static EventDraft Draft(string payload) => JsonSerializer.Deserialize<EventDraft>(payload, EventDraftRules.JsonOptions)!;

    [Fact]
    public async Task Rename_IsCheckedFirst_ThenAppliedAsOneRelease()
    {
        var (publishedEvent, draftOnly) = await SeedAsync();
        var map = await ImportMapAsync(RenameRoom);
        var before = await CountsAsync();

        // --apply なしは確認だけで、何も残さない。
        var (dryCode, dryOutput, dryError) = await RenameAsync(map.Version, apply: false);
        Assert.True(dryCode == 0, dryError);
        Assert.Contains("確認だけ", dryOutput);
        Assert.Equal(before, await CountsAsync());

        var (code, output, error) = await RenameAsync(map.Version, apply: true);
        Assert.True(code == 0, error);
        Assert.Contains("改名しました", output);

        await WithDbAsync(async db =>
        {
            var release = await db.Releases.AsNoTracking().Include(r => r.Entries).OrderByDescending(r => r.Sequence).FirstAsync();
            Assert.Equal(before.Releases + 1, await db.Releases.CountAsync());
            Assert.Equal($"改名 {OldId} → {NewId}", release.Message);
            Assert.Equal(
                new[] { ("event", publishedEvent, "publish"), ("map", "map", "publish"), ("spot", NewId, "publish"), ("spot", OldId, "withdraw") }.OrderBy(e => e.Item1).ThenBy(e => e.Item2, StringComparer.Ordinal),
                release.Entries.Select(e => (e.TargetKind, e.TargetId, e.Action)).OrderBy(e => e.TargetKind).ThenBy(e => e.TargetId, StringComparer.Ordinal));

            var publications = await db.Publications.AsNoTracking().ToListAsync();
            Assert.Equal(PublicationRowState.Withdrawn, publications.Single(p => p.TargetKind == "spot" && p.TargetId == OldId).State);
            Assert.Equal(PublicationRowState.Published, publications.Single(p => p.TargetKind == "spot" && p.TargetId == NewId).State);
            Assert.Equal(map.Id, publications.Single(p => p.TargetKind == "map").RevisionId);

            // 新しい ID の Spot は旧 Spot の内容を写し、版の登録元は rename。
            var spot = await db.Spots.AsNoTracking().Include(s => s.NameAliases).SingleAsync(s => s.CanonicalId == NewId);
            Assert.Equal(("1A教室", "classroom"), (spot.Name, spot.Kind));
            Assert.Equal(["1A"], spot.NameAliases.Select(a => a.Alias));
            Assert.Equal(ReferenceRevisionSource.Rename, (await db.ReferenceRevisions.AsNoTracking().SingleAsync(r => r.RevisionId == spot.CurrentRevisionId)).Source);

            // 公開中のイベントは新しい会場で公開し直し、下書きだけのイベントは下書きの版だけ替える。既存の版は書き換えない。
            var eventPublication = publications.Single(p => p.TargetKind == "event" && p.TargetId == publishedEvent);
            var revisions = await db.EventRevisions.AsNoTracking().ToListAsync();
            Assert.Equal(NewId, Draft(revisions.Single(r => r.RevisionId == eventPublication.RevisionId).Payload).Slots[0].Venues[0].CanonicalSpotId);
            Assert.Equal(OldId, Draft(revisions.Single(r => r.RevisionId == release.Entries.Single(e => e.TargetKind == "event").PreviousRevisionId).Payload).Slots[0].Venues[0].CanonicalSpotId);
            var draftHead = await db.EventHeads.AsNoTracking().SingleAsync(h => h.EventId == Guid.Parse(draftOnly));
            Assert.Equal(NewId, Draft(revisions.Single(r => r.RevisionId == draftHead.CurrentRevisionId).Payload).Slots[0].Venues[0].CanonicalSpotId);
            Assert.DoesNotContain(publications, p => p.TargetKind == "event" && p.TargetId == draftOnly);

            // 予約表：旧 ID を spot・room の両方で廃止し、旧 ID と既存の alias を新しい ID へ向ける（O-3c T2）。
            var snapshot = await IdReservationSnapshot.LoadAsync(db);
            Assert.Equal(IdReservationState.Retired, snapshot.StateOf(OldId, IdEntityKind.Spot));
            Assert.Equal(IdReservationState.Retired, snapshot.StateOf(OldId, "room"));
            Assert.Equal(NewId, snapshot.Resolve(OldId));
            Assert.Equal(NewId, snapshot.Resolve("old_cl_001"));
            Assert.Equal(IdReservationState.Active, snapshot.StateOf(NewId, IdEntityKind.Spot));
            Assert.All(await db.IdReservations.AsNoTracking().Where(r => r.Source == IdReservationSource.Rename).ToListAsync(), r => Assert.Equal(release.ReleaseId, r.ReleaseId));

            // bundle は同じ Release で作り直し、新しい ID の位置と旧 ID の alias を配信する。
            var bundle = await db.ParticipantBundles.AsNoTracking().SingleAsync(b => b.ReleaseId == release.ReleaseId);
            ParticipantBundleSchema.AssertValid(bundle.Payload);
            var payload = JsonNode.Parse(bundle.Payload)!;
            Assert.Equal([NewId], payload["spots"]!.AsArray().Select(s => s!["id"]!.GetValue<string>()));
            Assert.Equal("room", payload["spots"]![0]!["placement"]!["feature_type"]!.GetValue<string>());
            Assert.Equal(
                [(OldId, NewId), ("old_cl_001", NewId)],
                payload["id_aliases"]!.AsArray().Select(a => (a!["alias"]!.GetValue<string>(), a["canonical_id"]!.GetValue<string>())));
            return 0;
        });

        // 旧 ID は alias になったため、Spot として公開し直せない（再利用禁止）。
        var old = await GetAsync($"/api/spots/item?id={OldId}");
        var preview = (await SendAsync(HttpMethod.Post, "/api/releases/preview", new JsonObject { ["entries"] = new JsonArray(Entry("spot", OldId, old["revisionId"]!.GetValue<string>())) }))!;
        Assert.Contains("spot_id_is_alias", preview["validation"]!["findings"]!.AsArray().Select(f => f!["code"]!.GetValue<string>()));
    }

    [Fact]
    public async Task Rename_RefusesUnsafeStartingPoints_WithoutChangingAnything()
    {
        var (publishedEvent, _) = await SeedAsync();
        var renamedMap = await ImportMapAsync(RenameRoom);
        var stillOld = await ImportMapAsync(data => { RenameRoom(data); var copy = data["features"]!.AsArray().Single(f => f!["id"]!.GetValue<string>() == NewId)!.DeepClone(); copy["id"] = OldId; copy["properties"]!["access_node_id"] = "mb_1f_n_005"; data["features"]!.AsArray().Add(copy); return data; });
        var before = await CountsAsync();

        async Task Refused(string expected, Task<(int ExitCode, string Output, string Error)> run)
        {
            var (code, _, error) = await run;
            Assert.Equal(1, code);
            Assert.Contains(expected, error);
            Assert.Equal(before, await CountsAsync());
        }

        await Refused("取り込み済みの下書きではありません", RenameAsync(99, apply: true));
        await Refused("まだ mb_1f_cl_001 があります", RenameAsync(stillOld.Version, apply: true));
        await Refused("公開中ではありません", RenameAsync(renamedMap.Version, apply: true, from: "mb_ent_001"));
        await Refused("予約表にあります", RenameAsync(renamedMap.Version, apply: true, to: "old_cl_001"));
        await Refused("同じ種別", RenameAsync(renamedMap.Version, apply: true, to: "mb_1f_cl_003"));

        // 未公開の変更を、改名に紛れて公開しない。
        var current = await GetAsync($"/api/events/{publishedEvent}");
        var draft = current["draft"]!.DeepClone();
        draft["title"] = "公開前の変更";
        await SendAsync(HttpMethod.Put, $"/api/events/{publishedEvent}", new JsonObject
        {
            ["operationId"] = Guid.NewGuid().ToString(),
            ["baseRevisionId"] = current["revisionId"]!.DeepClone(),
            ["rowVersion"] = current["rowVersion"]!.DeepClone(),
            ["draft"] = draft,
        });
        before = await CountsAsync();
        await Refused("未公開の変更があります", RenameAsync(renamedMap.Version, apply: true));

        Assert.Equal(2, (await RunAsync("rename", "--from", OldId)).ExitCode);
        Assert.Equal(1, (await RunAsync("rename", "--from", OldId, "--to", NewId, "--map-version", "1", "--admin", "nobody@example.test")).ExitCode);
    }
}
