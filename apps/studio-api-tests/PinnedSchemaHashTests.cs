using System.Security.Cryptography;
using Xunit;

namespace StudioApi.Tests;

/// <summary>
/// docs/schemas/map-dataset-geojson-v2.schema.json は nexus-mobile からpinしたコピー（15 v02 §3.1）。
/// GeoJSON payload 契約 2.0.0（nexus-mobile E1-4 改訂1）。v1 のコピーは記録として残し、読み込まない。
/// Studio側で契約を緩めていないことを、埋め込みリソースのSHA-256で機械的に確認する。
/// nexus-mobile側でSchemaが更新された場合は、コピーとこのhashの両方を意図的に更新すること。
/// </summary>
public sealed class PinnedSchemaHashTests
{
    // nexus-mobile/docs/schemas/map-dataset-geojson-v2.schema.json の SHA-256（2026-10-23、nexus-mobile 2d06eeb でpin）。
    private const string ExpectedSha256 = "434ca0eaf0d192cacc122687fbe52c2d826de0e636b684ca43004b7282d3ccf3";

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
