using Microsoft.EntityFrameworkCore;

namespace StudioApi.Data;

public static class StudioDbContextOptions
{
    public const string Schema = "studio";
    public const string MigrationsHistoryTable = "__EFMigrationsHistory";

    /// <summary>
    /// PostgreSQLへの接続設定。マイグレーション履歴も studio schema に置き、public schema を作成・変更しない（15 Step 0-b）。
    /// 本番では nexus-mobile と同じインスタンスを想定するため、public の履歴表へ Studio の履歴を混ぜない。
    /// </summary>
    public static DbContextOptionsBuilder<TContext> UseStudioNpgsql<TContext>(this DbContextOptionsBuilder<TContext> builder, string connectionString)
        where TContext : DbContext
        => builder.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable(MigrationsHistoryTable, Schema));

    public static DbContextOptionsBuilder UseStudioNpgsql(this DbContextOptionsBuilder builder, string connectionString)
        => builder.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable(MigrationsHistoryTable, Schema));
}
