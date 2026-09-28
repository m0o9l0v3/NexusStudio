using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.DependencyInjection;
using ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders;
using ForwardedHeadersOptions = Microsoft.AspNetCore.Builder.ForwardedHeadersOptions;

namespace StudioApi.Data;

public static class TrustedProxyConfiguration
{
    public static void ConfigureForInvocation(
        IServiceCollection services,
        bool isDevelopment,
        IReadOnlyList<string> args,
        string? trustedNetworkValue)
    {
        if (isDevelopment || !StartsWebServer(args))
            return;

        var trustedNetwork = Parse(trustedNetworkValue);
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedProto;
            options.KnownProxies.Clear();
            options.KnownIPNetworks.Clear();
            options.KnownIPNetworks.Add(trustedNetwork);
        });
    }

    public static IPNetwork Parse(string? value)
    {
        if (!IPNetwork.TryParse(value, out var network)
            || network.BaseAddress.AddressFamily != AddressFamily.InterNetwork
            || network.PrefixLength is < 24 or > 28
            || !IsPrivate(network.BaseAddress))
            throw new InvalidOperationException("ReverseProxy:TrustedNetwork must be a reviewed private IPv4 /24 to /28 edge subnet.");

        return network;
    }

    private static bool IsPrivate(IPAddress address)
    {
        var octets = address.GetAddressBytes();
        return octets[0] == 10
            || octets[0] == 172 && octets[1] is >= 16 and <= 31
            || octets[0] == 192 && octets[1] == 168;
    }

    private static bool StartsWebServer(IReadOnlyList<string> args)
        => args.Count == 0 || args[0] is not ("admin" or "reference");
}
