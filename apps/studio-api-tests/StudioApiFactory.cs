using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StudioApi.Admin;
using StudioApi.Auth;
using StudioApi.Data;

namespace StudioApi.Tests;

/// <summary>
/// Studio APIを実際のミドルウェア構成のまま起動し、DBだけをSQLiteのメモリDBへ差し替える。
/// </summary>
public sealed class StudioApiFactory : WebApplicationFactory<Program>
{
    public const string AdminEmail = "admin@example.test";
    public const string AdminPassword = "correct horse battery";

    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly string _environment;

    public StudioApiFactory(string environment = "Development")
    {
        _environment = environment;
        _connection.Open();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environment);
        // Programは接続文字列が無いと起動を拒否する（Step 0-d）。実際のDBには接続しない値を渡し、下で差し替える。
        builder.UseSetting("ConnectionStrings:StudioDatabase", "Host=unused.invalid;Database=unused;Username=unused;Password=unused");
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<StudioDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<StudioDbContext>>();
            services.AddDbContext<StudioDbContext>(options => options
                .UseSqlite(_connection)
                .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning)));
            // 無効化・パスワード再設定がすぐ既存セッションへ反映されることを確かめるため、毎回再検証する。
            services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.Zero);
        });
    }

    public async Task InitializeDatabaseAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<StudioDbContext>().Database.MigrateAsync();
    }

    public async Task<AdminAccountResult> AddAdminAsync(string email = AdminEmail, string password = AdminPassword, string displayName = "m09")
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<AdminAccountService>().AddAsync(email, displayName, password);
    }

    public async Task<T> WithAdminServiceAsync<T>(Func<AdminAccountService, Task<T>> action)
    {
        await using var scope = Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AdminAccountService>());
    }

    public HttpClient CreateBrowserClient(string baseAddress = "http://localhost")
        => CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true,
            BaseAddress = new Uri(baseAddress),
        });

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
        }
    }
}

internal static class StudioClientExtensions
{
    public static async Task<string> GetCsrfTokenAsync(this HttpClient client)
    {
        var response = await client.GetFromJsonAsync<CsrfTokenResponse>("/api/auth/csrf");
        return response!.Token;
    }

    public static async Task<HttpResponseMessage> PostWithCsrfAsync(this HttpClient client, string path, object? body = null)
    {
        var token = await client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body ?? new { }) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        return await client.SendAsync(request);
    }

    public static Task<HttpResponseMessage> LoginAsync(this HttpClient client, string email = StudioApiFactory.AdminEmail, string password = StudioApiFactory.AdminPassword)
        => client.PostWithCsrfAsync("/api/auth/login", new { email, password });
}
