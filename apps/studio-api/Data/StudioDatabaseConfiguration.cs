using Npgsql;

namespace StudioApi.Data;

public static class StudioDatabaseConfiguration
{
    public static void RequireProductionRuntimeRole(string connectionString)
    {
        NpgsqlConnectionStringBuilder parsed;
        try { parsed = new NpgsqlConnectionStringBuilder(connectionString); }
        catch (ArgumentException) { throw new InvalidOperationException("Studio database connection string is invalid."); }
        if (parsed.Username != "nexus_studio_app" || string.IsNullOrWhiteSpace(parsed.Password))
            throw new InvalidOperationException("Production Studio API requires the dedicated nexus_studio_app login and a password.");
    }

    public static string Resolve(IConfiguration configuration)
    {
        var file = configuration["ConnectionStrings:StudioDatabaseFile"];
        if (!string.IsNullOrWhiteSpace(file))
        {
            var value = File.ReadAllText(file).TrimEnd('\r', '\n');
            if (string.IsNullOrWhiteSpace(value))
                throw new InvalidOperationException("Studio database secret file is empty.");
            return value;
        }

        var connection = configuration.GetConnectionString("StudioDatabase");
        if (string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException("ConnectionStrings:StudioDatabase or ConnectionStrings:StudioDatabaseFile is required.");
        return connection;
    }
}
