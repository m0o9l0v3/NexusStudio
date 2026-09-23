using Microsoft.AspNetCore.Identity;

namespace StudioApi.Models;

/// <summary>
/// Studioの管理者アカウント。1人1アカウントで、操作履歴に個人を残すための前提（15 v01 §3）。
/// 登録・無効化・パスワード再設定は運用者用の管理コマンドだけが行う。公開サインアップは持たない。
/// </summary>
public sealed class StudioAdmin : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    /// <summary>無効化した日時。null以外ならログインも既存セッションの継続もできない。</summary>
    public DateTimeOffset? DisabledAt { get; set; }
}
