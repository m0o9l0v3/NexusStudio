using StudioApi.Services.MapValidation;

namespace StudioApi.Tests;

public sealed class ApprovedMapSettingsTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "studio-map-settings-" + Guid.NewGuid().ToString("N"));

    public ApprovedMapSettingsTests() => Directory.CreateDirectory(_root);

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private string Write(string json)
    {
        var path = Path.Combine(_root, Guid.NewGuid().ToString("N") + ".json");
        File.WriteAllText(path, json);
        return path;
    }

    // 検証の形だけを確かめる値。実際のキャンパスの値ではない。
    private const string ApprovedJson = """
        {
          "status": "approved",
          "approvedBy": "owner",
          "approvedAt": "2026-11-01",
          "campusBoundary": { "type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
          "enuOrigin": { "longitude": 0.5, "latitude": 0.5 },
          "entranceMaxGapMetres": 1.5,
          "pathDistanceToleranceMetres": 2,
          "startNodeIds": ["test_n_001"]
        }
        """;

    [Fact]
    public void RepositoryTemplateIsAnUnapprovedDraftThatAddsNothing()
    {
        var settings = ApprovedMapSettings.Load(Path.Combine(FindRepositoryRoot(), "deploy/map-validation/approved-settings.json"));

        Assert.False(settings.IsApproved);
        var context = settings.ApplyTo(new DatasetValidationContext { ForPublication = true });
        Assert.Null(context.CampusBoundaryGeoJson);
        Assert.Null(context.EnuOrigin);
        Assert.Null(context.EntranceMaxGapMetres);
        Assert.Null(context.PathDistanceToleranceMetres);
        Assert.Null(context.StartNodeIds);
    }

    [Fact]
    public void DraftValuesAreNotPassedToTheValidator()
    {
        var settings = ApprovedMapSettings.Load(Write(ApprovedJson.Replace("\"approved\",", "\"draft\",")));

        Assert.Null(settings.ApplyTo(new DatasetValidationContext()).EnuOrigin);
    }

    [Fact]
    public void ApprovedValuesArePassedToTheValidator()
    {
        var settings = ApprovedMapSettings.Load(Write(ApprovedJson));
        var context = settings.ApplyTo(new DatasetValidationContext { ForPublication = true });

        Assert.True(context.ForPublication);
        Assert.Contains("\"Polygon\"", context.CampusBoundaryGeoJson);
        Assert.Equal(new GeoOrigin(0.5, 0.5), context.EnuOrigin);
        Assert.Equal(1.5, context.EntranceMaxGapMetres);
        Assert.Equal(2, context.PathDistanceToleranceMetres);
        Assert.Equal(["test_n_001"], context.StartNodeIds);
        Assert.Matches("^[0-9a-f]{64}$", settings.Sha256);
    }

    [Fact]
    public void FingerprintChangesWithTheFile()
        => Assert.NotEqual(
            ApprovedMapSettings.Load(Write(ApprovedJson)).Sha256,
            ApprovedMapSettings.Load(Write(ApprovedJson.Replace("1.5", "1.6"))).Sha256);

    [Theory]
    [InlineData("\"approvedBy\": \"owner\",", "\"approvedBy\": null,")]
    [InlineData("\"approvedAt\": \"2026-11-01\",", "\"approvedAt\": null,")]
    [InlineData("\"status\": \"approved\",", "\"status\": \"reviewed\",")]
    [InlineData("\"startNodeIds\"", "\"startNodes\"")]
    [InlineData("\"entranceMaxGapMetres\": 1.5", "\"entranceMaxGapMetres\": \"1.5\"")]
    [InlineData("{ \"longitude\": 0.5, \"latitude\": 0.5 }", "{}")]
    [InlineData("{ \"longitude\": 0.5, \"latitude\": 0.5 }", "{ \"longitude\": 0.5 }")]
    [InlineData("{ \"longitude\": 0.5, \"latitude\": 0.5 }", "{ \"latitude\": 0.5 }")]
    public void RejectsIncompleteApprovalUnknownFieldsAndWrongTypes(string from, string to)
        => Assert.Throws<InvalidOperationException>(() => ApprovedMapSettings.Load(Write(ApprovedJson.Replace(from, to))));

    [Fact]
    public void ValidatorStillReportsValuesTheOwnerHasNotSet()
    {
        var settings = ApprovedMapSettings.Load(Write(ApprovedJson.Replace("\"entranceMaxGapMetres\": 1.5", "\"entranceMaxGapMetres\": null")));

        Assert.Null(settings.ApplyTo(new DatasetValidationContext { ForPublication = true }).EntranceMaxGapMetres);
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "NexusStudio.slnx")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("リポジトリのルートが見つかりません。");
    }
}
