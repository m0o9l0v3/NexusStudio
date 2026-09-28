using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StudioApi.Data;
using ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders;
using ForwardedHeadersOptions = Microsoft.AspNetCore.Builder.ForwardedHeadersOptions;

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

    [Theory]
    [InlineData("admin")]
    [InlineData("reference")]
    public void ProductionCliCommandsDoNotRequireOrConfigureForwardedHeaders(string command)
    {
        var services = new ServiceCollection();
        services.AddOptions();

        TrustedProxyConfiguration.ConfigureForInvocation(
            services,
            isDevelopment: false,
            args: [command],
            trustedNetworkValue: null);

        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
        Assert.Equal(ForwardedHeaders.None, options.ForwardedHeaders);
    }

    [Fact]
    public void ProductionWebServerStillRequiresTrustedNetwork()
    {
        var services = new ServiceCollection();

        Assert.Throws<InvalidOperationException>(() => TrustedProxyConfiguration.ConfigureForInvocation(
            services,
            isDevelopment: false,
            args: [],
            trustedNetworkValue: null));
    }

    [Fact]
    public void DevelopmentWebServerDoesNotRequireTrustedNetwork()
    {
        var services = new ServiceCollection();

        TrustedProxyConfiguration.ConfigureForInvocation(
            services,
            isDevelopment: true,
            args: [],
            trustedNetworkValue: null);
    }
}
