using Microsoft.AspNetCore.DataProtection;
using StudioApi.Data;

namespace StudioApi.Auth;

/// <summary>
/// 認証Cookie・CSRFトークンを保護する鍵の置き場所（NexusInfra #8、2026-11-01 利用者判断）。
/// 本番のWebサーバーは専用の私有ディレクトリ（volume）に鍵を保存し、再起動でログインとCSRFが切れないようにする。
/// 鍵を失っても再ログインが必要になるだけで、データには影響しない。
/// </summary>
public static class DataProtectionConfiguration
{
    public const string ApplicationName = "NexusStudio";

    public static void ConfigureForInvocation(
        IServiceCollection services,
        bool isDevelopment,
        IReadOnlyList<string> args,
        string? keysDirectoryValue)
    {
        if (isDevelopment || !TrustedProxyConfiguration.StartsWebServer(args))
            return;

        services.AddDataProtection()
            .SetApplicationName(ApplicationName)
            .PersistKeysToFileSystem(RequirePrivateDirectory(keysDirectoryValue));
    }

    public static DirectoryInfo RequirePrivateDirectory(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !Path.IsPathFullyQualified(value))
            throw new InvalidOperationException("DataProtection:KeysDirectory must be an absolute path to a private directory.");

        var directory = new DirectoryInfo(value);
        if (!directory.Exists)
            throw new InvalidOperationException("DataProtection:KeysDirectory does not exist.");

        // 鍵は平文のXMLで保存されるため、グループ・他者が読み書きできる場所を拒否する。
        const UnixFileMode othersOrGroup = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute
            | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute;
        if (!OperatingSystem.IsWindows() && (directory.UnixFileMode & othersOrGroup) != 0)
            throw new InvalidOperationException("DataProtection:KeysDirectory must not be accessible by group or others (use mode 0700).");

        return directory;
    }
}
