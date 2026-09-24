using System.Text.Json.Nodes;

namespace StudioApi.Tests;

/// <summary>
/// Studio Web が型を生成する元の OpenAPI 文書（apps/studio-web/openapi/studio-api.json）が、
/// 実際のAPIと食い違っていないことを確かめる（15 v01 Step 2-c）。
/// 意図してAPIを変えた場合は `STUDIO_UPDATE_OPENAPI=1 dotnet test` で文書を更新し、
/// apps/studio-web で `npm run gen:api` を実行する。
/// </summary>
public sealed class OpenApiDocumentTests : IAsyncLifetime
{
    private readonly StudioApiFactory _factory = new();

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task CheckedInDocument_MatchesTheRunningApi()
    {
        var generated = JsonNode.Parse(await _factory.CreateBrowserClient().GetStringAsync("/openapi/v1.json"))!;
        // サーバーURLは実行環境で変わるため比較から外す。
        generated.AsObject().Remove("servers");
        var path = Path.Combine(FindRepositoryRoot(), "apps", "studio-web", "openapi", "studio-api.json");

        if (Environment.GetEnvironmentVariable("STUDIO_UPDATE_OPENAPI") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, generated.ToJsonString(new() { WriteIndented = true }) + "\n");
        }

        Assert.True(File.Exists(path), $"{path} がありません。STUDIO_UPDATE_OPENAPI=1 で生成してください。");
        var checkedIn = JsonNode.Parse(await File.ReadAllTextAsync(path));
        Assert.True(JsonNode.DeepEquals(generated, checkedIn),
            "OpenAPI文書が実際のAPIと異なります。STUDIO_UPDATE_OPENAPI=1 dotnet test で更新し、apps/studio-web で npm run gen:api を実行してください。");
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
