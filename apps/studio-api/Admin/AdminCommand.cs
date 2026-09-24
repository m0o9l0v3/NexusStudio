using System.Text;

namespace StudioApi.Admin;

/// <summary>
/// 運用者用の管理者アカウント操作コマンド。`dotnet StudioApi.dll admin &lt;command&gt;` で実行する。
/// パスワードはコマンド引数で受け取らない（シェル履歴やプロセス一覧に残るため）。
/// 端末からは入力を表示せずに2回尋ね、標準入力がリダイレクトされている場合は1行目を読む。
/// </summary>
public static class AdminCommand
{
    public const string Usage = """
        使い方: StudioApi admin <command> [options]

          add --email <メールアドレス> --name <表示名>   管理者を登録する（パスワードは入力を求める）
          disable --email <メールアドレス>              管理者を無効化し、既存のログインも失効させる
          enable --email <メールアドレス>               無効化・ロックアウトを解除する
          reset-password --email <メールアドレス>       パスワードを再設定する（入力を求める）
          list                                          登録済みの管理者を一覧する

        接続先は環境変数 ConnectionStrings__StudioDatabase で指定する。マイグレーションは適用しない。
        """;

    public static async Task<int> RunAsync(string[] args, AdminAccountService service, TextReader input, TextWriter output, TextWriter error, bool interactive)
    {
        if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
        {
            await output.WriteLineAsync(Usage);
            return args.Length == 0 ? 2 : 0;
        }

        var options = ParseOptions(args.Skip(1).ToArray(), out var parseError);
        if (parseError is not null)
        {
            await error.WriteLineAsync(parseError);
            return 2;
        }

        AdminAccountResult result;
        switch (args[0])
        {
            case "add":
                if (!Require(options, error, "email", "name"))
                {
                    return 2;
                }

                var password = await ReadNewPasswordAsync(input, output, error, interactive);
                if (password is null)
                {
                    return 1;
                }

                result = await service.AddAsync(options["email"], options["name"], password);
                break;
            case "disable":
                if (!Require(options, error, "email"))
                {
                    return 2;
                }

                result = await service.DisableAsync(options["email"]);
                break;
            case "enable":
                if (!Require(options, error, "email"))
                {
                    return 2;
                }

                result = await service.EnableAsync(options["email"]);
                break;
            case "reset-password":
                if (!Require(options, error, "email"))
                {
                    return 2;
                }

                var newPassword = await ReadNewPasswordAsync(input, output, error, interactive);
                if (newPassword is null)
                {
                    return 1;
                }

                result = await service.ResetPasswordAsync(options["email"], newPassword);
                break;
            case "list":
                foreach (var admin in await service.ListAsync())
                {
                    var status = admin.DisabledAt is not null ? "無効"
                        : admin.LockoutEnd > DateTimeOffset.UtcNow ? "ロック中"
                        : "有効";
                    await output.WriteLineAsync($"{admin.Email}\t{admin.DisplayName}\t{status}\t登録 {admin.CreatedAt:yyyy-MM-dd HH:mm}Z");
                }

                return 0;
            default:
                await error.WriteLineAsync($"不明なコマンドです: {args[0]}");
                await error.WriteLineAsync(Usage);
                return 2;
        }

        await (result.Succeeded ? output : error).WriteLineAsync(result.Message);
        return result.Succeeded ? 0 : 1;
    }

    private static Dictionary<string, string> ParseOptions(string[] args, out string? error)
    {
        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        error = null;
        for (var i = 0; i < args.Length; i++)
        {
            if (!args[i].StartsWith("--", StringComparison.Ordinal) || i + 1 >= args.Length)
            {
                error = $"引数を解釈できません: {args[i]}";
                return options;
            }

            var name = args[i][2..];
            if (name == "password")
            {
                error = "パスワードはコマンド引数で指定できません。実行後の入力で指定してください。";
                return options;
            }

            options[name] = args[++i];
        }

        return options;
    }

    private static bool Require(Dictionary<string, string> options, TextWriter error, params string[] names)
    {
        var missing = names.Where(n => !options.ContainsKey(n)).ToArray();
        if (missing.Length == 0)
        {
            return true;
        }

        error.WriteLine($"必須の指定がありません: {string.Join(", ", missing.Select(n => "--" + n))}");
        return false;
    }

    private static async Task<string?> ReadNewPasswordAsync(TextReader input, TextWriter output, TextWriter error, bool interactive)
    {
        if (!interactive)
        {
            var line = await input.ReadLineAsync();
            if (string.IsNullOrEmpty(line))
            {
                await error.WriteLineAsync("標準入力からパスワードを読み取れませんでした。");
                return null;
            }

            return line;
        }

        var first = ReadHidden(output, "パスワード: ");
        var second = ReadHidden(output, "パスワード（確認）: ");
        if (first != second)
        {
            await error.WriteLineAsync("確認用のパスワードが一致しません。");
            return null;
        }

        return first;
    }

    private static string ReadHidden(TextWriter output, string prompt)
    {
        output.Write(prompt);
        var buffer = new StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter)
            {
                output.WriteLine();
                return buffer.ToString();
            }

            if (key.Key == ConsoleKey.Backspace)
            {
                if (buffer.Length > 0)
                {
                    buffer.Length--;
                }
            }
            else if (!char.IsControl(key.KeyChar))
            {
                buffer.Append(key.KeyChar);
            }
        }
    }
}
