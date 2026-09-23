using Microsoft.AspNetCore.Identity;

namespace StudioApi.Auth;

/// <summary>管理コマンドで運用者に表示するIdentityのエラーを日本語にする。</summary>
public sealed class JapaneseIdentityErrorDescriber : IdentityErrorDescriber
{
    public override IdentityError PasswordTooShort(int length)
        => new() { Code = nameof(PasswordTooShort), Description = $"パスワードは{length}文字以上にしてください。" };

    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars)
        => new() { Code = nameof(PasswordRequiresUniqueChars), Description = $"パスワードには{uniqueChars}種類以上の文字を含めてください。" };

    public override IdentityError InvalidEmail(string? email)
        => new() { Code = nameof(InvalidEmail), Description = $"メールアドレスの形式が正しくありません: {email}" };

    public override IdentityError DuplicateEmail(string email)
        => new() { Code = nameof(DuplicateEmail), Description = $"{email} は既に登録されています。" };

    public override IdentityError DuplicateUserName(string userName)
        => new() { Code = nameof(DuplicateUserName), Description = $"{userName} は既に登録されています。" };

    public override IdentityError ConcurrencyFailure()
        => new() { Code = nameof(ConcurrencyFailure), Description = "他の操作と競合しました。もう一度実行してください。" };
}
