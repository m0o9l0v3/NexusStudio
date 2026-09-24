using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Data;
using StudioApi.Reference;

namespace StudioApi.Tests;

public sealed class ReferenceDataTests : IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly StudioApiFactory _factory = new();
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _factory.InitializeDatabaseAsync();
        await _factory.AddAdminAsync();
        _client = _factory.CreateBrowserClient();
        await _client.LoginAsync();
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    internal static string SampleFilePath =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", "reference-sample.json");

    internal static async Task ImportSampleAsync(StudioApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var output = new StringWriter();
        var error = new StringWriter();
        var exitCode = await ReferenceCommand.RunAsync(["import", "--file", SampleFilePath], scope.ServiceProvider.GetRequiredService<ReferenceImporter>(), output, error);
        Assert.True(exitCode == 0, error.ToString());
    }

    [Fact]
    public async Task SampleImport_IsRepeatableAndExposedThroughTheApi()
    {
        await ImportSampleAsync(_factory);
        await ImportSampleAsync(_factory);

        var reference = await _client.GetFromJsonAsync<ReferenceData>("/api/reference", Json);
        Assert.Equal(2, reference!.Occurrences.Count);
        var first = reference.Occurrences[0];
        Assert.Equal(["2026-09-20", "2026-09-21"], first.Days.Select(d => d.Date.ToString("yyyy-MM-dd")));
        Assert.Equal(("10:00", "16:00"), (first.Days[0].PublicStart, first.Days[0].PublicEnd));
        // 一般公開時間が未登録の開催日は、推定せずnullのまま返す（07 AC23）。
        var unregistered = reference.Occurrences[1].Days.Single(d => d.Date == new DateOnly(2026, 11, 4));
        Assert.Null(unregistered.PublicStart);
        Assert.Contains(reference.Categories, c => c is { Name: "旧カテゴリ", Selectable: false });

        await using var scope = _factory.Services.CreateAsyncScope();
        Assert.Equal(4, await scope.ServiceProvider.GetRequiredService<StudioDbContext>().Spots.CountAsync());
    }

    [Fact]
    public async Task Import_WithAnInvalidRow_WritesNothing()
    {
        var file = new ReferenceFile(
            [new ReferenceFileOccurrence(Guid.NewGuid(), "開催回", [new ReferenceFileDay(Guid.NewGuid(), new DateOnly(2026, 9, 20), "16:00", "10:00", null, null)])],
            [new ReferenceFileCategory(Guid.NewGuid(), "体験", 1, true)],
            [new ReferenceFileSpot("valid_id", "教室", null, null, null, true, null), new ReferenceFileSpot(" padded", "教室", null, null, null, true, null)]);

        await using var scope = _factory.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<ReferenceImporter>().ImportAsync(file);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Messages, m => m.Contains("一般公開時間"));
        Assert.Contains(result.Messages, m => m.Contains("前後に空白"));
        var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
        Assert.Equal(0, await db.Spots.CountAsync());
        Assert.Equal(0, await db.Categories.CountAsync());
    }

    [Fact]
    public async Task CanonicalIdsThatDifferOnlyByCase_AreDistinctSpots()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var importer = scope.ServiceProvider.GetRequiredService<ReferenceImporter>();
        var result = await importer.ImportAsync(new ReferenceFile(null, null,
        [
            new ReferenceFileSpot("mb_f2_rm_2a", "小文字", null, null, null, true, null),
            new ReferenceFileSpot("MB_F2_RM_2A", "大文字", null, null, null, true, null),
        ]));
        Assert.True(result.Succeeded, string.Join(" ", result.Messages));

        var lookup = await _client.GetFromJsonAsync<List<SpotItem>>("/api/spots/lookup?id=MB_F2_RM_2A", Json);
        Assert.Equal("大文字", Assert.Single(lookup!).Name);
        var missing = await _client.GetFromJsonAsync<List<SpotItem>>("/api/spots/lookup?id=Mb_F2_Rm_2A", Json);
        Assert.Empty(missing!);
    }

    [Fact]
    public async Task SpotSearch_MatchesNameAliasAndIdAndFiltersByBuilding()
    {
        await ImportSampleAsync(_factory);

        var byName = await _client.GetFromJsonAsync<SpotSearchResult>("/api/spots?q=2A教室", Json);
        Assert.Equal(["mb_f2_cr_2a", "sample_other_2a"], byName!.Items.Select(s => s.CanonicalId).Order(StringComparer.Ordinal));

        var byAlias = await _client.GetFromJsonAsync<SpotSearchResult>("/api/spots?q=エントランス", Json);
        Assert.Equal("sample_lobby_1f", Assert.Single(byAlias!.Items).CanonicalId);

        var byId = await _client.GetFromJsonAsync<SpotSearchResult>("/api/spots?q=cr_2b", Json);
        Assert.Equal("mb_f2_cr_2b", Assert.Single(byId!.Items).CanonicalId);

        var byBuilding = await _client.GetFromJsonAsync<SpotSearchResult>("/api/spots?q=2A&building=別棟", Json);
        var other = Assert.Single(byBuilding!.Items);
        Assert.Equal("noNewSelection", other.Utilization);
        Assert.Equal(["別棟", "本館"], byBuilding.Buildings.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Command_RejectsBadArguments()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var importer = scope.ServiceProvider.GetRequiredService<ReferenceImporter>();
        Assert.Equal(2, await ReferenceCommand.RunAsync([], importer, new StringWriter(), new StringWriter()));
        Assert.Equal(1, await ReferenceCommand.RunAsync(["import", "--file", "/nonexistent/file.json"], importer, new StringWriter(), new StringWriter()));
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/api/reference")).StatusCode);
    }
}
