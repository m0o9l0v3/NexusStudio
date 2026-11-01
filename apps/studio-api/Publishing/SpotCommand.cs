using Microsoft.AspNetCore.Identity;
using StudioApi.Models;

namespace StudioApi.Publishing;

/// <summary>
/// 運用者用の Spot の管理コマンド。`dotnet StudioApi.dll spot &lt;command&gt;` で実行する。
/// 改名は Studio の画面・通常フォームには置かず、レビュー済みのこのコマンドで行う（nexus-mobile E2-5 O-3c R2、決定事項32）。
/// </summary>
public static class SpotCommand
{
    public const string Usage = """
        使い方: StudioApi spot rename --from <旧 ID> --to <新しい ID> --map-version <地図の版> --admin <メールアドレス> [--message <メモ>] [--apply]

          公開中の Spot の canonical ID を改名する。--map-version には、目的地の ID を新しい ID に替えた地図を
          map import で取り込んだ版を指定する。地図の公開・新しい Spot の公開・旧 Spot の取り下げ・イベントの会場の付け替え・
          予約表への廃止と旧 ID（alias）の追記・参加者向け bundle の作り直しを、1つの Release で行う。
          --apply を付けない実行は確認だけで、何も変えない。最初に使う前に隔離環境で試験する。
          --admin は Release と操作ログに残す管理者（有効な管理者のメールアドレス）。

        接続先は環境変数 ConnectionStrings__StudioDatabase で指定する。マイグレーションは適用しない。
        """;

    private static readonly HashSet<string> ValueOptions = new(StringComparer.Ordinal) { "--from", "--to", "--map-version", "--admin", "--message" };

    public static async Task<int> RunAsync(string[] args, PublishingService publishing, UserManager<StudioAdmin> admins, TextWriter output, TextWriter error)
    {
        if (args.Length == 0 || args[0] != "rename")
        {
            await error.WriteLineAsync(Usage);
            return 2;
        }

        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        var apply = false;
        for (var i = 1; i < args.Length; i++)
        {
            if (args[i] == "--apply" && !apply)
            {
                apply = true;
            }
            else if (ValueOptions.Contains(args[i]) && i + 1 < args.Length && options.TryAdd(args[i], args[i + 1]))
            {
                i++;
            }
            else
            {
                await error.WriteLineAsync(Usage);
                return 2;
            }
        }

        if (!options.TryGetValue("--from", out var from) || !options.TryGetValue("--to", out var to)
            || !options.TryGetValue("--admin", out var email)
            || !long.TryParse(options.GetValueOrDefault("--map-version"), out var mapVersion) || mapVersion <= 0)
        {
            await error.WriteLineAsync(Usage);
            return 2;
        }

        var admin = await admins.FindByEmailAsync(email.Trim());
        if (admin is null || admin.DisabledAt is not null)
        {
            await error.WriteLineAsync($"有効な管理者 {email} が見つかりません。");
            return 1;
        }

        var result = await publishing.RenameSpotAsync(from, to, mapVersion, admin.Id, options.GetValueOrDefault("--message"), apply);
        foreach (var line in result.Messages)
        {
            await (result.Succeeded ? output : error).WriteLineAsync(line);
        }

        return result.Succeeded ? 0 : 1;
    }
}
