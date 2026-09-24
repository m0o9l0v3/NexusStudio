namespace StudioApi.Data;

public static class StudioDatabaseConfiguration
{
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
