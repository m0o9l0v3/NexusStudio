using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using StudioApi.Models;

namespace StudioApi.Auth;

public sealed record LoginRequest(string? Email, string? Password);

public sealed record SessionResponse(Guid Id, string Email, string DisplayName, string? EnvironmentLabel);

public sealed record CsrfTokenResponse(string Token);

public static class AuthEndpoints
{
    /// <summary>
    /// 認証失敗の理由（未登録・パスワード違い・無効化・ロックアウト）を応答で区別しない。
    /// どの管理者アカウントが存在するかを外部に推測させないため（L02の文言も1種類）。
    /// </summary>
    public const string InvalidCredentialsCode = "invalid_credentials";

    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapGet("/csrf", (HttpContext context, IAntiforgery antiforgery) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            return TypedResults.Ok(new CsrfTokenResponse(tokens.RequestToken!));
        }).AllowAnonymous();

        group.MapPost("/login", LoginAsync).AllowAnonymous();

        // 期限切れのセッションからでもCookieを消せるよう匿名を許可する。
        group.MapPost("/logout", async (SignInManager<StudioAdmin> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return TypedResults.NoContent();
        }).AllowAnonymous();

        group.MapGet("/me", MeAsync);

        return group;
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        UserManager<StudioAdmin> userManager,
        SignInManager<StudioAdmin> signInManager,
        ILoggerFactory loggerFactory)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "メールアドレスとパスワードを入力してください。",
                extensions: new Dictionary<string, object?> { ["code"] = "missing_credentials" });
        }

        var logger = loggerFactory.CreateLogger("StudioApi.Auth");
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null)
        {
            // 未登録のメールアドレスでも、登録済みと同程度の処理時間をかける。
            userManager.PasswordHasher.HashPassword(new StudioAdmin(), request.Password);
            logger.LogInformation("Login rejected: unknown email");
            return InvalidCredentials();
        }

        var result = await signInManager.PasswordSignInAsync(user, request.Password, isPersistent: false, lockoutOnFailure: true);
        if (!result.Succeeded)
        {
            logger.LogInformation(
                "Login rejected for admin {AdminId}: lockedOut={LockedOut} notAllowed={NotAllowed}",
                user.Id, result.IsLockedOut, result.IsNotAllowed);
            return InvalidCredentials();
        }

        logger.LogInformation("Admin {AdminId} logged in", user.Id);
        return TypedResults.NoContent();
    }

    private static async Task<IResult> MeAsync(
        ClaimsPrincipal principal,
        UserManager<StudioAdmin> userManager,
        IConfiguration configuration)
    {
        var user = await userManager.GetUserAsync(principal);
        if (user is null || user.DisabledAt is not null)
        {
            return TypedResults.Unauthorized();
        }

        return TypedResults.Ok(new SessionResponse(
            user.Id,
            user.Email ?? string.Empty,
            user.DisplayName,
            configuration["Studio:EnvironmentLabel"]));
    }

    private static IResult InvalidCredentials() => TypedResults.Problem(
        statusCode: StatusCodes.Status401Unauthorized,
        title: "メールアドレスまたはパスワードが正しくありません。",
        extensions: new Dictionary<string, object?> { ["code"] = InvalidCredentialsCode });
}
