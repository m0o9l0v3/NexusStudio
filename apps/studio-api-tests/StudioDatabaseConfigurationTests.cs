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

    [Theory]
    [InlineData("Host=postgres;Database=nexus_admin;Username=postgres;Password=example")]
    [InlineData("Host=postgres;Database=nexus_admin;Username=nexus_studio_migrator;Password=example")]
    [InlineData("Host=postgres;Database=nexus_admin;Username=nexus_studio_app")]
    public void ProductionRejectsPrivilegedOrPasswordlessConnection(string value)
    {
        Assert.Throws<InvalidOperationException>(() => StudioDatabaseConfiguration.RequireProductionRuntimeRole(value));
    }

    [Fact]
    public void ProductionAcceptsDedicatedRuntimeRole()
    {
        StudioDatabaseConfiguration.RequireProductionRuntimeRole(
            "Host=postgres;Database=nexus_admin;Username=nexus_studio_app;Password=example");
    }

    [Fact]
    public void MissingConnectionFailsClosed()
    {
        var config = new ConfigurationBuilder().Build();
        Assert.Throws<InvalidOperationException>(() => StudioDatabaseConfiguration.Resolve(config));
    }
}
