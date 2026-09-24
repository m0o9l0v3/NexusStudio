using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;

namespace StudioApi.Reference;

public sealed record OcDayItem(Guid Id, DateOnly Date, string? PublicStart, string? PublicEnd, string Status);

public sealed record OccurrenceItem(Guid Id, string Name, IReadOnlyList<OcDayItem> Days);

public sealed record CategoryItem(Guid Id, string Name, int SortOrder, bool Selectable);

public sealed record SpotItem(
    string CanonicalId,
    string Name,
    IReadOnlyList<string> Aliases,
    string? BuildingName,
    string? FloorName,
    bool IsPublished,
    string Utilization);

/// <summary>イベント編集で選ぶ開催回・開催日・カテゴリ。</summary>
public sealed record ReferenceData(IReadOnlyList<OccurrenceItem> Occurrences, IReadOnlyList<CategoryItem> Categories);

public sealed record SpotSearchResult(int TotalCount, IReadOnlyList<SpotItem> Items, IReadOnlyList<string> Buildings, IReadOnlyList<string> Floors);

public static class ReferenceEndpoints
{
    public const int MaxSpotResults = 50;

    public static IEndpointRouteBuilder MapReferenceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/reference", GetReferenceAsync).WithTags("Reference");
        app.MapGet("/api/spots", SearchSpotsAsync).WithTags("Reference");
        app.MapGet("/api/spots/lookup", LookupSpotsAsync).WithTags("Reference");
        return app;
    }

    private static async Task<Ok<ReferenceData>> GetReferenceAsync(StudioDbContext db)
    {
        var occurrences = await db.Occurrences.AsNoTracking().Include(o => o.Days).OrderBy(o => o.Name).ToListAsync();
        var categories = await db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync();
        return TypedResults.Ok(new ReferenceData(
            occurrences
                .OrderBy(o => o.Days.Count == 0 ? DateOnly.MaxValue : o.Days.Min(d => d.Date))
                .Select(o => new OccurrenceItem(o.Id, o.Name, o.Days.OrderBy(d => d.Date).Select(ToItem).ToList()))
                .ToList(),
            categories.Select(c => new CategoryItem(c.Id, c.Name, c.SortOrder, c.Selectable)).ToList()));
    }

    /// <summary>
    /// 名称・別名・canonical IDの部分一致で検索する（07 §4.3）。検索では大文字小文字を区別しないが、
    /// 保存・参照するIDは返した文字列のまま扱う。
    /// </summary>
    private static async Task<Ok<SpotSearchResult>> SearchSpotsAsync(StudioDbContext db, string? q, string? building, string? floor)
    {
        var spots = await db.Spots.AsNoTracking().Include(s => s.NameAliases).ToListAsync();
        IEnumerable<Spot> matches = spots;
        if (!string.IsNullOrWhiteSpace(q))
        {
            var keyword = q.Trim();
            matches = matches.Where(s =>
                s.Name.Contains(keyword, StringComparison.CurrentCultureIgnoreCase)
                || s.CanonicalId.Contains(keyword, StringComparison.OrdinalIgnoreCase)
                || s.NameAliases.Any(a => a.Alias.Contains(keyword, StringComparison.CurrentCultureIgnoreCase)));
        }

        if (!string.IsNullOrEmpty(building))
        {
            matches = matches.Where(s => s.BuildingName == building);
        }

        if (!string.IsNullOrEmpty(floor))
        {
            matches = matches.Where(s => s.FloorName == floor);
        }

        var list = matches
            .Where(s => s.Utilization != SpotUtilization.Withdrawn)
            .OrderBy(s => s.Name, StringComparer.CurrentCulture)
            .ThenBy(s => s.BuildingName, StringComparer.CurrentCulture)
            .ThenBy(s => s.CanonicalId, StringComparer.Ordinal)
            .ToList();

        return TypedResults.Ok(new SpotSearchResult(
            list.Count,
            list.Take(MaxSpotResults).Select(ToItem).ToList(),
            spots.Select(s => s.BuildingName).OfType<string>().Distinct().Order(StringComparer.CurrentCulture).ToList(),
            spots.Select(s => s.FloorName).OfType<string>().Distinct().Order(StringComparer.CurrentCulture).ToList()));
    }

    /// <summary>
    /// 保存済みの会場を表示するため、canonical IDの厳密一致で引く。見つからないIDは結果に含めない
    /// （別のSpotで代替しない。09 SA-03）。
    /// </summary>
    private static async Task<Ok<List<SpotItem>>> LookupSpotsAsync(StudioDbContext db, string[]? id)
    {
        if (id is not { Length: > 0 })
        {
            return TypedResults.Ok(new List<SpotItem>());
        }

        var wanted = id.Distinct(StringComparer.Ordinal).Take(500).ToList();
        var spots = await db.Spots.AsNoTracking().Include(s => s.NameAliases).Where(s => wanted.Contains(s.CanonicalId)).ToListAsync();
        // DBの照合順序に関わらず、序数比較で一致したものだけを返す。
        return TypedResults.Ok(spots.Where(s => wanted.Contains(s.CanonicalId, StringComparer.Ordinal)).Select(ToItem).ToList());
    }

    private static OcDayItem ToItem(OcDay day) => new(
        day.Id, day.Date, day.PublicStart?.ToString("HH:mm"), day.PublicEnd?.ToString("HH:mm"), day.Status);

    internal static SpotItem ToItem(Spot spot) => new(
        spot.CanonicalId,
        spot.Name,
        spot.NameAliases.Select(a => a.Alias).Order(StringComparer.CurrentCulture).ToList(),
        spot.BuildingName,
        spot.FloorName,
        spot.IsPublished,
        spot.Utilization);
}
