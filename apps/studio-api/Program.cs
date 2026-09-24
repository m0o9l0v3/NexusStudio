using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using StudioApi.Admin;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Publishing;
using StudioApi.Reference;
using StudioApi.Services.MapValidation;

var builder = WebApplication.CreateBuilder(args);

var connectionString = StudioDatabaseConfiguration.Resolve(builder.Configuration);

builder.Services.AddDbContext<StudioDbContext>(options => options.UseStudioNpgsql(connectionString));
builder.Services.AddSingleton<MapDatasetValidator>();
builder.Services.AddStudioAuth(builder.Environment);
builder.Services.AddScoped<ReferenceImporter>();
builder.Services.AddScoped<CandidateValidator>();
builder.Services.AddScoped<PublishingService>();
builder.Services.AddProblemDetails();
// 数値を文字列で受け付けない（rowVersion等の型をOpenAPI・生成型でも数値だけにする）。
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
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

// 運用者用の参照データ取り込み（開催回・開催日・カテゴリ・Spot）。起動時のシードの代わりに明示的に実行する。
if (args.Length > 0 && args[0] == "reference")
{
    await using var scope = app.Services.CreateAsyncScope();
    var importer = scope.ServiceProvider.GetRequiredService<ReferenceImporter>();
    return await ReferenceCommand.RunAsync(args[1..], importer, Console.Out, Console.Error);
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
app.MapReferenceEndpoints();
app.MapOccurrenceEndpoints();
app.MapCategoryEndpoints();
app.MapSpotEndpoints();
app.MapEventEndpoints();
app.MapReleaseEndpoints();
app.MapLogEndpoints();

await app.RunAsync();
return 0;

public partial class Program;
