using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Data;
using StudioApi.Map;
using StudioApi.Models;
using StudioApi.Services.MapValidation;

namespace StudioApi.Tests;

public sealed class MapImportTests : IAsyncLifetime
{
    private readonly StudioApiFactory _factory = new();
    private readonly string _root = Path.Combine(Path.GetTempPath(), "studio-map-import-" + Guid.NewGuid().ToString("N"));

    // フィクスチャの経路・フロアに対応する、形を確かめるための値（実測値ではない）。
    internal const string Evidence = """
        {
          "expectedPathSeconds": { "campus_e_012": 15, "campus_e_013": 25, "mb_1f_e_001": 13 },
          "floorTransforms": {
            "mb_1f": { "roundTripMaxMetres": 0.01, "fitRmsMetres": 1, "fitMaxMetres": 1, "checkMaxMetres": 1, "roundingMaxMetres": 0.01 }
          }
        }
        """;

    internal static string FixturePayload => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/map-dataset.json"));

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(_root);
        await _factory.InitializeDatabaseAsync();
    }

    public async Task DisposeAsync()
    {
        Directory.Delete(_root, recursive: true);
        await _factory.DisposeAsync();
    }

    private async Task<(int ExitCode, string Output, string Error)> RunAsync(params string[] args)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var output = new StringWriter();
        var error = new StringWriter();
        var exitCode = await MapCommand.RunAsync(args, scope.ServiceProvider.GetRequiredService<MapImporter>(), output, error);
        return (exitCode, output.ToString(), error.ToString());
    }

    private string Write(string name, string content)
    {
        var path = Path.Combine(_root, name);
        File.WriteAllText(path, content, new UTF8Encoding(false));
        return path;
    }

    private async Task<List<MapDataset>> DatasetsAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<StudioDbContext>().MapDatasets.AsNoTracking().OrderBy(m => m.Version).ToListAsync();
    }

    [Fact]
    public async Task ImportsValidMapAsDraftVersionWithExactBytesAndEvidence()
    {
        var payload = FixturePayload;
        var (exitCode, output, error) = await RunAsync("import", "--file", Write("map.json", payload), "--evidence", Write("evidence.json", Evidence));

        Assert.True(exitCode == 0, error);
        Assert.Contains("v1", output);
        var dataset = Assert.Single(await DatasetsAsync());
        Assert.Equal(1, dataset.Version);
        Assert.Equal(MapDatasetStatus.Draft, dataset.Status);
        Assert.Null(dataset.PublishedAt);
        Assert.Equal(payload, dataset.Payload);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(payload))), dataset.Checksum);
        var evidence = MapDatasetEvidence.Parse(dataset.ValidationEvidence!);
        Assert.Equal(13, evidence.ExpectedPathSeconds["mb_1f_e_001"]);
        Assert.Equal(1, evidence.FloorTransforms["mb_1f"].FitRmsMetres);
    }

    [Fact]
    public async Task EvidenceIsOptionalAndOrderOfOptionsDoesNotMatter()
    {
        Assert.Equal(0, (await RunAsync("import", "--file", Write("a.json", FixturePayload))).ExitCode);
        Assert.Null(Assert.Single(await DatasetsAsync()).ValidationEvidence);

        Assert.Equal(0, (await RunAsync("import", "--evidence", Write("e.json", Evidence), "--file", Write("b.json", FixturePayload))).ExitCode);
        Assert.Equal([1L, 2L], (await DatasetsAsync()).Select(d => d.Version));
    }

    [Fact]
    public async Task SameContentAsLatestVersionIsNotImportedAgain()
    {
        var path = Write("map.json", FixturePayload);
        Assert.Equal(0, (await RunAsync("import", "--file", path)).ExitCode);

        var (exitCode, _, error) = await RunAsync("import", "--file", path);

        Assert.Equal(1, exitCode);
        Assert.Contains("同じ内容", error);
        Assert.Single(await DatasetsAsync());
    }

    [Fact]
    public async Task InvalidMapIsRejectedWithValidatorCodes()
    {
        var data = JsonNode.Parse(FixturePayload)!.AsObject();
        data["features"]!.AsArray().Add(data["features"]![0]!.DeepClone());

        var (exitCode, _, error) = await RunAsync("import", "--file", Write("map.json", data.ToJsonString()));

        Assert.Equal(1, exitCode);
        Assert.Contains("duplicate_canonical_id", error);
        Assert.Empty(await DatasetsAsync());
    }

    [Theory]
    [InlineData("""{ "expectedPathSeconds": { "campus_e_999": 15 }, "floorTransforms": {} }""", "campus_e_999")]
    [InlineData("""{ "expectedPathSeconds": { "mb_1f_n_001": 15 }, "floorTransforms": {} }""", "mb_1f_n_001")]
    [InlineData("""{ "expectedPathSeconds": {}, "floorTransforms": { "mb_9f": { "roundTripMaxMetres": 0, "fitRmsMetres": 0, "fitMaxMetres": 0, "checkMaxMetres": 0, "roundingMaxMetres": 0 } } }""", "mb_9f")]
    [InlineData("""{ "expectedPathSeconds": {}, "floorTransforms": { "mb_1f": { "roundTripMaxMetres": 0.01 } } }""", "読み取れません")]
    [InlineData("""{ "expectedPathSeconds": {} }""", "読み取れません")]
    [InlineData("""{ "expectedPathSeconds": { "campus_e_012": "15" }, "floorTransforms": {} }""", "読み取れません")]
    [InlineData("""{ "expectedPathSeconds": {}, "floorTransforms": {}, "note": "x" }""", "読み取れません")]
    public async Task EvidenceThatDoesNotMatchTheMapOrTheFormatIsRejected(string evidence, string expected)
    {
        var (exitCode, _, error) = await RunAsync("import", "--file", Write("map.json", FixturePayload), "--evidence", Write("e.json", evidence));

        Assert.Equal(1, exitCode);
        Assert.Contains(expected, error);
        Assert.Empty(await DatasetsAsync());
    }

    [Theory]
    [InlineData]
    [InlineData("import")]
    [InlineData("import", "--file")]
    [InlineData("publish", "--file", "map.json")]
    [InlineData("import", "--evidence", "e.json")]
    [InlineData("import", "--file", "a.json", "--file", "b.json")]
    [InlineData("import", "--file", "a.json", "--other", "b.json")]
    public async Task InvalidArgumentsPrintUsage(params string[] args)
    {
        var (exitCode, _, error) = await RunAsync(args);

        Assert.Equal(2, exitCode);
        Assert.Contains("使い方", error);
    }

    [Fact]
    public async Task MissingFileIsReported()
    {
        var (exitCode, _, error) = await RunAsync("import", "--file", Path.Combine(_root, "missing.json"));

        Assert.Equal(1, exitCode);
        Assert.Contains("読み取れません", error);
    }

    [Fact]
    public void EvidenceIsAppliedToTheValidationContextWithOrdinalKeys()
    {
        var context = MapDatasetEvidence.Parse(Evidence).ApplyTo(new DatasetValidationContext { ForPublication = true });

        Assert.Equal(15, context.ExpectedPathSeconds!["campus_e_012"]);
        Assert.False(context.ExpectedPathSeconds.ContainsKey("CAMPUS_E_012"));
        Assert.True(context.FloorTransforms!.ContainsKey("mb_1f"));
    }
}
