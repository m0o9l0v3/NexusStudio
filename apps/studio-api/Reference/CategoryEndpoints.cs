using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Models;

namespace StudioApi.Reference;

public sealed record CategoryDraft(Guid Id, string? Name, bool Selectable);

public sealed record CategoryListItem(Guid Id, string Name, bool Selectable, int ReferenceCount);

/// <param name="Items">配列の順序がカテゴリの表示順。</param>
public sealed record CategoryListDetail(long RowVersion, DateTimeOffset? UpdatedAt, EditorRef? UpdatedBy, string Publication, IReadOnlyList<CategoryListItem> Items);

public sealed record SaveCategoriesRequest(Guid OperationId, long RowVersion, IReadOnlyList<CategoryDraft>? Items);

/// <summary>
/// カテゴリ一覧（08 CAT-01〜CAT-05）。一覧全体が1つの編集・公開単位。
/// 既存のカテゴリは削除せず、「新規選択停止」で新しい割り当てだけを止める（既存の参照は維持）。
/// </summary>
public static class CategoryEndpoints
{
    public const int MaxCategories = 200;

    public static IEndpointRouteBuilder MapCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/categories").WithTags("Categories");
        group.MapGet("/", GetAsync);
        group.MapPut("/", SaveAsync);
        return app;
    }

    private static async Task<Ok<CategoryListDetail>> GetAsync(StudioDbContext db) => TypedResults.Ok(await LoadAsync(db));

    private static async Task<Results<Ok<CategoryListDetail>, BadRequest<ReferenceValidationProblem>, Conflict<ReferenceConflict<CategoryListDetail>>>> SaveAsync(
        SaveCategoriesRequest request, StudioDbContext db, ClaimsPrincipal principal, UserManager<StudioAdmin> userManager, TimeProvider timeProvider)
    {
        if (request.OperationId == Guid.Empty)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.InvalidOperationId());
        }

        if (await ReferenceSaving.FindReplayAsync(db, request.OperationId) is { } replay)
        {
            return replay.Kind == ReferenceRevisionKind.Categories
                ? TypedResults.Ok(await LoadAsync(db))
                : TypedResults.BadRequest(ReferenceValidationProblem.InvalidOperationId());
        }

        var state = await db.CategoryListStates.SingleAsync();
        if (state.RowVersion != request.RowVersion)
        {
            return TypedResults.Conflict(new ReferenceConflict<CategoryListDetail>("conflict", "他の管理者がカテゴリ一覧を先に保存しました。", await LoadAsync(db)));
        }

        var categories = await db.Categories.ToListAsync();
        var problems = Validate(request.Items, categories);
        if (problems.Count > 0)
        {
            return TypedResults.BadRequest(ReferenceValidationProblem.Invalid(problems));
        }

        for (var i = 0; i < request.Items!.Count; i++)
        {
            var draft = request.Items[i];
            var category = categories.SingleOrDefault(c => c.Id == draft.Id);
            if (category is null)
            {
                category = new Category { Id = draft.Id };
                db.Categories.Add(category);
            }

            category.Name = draft.Name?.Trim() ?? string.Empty;
            category.Selectable = draft.Selectable;
            category.SortOrder = i + 1;
        }

        var adminId = ReferenceSaving.CurrentAdminId(principal, userManager);
        var now = timeProvider.GetUtcNow();
        ReferenceSaving.Touch(state, adminId, now);
        db.ReferenceRevisions.Add(ReferenceSaving.NewRevision(
            ReferenceRevisionKind.Categories, ReferenceRevisionKind.Categories,
            request.Items.Select(i => i with { Name = i.Name?.Trim() ?? string.Empty }).ToList(),
            adminId, now, ReferenceRevisionSource.Editor, request.OperationId));

        return await ReferenceSaving.TrySaveAsync(db, request.OperationId) == SaveOutcome.Conflict
            ? TypedResults.Conflict(new ReferenceConflict<CategoryListDetail>("conflict", "他の管理者がカテゴリ一覧を先に保存しました。", await LoadAsync(db)))
            : TypedResults.Ok(await LoadAsync(db));
    }

    private static List<DraftProblem> Validate(IReadOnlyList<CategoryDraft>? items, List<Category> existing)
    {
        var problems = new List<DraftProblem>();
        if (items is null)
        {
            problems.Add(new("items", "required", "カテゴリの一覧がありません。"));
            return problems;
        }

        if (items.Count > MaxCategories)
        {
            problems.Add(new("items", "too_many", $"カテゴリは{MaxCategories}件以内にしてください。"));
        }

        var ids = new HashSet<Guid>();
        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            if (item is null || item.Id == Guid.Empty || !ids.Add(item.Id))
            {
                problems.Add(new($"items[{i}].id", "invalid_category_id", "カテゴリのIDが空か重複しています。"));
                continue;
            }

            if (item.Name is { Length: > 100 })
            {
                problems.Add(new($"items[{i}].name", "too_long", "カテゴリ名は100文字以内にしてください。"));
            }
        }

        foreach (var category in existing.Where(c => !ids.Contains(c.Id)))
        {
            problems.Add(new("items", "category_removed", $"「{category.Name}」は削除できません。使わなくなったカテゴリは「新規選択停止」にしてください。"));
        }

        return problems;
    }

    private static async Task<CategoryListDetail> LoadAsync(StudioDbContext db)
    {
        var state = await db.CategoryListStates.AsNoTracking().SingleAsync();
        var categories = await db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync();
        var references = await EventReferenceIndex.LoadAsync(db);
        var names = await ReferenceSaving.DisplayNamesAsync(db, [state.UpdatedBy]);
        return new CategoryListDetail(
            state.RowVersion,
            state.UpdatedAt,
            ReferenceSaving.Editor(state.UpdatedBy, names),
            PublicationState.Unpublished,
            categories.Select(c => new CategoryListItem(c.Id, c.Name, c.Selectable, references.EventsInCategory(c.Id))).ToList());
    }
}
