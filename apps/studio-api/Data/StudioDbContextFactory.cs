using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace StudioApi.Data;

/// <summary>Design-time context for reviewed SQL generation; never opens a database.</summary>
public sealed class StudioDbContextFactory : IDesignTimeDbContextFactory<StudioDbContext>
{
    public StudioDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("STUDIO_MIGRATION_CONNECTION");
        if (string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException("STUDIO_MIGRATION_CONNECTION is required for design-time migration commands.");
        var options = new DbContextOptionsBuilder<StudioDbContext>().UseStudioNpgsql(connection).Options;
        return new StudioDbContext(options);
    }
}
