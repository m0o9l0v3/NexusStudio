using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using StudioApi.Admin;
using StudioApi.Data;
using StudioApi.Models;

namespace StudioApi.Auth;

public static class AuthServiceCollectionExtensions
{
    public const string SessionCookieName = "nexus_studio_session";
    public const string CsrfCookieName = "nexus_studio_csrf";

    /// <summary>
    /// 個別管理者のCookie認証（15 v01 §3：同一オリジン＋HttpOnly Cookie＋CSRF対策）。
    /// 未認証のリクエストはすべて拒否し、ログイン等の必要なendpointだけを明示的に匿名許可する（12 UI-03、UA-01）。
    /// </summary>
    public static IServiceCollection AddStudioAuth(this IServiceCollection services, IWebHostEnvironment environment)
    {
        // 開発時はViteのプロキシ経由のhttpで動かすため、Secure属性はリクエストに合わせる。それ以外では常にSecure。
        var securePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;

        services.AddSingleton(TimeProvider.System);
        services.AddHttpContextAccessor();

        services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies();
        services.AddIdentityCore<StudioAdmin>(options =>
            {
                options.User.RequireUniqueEmail = true;
                // 文字種の組み合わせより長さを重視する（NIST SP 800-63B）。
                options.Password.RequiredLength = 12;
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddEntityFrameworkStores<StudioDbContext>()
            .AddSignInManager<StudioSignInManager>()
            .AddErrorDescriber<JapaneseIdentityErrorDescriber>();

        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = SessionCookieName;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = securePolicy;
            // セッション期限は暫定値。認証基盤の運用方針（12 §2）が決まったら見直す。
            options.ExpireTimeSpan = TimeSpan.FromHours(8);
            options.SlidingExpiration = true;
            // APIなのでログイン画面へのリダイレクトはせず、状態コードだけを返す。
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        // 無効化・パスワード再設定を、既存セッションへ1分以内に反映する。
        services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.FromMinutes(1));

        services.AddAntiforgery(options =>
        {
            options.HeaderName = CsrfValidationMiddleware.HeaderName;
            options.Cookie.Name = CsrfCookieName;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = securePolicy;
        });

        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        services.AddScoped<AdminAccountService>();
        return services;
    }
}
