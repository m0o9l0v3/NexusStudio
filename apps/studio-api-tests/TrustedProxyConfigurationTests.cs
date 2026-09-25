using StudioApi.Data;

namespace StudioApi.Tests;

public sealed class TrustedProxyConfigurationTests
{
    [Theory]
    [InlineData("172.30.250.0/28")]
    [InlineData("10.42.7.0/24")]
    [InlineData("192.168.81.0/27")]
    public void AcceptsNarrowPrivateEdgeNetwork(string value)
        => Assert.Equal(value, TrustedProxyConfiguration.Parse(value).ToString());

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("0.0.0.0/0")]
    [InlineData("172.30.0.0/16")]
    [InlineData("172.30.250.0/29")]
    [InlineData("192.0.2.0/24")]
    [InlineData("127.0.0.0/8")]
    public void RejectsMissingBroadOrNonPrivateNetwork(string? value)
        => Assert.Throws<InvalidOperationException>(() => TrustedProxyConfiguration.Parse(value));
}
