using System.Runtime.Versioning;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Auth;

namespace StudioApi.Tests;

// 権限の検査は Unix のファイルモードを使う（CI・開発機・本番コンテナはいずれも Unix）。
[UnsupportedOSPlatform("windows")]
public sealed class DataProtectionConfigurationTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "studio-dp-tests-" + Guid.NewGuid().ToString("N"));

    public DataProtectionConfigurationTests() => Directory.CreateDirectory(_root);

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private string CreateDirectory(string name, UnixFileMode mode)
    {
        var path = Path.Combine(_root, name);
        Directory.CreateDirectory(path, mode);
        return path;
    }

    [Fact]
    public void AcceptsPrivateAbsoluteDirectory()
    {
        var path = CreateDirectory("private", UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        Assert.Equal(path, DataProtectionConfiguration.RequirePrivateDirectory(path).FullName);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("relative/keys")]
    public void RejectsMissingOrRelativePath(string? value)
        => Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.RequirePrivateDirectory(value));

    [Fact]
    public void RejectsDirectoryThatDoesNotExist()
        => Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.RequirePrivateDirectory(Path.Combine(_root, "missing")));

    [Theory]
    [InlineData(UnixFileMode.GroupRead)]
    [InlineData(UnixFileMode.OtherRead)]
    [InlineData(UnixFileMode.OtherWrite)]
    public void RejectsDirectoryOpenToGroupOrOthers(UnixFileMode extra)
    {
        var path = CreateDirectory("shared", UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute | extra);
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.RequirePrivateDirectory(path));
    }

    [Fact]
    public void ProductionWebServerRequiresKeysDirectory()
        => Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.ConfigureForInvocation(
            new ServiceCollection(), isDevelopment: false, args: [], keysDirectoryValue: null));

    [Theory]
    [InlineData("admin")]
    [InlineData("reference")]
    [InlineData("map")]
    [InlineData("spot")]
    public void ProductionCliCommandsDoNotRequireKeysDirectory(string command)
        => DataProtectionConfiguration.ConfigureForInvocation(
            new ServiceCollection(), isDevelopment: false, args: [command], keysDirectoryValue: null);

    [Fact]
    public void ProductionWebServerPersistsKeysAcrossRestarts()
    {
        var path = CreateDirectory("keys", UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);

        string Protect()
        {
            var services = new ServiceCollection();
            services.AddLogging();
            DataProtectionConfiguration.ConfigureForInvocation(services, isDevelopment: false, args: [], keysDirectoryValue: path);
            using var provider = services.BuildServiceProvider();
            return provider.GetDataProtector("test").Protect("session");
        }

        string Unprotect(string token)
        {
            var services = new ServiceCollection();
            services.AddLogging();
            DataProtectionConfiguration.ConfigureForInvocation(services, isDevelopment: false, args: [], keysDirectoryValue: path);
            using var provider = services.BuildServiceProvider();
            return provider.GetDataProtector("test").Unprotect(token);
        }

        // 別のプロセス（再起動後）を模して、新しいサービスプロバイダーで復号できる。
        Assert.Equal("session", Unprotect(Protect()));
        Assert.NotEmpty(Directory.GetFiles(path, "key-*.xml"));
    }
}
