using Microsoft.EntityFrameworkCore;
using StudioApi.Admin;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Services.MapValidation;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("StudioDatabase");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "ConnectionStrings:StudioDatabase が設定されていません。環境変数 ConnectionStrings__StudioDatabase で指定してください。" +
        "既定の接続文字列はコードに置きません（Step 0-d）。");
}

builder.Services.AddDbContext<StudioDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddSingleton<MapDatasetValidator>();
builder.Services.AddStudioAuth(builder.Environment);
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

var app = builder.Build();

// 運用者用の管理者アカウント操作。Webサーバーは起動しない（15 v02 Step 1-c）。
if (args.Length > 0 && args[0] == "admin")
{
    await using var scope = app.Services.CreateAsyncScope();
    var service = scope.ServiceProvider.GetRequiredService<AdminAccountService>();
    return await AdminCommand.RunAsync(
        args[1..], service, Console.In, Console.Out, Console.Error, interactive: !Console.IsInputRedirected);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<CsrfValidationMiddleware>();

// 起動時にマイグレーションを自動適用・シードする処理は意図的に持ち込まない（Step 0-c）。
// マイグレーション適用は `dotnet ef database update` を明示的に実行すること。
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapAuthEndpoints();

await app.RunAsync();
return 0;

public partial class Program;
