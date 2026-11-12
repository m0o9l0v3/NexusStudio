using System.Security.Cryptography;
using Xunit;

namespace StudioApi.Tests;

/// <summary>
/// docs/schemas/map-dataset-geojson-v2.schema.json は nexus-mobile からpinしたコピー（15 v02 §3.1）。
/// GeoJSON payload 契約 2.0.0・2.1.0（nexus-mobile E1-4 改訂1・改訂2。2.1.0 で campus_ground を追加）。v1 のコピーは記録として残し、読み込まない。
/// Studio側で契約を緩めていないことを、埋め込みリソースのSHA-256で機械的に確認する。
/// nexus-mobile側でSchemaが更新された場合は、コピーとこのhashの両方を意図的に更新すること。
/// </summary>
public sealed class PinnedSchemaHashTests
{
    // nexus-mobile/docs/schemas/map-dataset-geojson-v2.schema.json の SHA-256（2026-11-12、nexus-mobile fed0fc2（PR #147 のマージ）でpin）。
    private const string ExpectedSha256 = "4d5b9674702929abdfe86ce146fe9118d32ad9874169798a2354b6b4bc72422b";

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
