using System.Security.Cryptography;
using System.Text.Json;
using Json.Schema;

namespace StudioApi.Tests;

/// <summary>
/// docs/schemas/participant-bundle-v2.schema.json は nexus-mobile からpinしたコピー（E2-5 §5・改訂1、schema_version 2.0.0・2.1.0）。
/// 射影した bundle をこの Schema で検査する。nexus-mobile 側で更新された場合は、コピーと hash の両方を意図的に更新する。
/// </summary>
public sealed class ParticipantBundleSchema
{
    // nexus-mobile/docs/schemas/participant-bundle-v2.schema.json の SHA-256（2026-11-13、E2-5 改訂1 の 2.1.0。nexus-mobile feature/bundle-2-1-events でpin）。
    private const string ExpectedSha256 = "d1f57b7f5605ac370e8febb874f79245a677d4b556ed64abdcbf244bb115c46a";

    private static readonly Lazy<JsonSchema> Schema = new(() =>
    {
        var options = new BuildOptions { Dialect = Dialect.Draft202012, SchemaRegistry = new() };
        // bundle の Schema は地図の Schema を $id で参照する。
        options.SchemaRegistry.Register(JsonSchema.Build(Read("map-dataset-geojson-v2.schema.json"), options));
        return JsonSchema.Build(Read("participant-bundle-v2.schema.json"), options);
    });

    private static JsonElement Read(string name)
    {
        using var document = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", name)));
        return document.RootElement.Clone();
    }

    /// <summary>bundle が契約の Schema に合うことを確かめる。合わなければ理由を添えて失敗させる。</summary>
    public static void AssertValid(byte[] payload)
    {
        using var document = JsonDocument.Parse(payload);
        var result = Schema.Value.Evaluate(document.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List });
        Assert.True(result.IsValid, string.Join("\n", (result.Details ?? []).Where(d => d.Errors is { Count: > 0 })
            .SelectMany(d => d.Errors!.Select(e => $"{d.InstanceLocation}: {e.Value}"))));
    }

    [Fact]
    public void Schema_RejectsABundleThatBreaksTheContract()
    {
        // 地図の無い bundle に spot の位置を書いても Schema は通る（参照整合は射影で保証する）ため、形の誤りで確かめる。
        Assert.ThrowsAny<Xunit.Sdk.XunitException>(() => AssertValid("""{ "nexus_bundle": {}, "spots": [], "id_aliases": [], "map": null }"""u8.ToArray()));
    }

    [Fact]
    public void PinnedCopy_MatchesNexusMobileHash()
    {
        var hash = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "participant-bundle-v2.schema.json"))));
        Assert.Equal(ExpectedSha256, hash);
    }
}
