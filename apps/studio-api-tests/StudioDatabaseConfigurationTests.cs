using Microsoft.Extensions.Configuration;
using StudioApi.Data;

namespace StudioApi.Tests;

public sealed class StudioDatabaseConfigurationTests
{
    [Fact]
    public void SecretFileOverridesDirectConnectionAndTrimsFinalNewline()
    {
        var file = Path.GetTempFileName();
        try
        {
            File.WriteAllText(file, "Host=postgres;Database=nexus_admin;Username=studio;Password=example\n");
            var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:StudioDatabase"] = "Host=wrong",
                ["ConnectionStrings:StudioDatabaseFile"] = file
            }).Build();
            Assert.Equal("Host=postgres;Database=nexus_admin;Username=studio;Password=example",
                StudioDatabaseConfiguration.Resolve(config));
        }
        finally { File.Delete(file); }
    }

    [Fact]
    public void MissingConnectionFailsClosed()
    {
        var config = new ConfigurationBuilder().Build();
        Assert.Throws<InvalidOperationException>(() => StudioDatabaseConfiguration.Resolve(config));
    }
}
