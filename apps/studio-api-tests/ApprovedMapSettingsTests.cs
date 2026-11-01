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

    /// <summary>
    /// リポジトリの承認済み設定（2026-11-01 オーナー承認）。値の形が検証器に受け入れられ、出発ノードは経路データ
    /// （nexus-mobile #16・#39）が揃うまで未記入のため、公開判定はその不足で止まることを確かめる。
    /// </summary>
    [Fact]
    public void RepositorySettingsAreApprovedAndStillLackStartNodes()
    {
        var settings = ApprovedMapSettings.Load(Path.Combine(FindRepositoryRoot(), "deploy/map-validation/approved-settings.json"));

        Assert.True(settings.IsApproved);
        var context = settings.ApplyTo(new DatasetValidationContext { ForPublication = true });
        Assert.NotNull(context.CampusBoundaryGeoJson);
        Assert.Equal(new GeoOrigin(141.622712, 42.783592), context.EnuOrigin);
        Assert.Equal(5, context.EntranceMaxGapMetres);
        Assert.Equal(2, context.PathDistanceToleranceMetres);
        Assert.Null(context.StartNodeIds);

        var errors = new MapDatasetValidator().Validate(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/map-dataset.json")), context).Errors;
        Assert.DoesNotContain(errors, e => e.Code == "invalid_validation_context");
        Assert.Contains(errors, e => e.Code == "missing_validation_context" && e.Path == "/context/startNodeIds");
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
