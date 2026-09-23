using Microsoft.EntityFrameworkCore;
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
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

// 起動時にマイグレーションを自動適用・シードする処理は意図的に持ち込まない（Step 0-c）。
// マイグレーション適用は `dotnet ef database update` を明示的に実行すること。
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
