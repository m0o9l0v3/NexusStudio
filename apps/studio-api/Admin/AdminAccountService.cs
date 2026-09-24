using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using StudioApi.Models;

namespace StudioApi.Admin;

public sealed record AdminAccountResult(bool Succeeded, string Message)
{
    public static AdminAccountResult Ok(string message) => new(true, message);
    public static AdminAccountResult Fail(string message) => new(false, message);
}

public sealed record AdminSummary(string Email, string DisplayName, DateTimeOffset CreatedAt, DateTimeOffset? DisabledAt, DateTimeOffset? LockoutEnd);

/// <summary>
/// 運用者だけが実行する管理者アカウント操作（15 v02 Step 1-c）。HTTPには公開しない。
/// 無効化・パスワード再設定では security stamp を更新し、既存のログインセッションを失効させる。
/// </summary>
public sealed class AdminAccountService(UserManager<StudioAdmin> userManager, TimeProvider timeProvider)
{
    public async Task<AdminAccountResult> AddAsync(string email, string displayName, string password)
    {
        email = email.Trim();
        displayName = displayName.Trim();
        if (displayName.Length == 0)
        {
            return AdminAccountResult.Fail("表示名を指定してください。");
        }

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return AdminAccountResult.Fail($"{email} は既に登録されています。");
        }

        var admin = new StudioAdmin
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            DisplayName = displayName,
            CreatedAt = timeProvider.GetUtcNow(),
        };
        var result = await userManager.CreateAsync(admin, password);
        return result.Succeeded
            ? AdminAccountResult.Ok($"{email} を登録しました。")
            : AdminAccountResult.Fail(Describe(result));
    }

    public async Task<AdminAccountResult> DisableAsync(string email)
    {
        var admin = await userManager.FindByEmailAsync(email.Trim());
        if (admin is null)
        {
            return NotFound(email);
        }

        if (admin.DisabledAt is not null)
        {
            return AdminAccountResult.Ok($"{admin.Email} は既に無効化されています。");
        }

        admin.DisabledAt = timeProvider.GetUtcNow();
        var result = await userManager.UpdateAsync(admin);
        if (result.Succeeded)
        {
            result = await userManager.UpdateSecurityStampAsync(admin);
        }

        return result.Succeeded
            ? AdminAccountResult.Ok($"{admin.Email} を無効化しました。既存のログインセッションも失効します。")
            : AdminAccountResult.Fail(Describe(result));
    }

    public async Task<AdminAccountResult> EnableAsync(string email)
    {
        var admin = await userManager.FindByEmailAsync(email.Trim());
        if (admin is null)
        {
            return NotFound(email);
        }

        admin.DisabledAt = null;
        var result = await userManager.UpdateAsync(admin);
        if (result.Succeeded)
        {
            result = await ClearLockoutAsync(admin);
        }

        return result.Succeeded
            ? AdminAccountResult.Ok($"{admin.Email} を有効化しました。")
            : AdminAccountResult.Fail(Describe(result));
    }

    public async Task<AdminAccountResult> ResetPasswordAsync(string email, string newPassword)
    {
        var admin = await userManager.FindByEmailAsync(email.Trim());
        if (admin is null)
        {
            return NotFound(email);
        }

        // 新しいパスワードが方針を満たさない場合に、古いパスワードを消した状態で終わらせない。
        foreach (var validator in userManager.PasswordValidators)
        {
            var validation = await validator.ValidateAsync(userManager, admin, newPassword);
            if (!validation.Succeeded)
            {
                return AdminAccountResult.Fail(Describe(validation));
            }
        }

        var result = await userManager.RemovePasswordAsync(admin);
        if (result.Succeeded)
        {
            // AddPasswordAsync は security stamp も更新するため、既存セッションは失効する。
            result = await userManager.AddPasswordAsync(admin, newPassword);
        }

        if (result.Succeeded)
        {
            result = await ClearLockoutAsync(admin);
        }

        return result.Succeeded
            ? AdminAccountResult.Ok($"{admin.Email} のパスワードを再設定しました。既存のログインセッションは失効します。")
            : AdminAccountResult.Fail(Describe(result));
    }

    public async Task<IReadOnlyList<AdminSummary>> ListAsync()
        => await userManager.Users
            .OrderBy(a => a.Email)
            .Select(a => new AdminSummary(a.Email ?? string.Empty, a.DisplayName, a.CreatedAt, a.DisabledAt, a.LockoutEnd))
            .ToListAsync();

    private async Task<IdentityResult> ClearLockoutAsync(StudioAdmin admin)
    {
        var result = await userManager.SetLockoutEndDateAsync(admin, null);
        return result.Succeeded ? await userManager.ResetAccessFailedCountAsync(admin) : result;
    }

    private static AdminAccountResult NotFound(string email)
        => AdminAccountResult.Fail($"{email.Trim()} は登録されていません。");

    private static string Describe(IdentityResult result)
        => string.Join(" ", result.Errors.Select(e => e.Description));
}
