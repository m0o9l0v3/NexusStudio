using Microsoft.AspNetCore.Antiforgery;

namespace StudioApi.Auth;

/// <summary>
/// /api 配下の状態を変更するリクエストすべてに、antiforgeryトークン（X-XSRF-TOKENヘッダー）を要求する。
/// 認証CookieはSameSite=Strictだが、それだけに依存しない（15 v01 §3 の「HttpOnly Cookie＋CSRF対策」）。
/// ASP.NET Core標準のUseAntiforgery()はフォームを受け取るendpointだけを検証するため、JSON APIには別途適用する。
/// </summary>
public sealed class CsrfValidationMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-XSRF-TOKEN";
    public const string InvalidCsrfCode = "csrf_invalid";

    public async Task InvokeAsync(HttpContext context, IAntiforgery antiforgery)
    {
        if (context.Request.Path.StartsWithSegments("/api") && !IsSafeMethod(context.Request.Method))
        {
            try
            {
                await antiforgery.ValidateRequestAsync(context);
            }
            catch (AntiforgeryValidationException)
            {
                await Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "リクエストを確認できませんでした。画面を再読み込みしてください。",
                    extensions: new Dictionary<string, object?> { ["code"] = InvalidCsrfCode })
                    .ExecuteAsync(context);
                return;
            }
        }

        await next(context);
    }

    private static bool IsSafeMethod(string method)
        => HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method);
}
