using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using StudioApi.Models;

namespace StudioApi.Auth;

/// <summary>
/// 無効化された管理者を、新規ログインとセッション継続（security stamp再検証）の両方で拒否する。
/// </summary>
public sealed class StudioSignInManager(
    UserManager<StudioAdmin> userManager,
    IHttpContextAccessor contextAccessor,
    IUserClaimsPrincipalFactory<StudioAdmin> claimsFactory,
    IOptions<IdentityOptions> optionsAccessor,
    ILogger<SignInManager<StudioAdmin>> logger,
    IAuthenticationSchemeProvider schemes,
    IUserConfirmation<StudioAdmin> confirmation)
    : SignInManager<StudioAdmin>(userManager, contextAccessor, claimsFactory, optionsAccessor, logger, schemes, confirmation)
{
    public override async Task<bool> CanSignInAsync(StudioAdmin user)
        => user.DisabledAt is null && await base.CanSignInAsync(user);

    public override async Task<bool> ValidateSecurityStampAsync(StudioAdmin? user, string? securityStamp)
        => user is { DisabledAt: null } && await base.ValidateSecurityStampAsync(user, securityStamp);
}
