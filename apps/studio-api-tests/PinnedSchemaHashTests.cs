using System.Security.Cryptography;
using Xunit;

namespace StudioApi.Tests;

/// <summary>
/// docs/schemas/map-dataset-geojson-v1.schema.json は nexus-mobile からpinしたコピー（15 v02 §3.1）。
/// Studio側で契約を緩めていないことを、埋め込みリソースのSHA-256で機械的に確認する。
/// nexus-mobile側でSchemaが更新された場合は、コピーとこのhashの両方を意図的に更新すること。
/// </summary>
public sealed class PinnedSchemaHashTests
{
    // nexus-mobile/docs/schemas/map-dataset-geojson-v1.schema.json の SHA-256（2026-09-22時点でpin）。
    private const string ExpectedSha256 = "90930a5d14f4b5efb9c2c76c930e3a988daa1c820ed9797c58c5652cbc67bc53";

    [Fact]
    public void EmbeddedMapDatasetSchema_MatchesPinnedNexusMobileHash()
    {
        using var stream = typeof(StudioApi.Services.MapValidation.MapDatasetValidator).Assembly
            .GetManifestResourceStream("StudioApi.MapDatasetSchema.json");
        Assert.NotNull(stream);
        var hash = Convert.ToHexString(SHA256.HashData(stream!)).ToLowerInvariant();
        Assert.Equal(ExpectedSha256, hash);
    }
}
