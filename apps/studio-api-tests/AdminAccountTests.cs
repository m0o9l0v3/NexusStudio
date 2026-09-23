using StudioApi.Admin;

namespace StudioApi.Tests;

public sealed class AdminAccountTests : IAsyncLifetime
{
    private readonly StudioApiFactory _factory = new();

    public Task InitializeAsync() => _factory.InitializeDatabaseAsync();

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Add_RejectsDuplicateEmailIgnoringCase()
    {
        Assert.True((await _factory.AddAdminAsync()).Succeeded);
        var duplicate = await _factory.AddAdminAsync(StudioApiFactory.AdminEmail.ToUpperInvariant());

        Assert.False(duplicate.Succeeded);
        Assert.Single(await _factory.WithAdminServiceAsync(s => s.ListAsync()));
    }

    [Fact]
    public async Task Add_RejectsShortPasswordAndInvalidEmail()
    {
        var shortPassword = await _factory.AddAdminAsync(password: "short");
        Assert.False(shortPassword.Succeeded);
        Assert.Contains("12文字以上", shortPassword.Message);

        Assert.False((await _factory.AddAdminAsync(email: "not-an-email")).Succeeded);
        Assert.Empty(await _factory.WithAdminServiceAsync(s => s.ListAsync()));
    }

    [Fact]
    public async Task DisableAndEnable_AreReflectedInTheList()
    {
        await _factory.AddAdminAsync();

        Assert.True((await _factory.WithAdminServiceAsync(s => s.DisableAsync(StudioApiFactory.AdminEmail))).Succeeded);
        Assert.NotNull(Assert.Single(await _factory.WithAdminServiceAsync(s => s.ListAsync())).DisabledAt);

        Assert.True((await _factory.WithAdminServiceAsync(s => s.EnableAsync(StudioApiFactory.AdminEmail))).Succeeded);
        Assert.Null(Assert.Single(await _factory.WithAdminServiceAsync(s => s.ListAsync())).DisabledAt);
    }

    [Fact]
    public async Task ResetPassword_KeepsTheOldPasswordWhenTheNewOneIsRejected()
    {
        await _factory.AddAdminAsync();

        var result = await _factory.WithAdminServiceAsync(s => s.ResetPasswordAsync(StudioApiFactory.AdminEmail, "short"));
        Assert.False(result.Succeeded);

        var client = _factory.CreateBrowserClient();
        Assert.Equal(System.Net.HttpStatusCode.NoContent, (await client.LoginAsync()).StatusCode);
    }

    [Fact]
    public async Task OperationsOnUnknownEmail_Fail()
    {
        Assert.False((await _factory.WithAdminServiceAsync(s => s.DisableAsync("nobody@example.test"))).Succeeded);
        Assert.False((await _factory.WithAdminServiceAsync(s => s.EnableAsync("nobody@example.test"))).Succeeded);
        Assert.False((await _factory.WithAdminServiceAsync(s => s.ResetPasswordAsync("nobody@example.test", "long enough password"))).Succeeded);
    }

    [Fact]
    public async Task Command_AddReadsPasswordFromRedirectedStdin()
    {
        var (exitCode, output, _) = await RunCommandAsync(["add", "--email", StudioApiFactory.AdminEmail, "--name", "m09"], StudioApiFactory.AdminPassword);

        Assert.Equal(0, exitCode);
        Assert.Contains("登録しました", output);
        Assert.Equal(System.Net.HttpStatusCode.NoContent, (await _factory.CreateBrowserClient().LoginAsync()).StatusCode);
    }

    [Fact]
    public async Task Command_RefusesPasswordAsArgument()
    {
        var (exitCode, _, error) = await RunCommandAsync(["add", "--email", StudioApiFactory.AdminEmail, "--name", "m09", "--password", StudioApiFactory.AdminPassword], "");

        Assert.Equal(2, exitCode);
        Assert.Contains("コマンド引数で指定できません", error);
        Assert.Empty(await _factory.WithAdminServiceAsync(s => s.ListAsync()));
    }

    [Theory]
    [InlineData(new string[0], 2)]
    [InlineData(new[] { "unknown" }, 2)]
    [InlineData(new[] { "disable" }, 2)]
    [InlineData(new[] { "--help" }, 0)]
    public async Task Command_ReportsUsageErrors(string[] args, int expectedExitCode)
    {
        var (exitCode, _, _) = await RunCommandAsync(args, "");
        Assert.Equal(expectedExitCode, exitCode);
    }

    [Fact]
    public async Task Command_ListShowsStatus()
    {
        await _factory.AddAdminAsync();
        await _factory.WithAdminServiceAsync(s => s.DisableAsync(StudioApiFactory.AdminEmail));

        var (exitCode, output, _) = await RunCommandAsync(["list"], "");

        Assert.Equal(0, exitCode);
        Assert.Contains(StudioApiFactory.AdminEmail, output);
        Assert.Contains("無効", output);
    }

    private async Task<(int ExitCode, string Output, string Error)> RunCommandAsync(string[] args, string stdin)
    {
        var output = new StringWriter();
        var error = new StringWriter();
        var exitCode = await _factory.WithAdminServiceAsync(service =>
            AdminCommand.RunAsync(args, service, new StringReader(stdin), output, error, interactive: false));
        return (exitCode, output.ToString(), error.ToString());
    }
}
