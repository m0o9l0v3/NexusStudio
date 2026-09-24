using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using StudioApi.Auth;

namespace StudioApi.Tests;

public sealed class AuthEndpointsTests : IAsyncLifetime
{
    private readonly StudioApiFactory _factory = new();

    public async Task InitializeAsync()
    {
        await _factory.InitializeDatabaseAsync();
        Assert.True((await _factory.AddAdminAsync()).Succeeded);
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Health_IsAvailableWithoutLogin()
    {
        var response = await _factory.CreateBrowserClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Me_WithoutLogin_Returns401InsteadOfRedirect()
    {
        var response = await _factory.CreateBrowserClient().GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Login_WithoutCsrfToken_IsRejectedBeforeCheckingCredentials()
    {
        var client = _factory.CreateBrowserClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email = StudioApiFactory.AdminEmail, password = StudioApiFactory.AdminPassword });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CsrfValidationMiddleware.InvalidCsrfCode, await ReadCodeAsync(response));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Login_WithValidCredentials_StartsSessionWithHardenedCookie()
    {
        var client = _factory.CreateBrowserClient();
        var response = await client.LoginAsync();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith(AuthServiceCollectionExtensions.SessionCookieName + "=", StringComparison.Ordinal));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);

        var me = await client.GetFromJsonAsync<SessionResponse>("/api/auth/me");
        Assert.Equal(StudioApiFactory.AdminEmail, me!.Email);
        Assert.Equal("m09", me.DisplayName);
    }

    [Theory]
    [InlineData(StudioApiFactory.AdminEmail, "wrong password here")]
    [InlineData("nobody@example.test", StudioApiFactory.AdminPassword)]
    public async Task Login_WithWrongCredentials_ReturnsTheSameResponseForUnknownAndKnownAccounts(string email, string password)
    {
        var client = _factory.CreateBrowserClient();
        var response = await client.LoginAsync(email, password);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(AuthEndpoints.InvalidCredentialsCode, await ReadCodeAsync(response));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Login_WithMissingFields_ReturnsBadRequest()
    {
        var response = await _factory.CreateBrowserClient().LoginAsync(" ", "");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("missing_credentials", await ReadCodeAsync(response));
    }

    [Fact]
    public async Task Login_IsLockedAfterRepeatedFailures_WithoutRevealingTheLockout()
    {
        var client = _factory.CreateBrowserClient();
        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.LoginAsync(password: "wrong password here")).StatusCode);
        }

        var response = await client.LoginAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(AuthEndpoints.InvalidCredentialsCode, await ReadCodeAsync(response));
    }

    [Fact]
    public async Task Logout_EndsTheSession()
    {
        var client = _factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.LoginAsync()).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostWithCsrfAsync("/api/auth/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task CsrfTokenIssuedBeforeLogin_IsRejectedAfterLogin()
    {
        var client = _factory.CreateBrowserClient();
        var anonymousToken = await client.GetCsrfTokenAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await client.LoginAsync()).StatusCode);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, anonymousToken);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task DisabledAdmin_CannotLogIn()
    {
        await _factory.WithAdminServiceAsync(s => s.DisableAsync(StudioApiFactory.AdminEmail));

        var response = await _factory.CreateBrowserClient().LoginAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(AuthEndpoints.InvalidCredentialsCode, await ReadCodeAsync(response));
    }

    [Fact]
    public async Task DisablingAnAdmin_EndsTheirExistingSession()
    {
        var client = _factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.LoginAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);

        await _factory.WithAdminServiceAsync(s => s.DisableAsync(StudioApiFactory.AdminEmail));

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task ResettingThePassword_EndsExistingSessionsAndAcceptsOnlyTheNewPassword()
    {
        var client = _factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.LoginAsync()).StatusCode);

        const string newPassword = "a brand new passphrase";
        Assert.True((await _factory.WithAdminServiceAsync(s => s.ResetPasswordAsync(StudioApiFactory.AdminEmail, newPassword))).Succeeded);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        var fresh = _factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await fresh.LoginAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await fresh.LoginAsync(password: newPassword)).StatusCode);
    }

    private static async Task<string?> ReadCodeAsync(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }
}

public sealed class AuthCookieProductionTests : IAsyncLifetime
{
    private readonly StudioApiFactory _factory = new("Production");

    public async Task InitializeAsync()
    {
        await _factory.InitializeDatabaseAsync();
        Assert.True((await _factory.AddAdminAsync()).Succeeded);
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task OutsideDevelopment_SessionAndCsrfCookiesAreSecure()
    {
        var client = _factory.CreateBrowserClient("https://localhost");
        var response = await client.LoginAsync();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith(AuthServiceCollectionExtensions.SessionCookieName + "=", StringComparison.Ordinal));
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);

        var csrf = await client.GetAsync("/api/auth/csrf");
        Assert.All(csrf.Headers.GetValues("Set-Cookie").Where(c => c.StartsWith(AuthServiceCollectionExtensions.CsrfCookieName, StringComparison.Ordinal)),
            c => Assert.Contains("secure", c, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task OutsideDevelopment_OpenApiDocumentIsNotExposed()
    {
        var response = await _factory.CreateBrowserClient("https://localhost").GetAsync("/openapi/v1.json");
        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }
}
