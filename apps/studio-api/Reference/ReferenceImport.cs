using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;

namespace StudioApi.Reference;

public sealed record ReferenceFile(
    List<ReferenceFileOccurrence>? Occurrences,
    List<ReferenceFileCategory>? Categories,
    List<ReferenceFileSpot>? Spots);

public sealed record ReferenceFileOccurrence(Guid Id, string Name, List<ReferenceFileDay>? Days);

public sealed record ReferenceFileDay(Guid Id, DateOnly Date, string? PublicStart, string? PublicEnd, string? Status, string? CancelNote);

public sealed record ReferenceFileCategory(Guid Id, string Name, int SortOrder, bool Selectable);

public sealed record ReferenceFileSpot(
    string CanonicalId,
    string Name,
    List<string>? Aliases,
    string? Building,
    string? Floor,
    bool IsPublished,
    string? Utilization);

public sealed record ReferenceImportResult(bool Succeeded, IReadOnlyList<string> Messages);

/// <summary>
/// 参照データ（開催回・開催日・カテゴリ・Spot）をJSONファイルから取り込む。運用者が明示的に実行するコマンド専用で、
/// 起動時には実行しない（Step 0-c）。IDで突き合わせて追加・更新だけを行い、ファイルに無い行は削除しない。
/// 1件でも不正なら何も書き込まない。
/// </summary>
public sealed class ReferenceImporter(StudioDbContext db)
{
    public async Task<ReferenceImportResult> ImportAsync(ReferenceFile file)
    {
        var errors = Validate(file);
        if (errors.Count > 0)
        {
            return new ReferenceImportResult(false, errors);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        var counts = new Dictionary<string, (int Added, int Updated)>();

        foreach (var source in file.Occurrences ?? [])
        {
            var occurrence = await db.Occurrences.FindAsync(source.Id);
            Count(counts, "開催回", occurrence is null);
            occurrence ??= db.Occurrences.Add(new Occurrence { Id = source.Id }).Entity;
            occurrence.Name = source.Name.Trim();

            foreach (var sourceDay in source.Days ?? [])
            {
                var day = await db.OcDays.FindAsync(sourceDay.Id);
                Count(counts, "開催日", day is null);
                day ??= db.OcDays.Add(new OcDay { Id = sourceDay.Id }).Entity;
                day.OccurrenceId = source.Id;
                day.Date = sourceDay.Date;
                day.PublicStart = ParseTime(sourceDay.PublicStart);
                day.PublicEnd = ParseTime(sourceDay.PublicEnd);
                day.Status = sourceDay.Status ?? OcDayStatus.Normal;
                day.CancelNote = sourceDay.CancelNote;
            }
        }

        foreach (var source in file.Categories ?? [])
        {
            var category = await db.Categories.FindAsync(source.Id);
            Count(counts, "カテゴリ", category is null);
            category ??= db.Categories.Add(new Category { Id = source.Id }).Entity;
            category.Name = source.Name.Trim();
            category.SortOrder = source.SortOrder;
            category.Selectable = source.Selectable;
        }

        foreach (var source in file.Spots ?? [])
        {
            // canonical ID はファイルの文字列をそのまま使う（前後の空白もIDの一部とみなして拒否済み）。
            var spot = await db.Spots.Include(s => s.NameAliases).SingleOrDefaultAsync(s => s.CanonicalId == source.CanonicalId);
            Count(counts, "Spot", spot is null);
            spot ??= db.Spots.Add(new Spot { CanonicalId = source.CanonicalId }).Entity;
            spot.Name = source.Name.Trim();
            spot.BuildingName = source.Building;
            spot.FloorName = source.Floor;
            spot.IsPublished = source.IsPublished;
            spot.Utilization = source.Utilization ?? SpotUtilization.Available;
            var aliases = (source.Aliases ?? []).Select(a => a.Trim()).Where(a => a.Length > 0).ToHashSet(StringComparer.Ordinal);
            spot.NameAliases.RemoveAll(a => !aliases.Contains(a.Alias));
            foreach (var alias in aliases.Where(a => spot.NameAliases.All(existing => existing.Alias != a)))
            {
                spot.NameAliases.Add(new SpotNameAlias { CanonicalId = source.CanonicalId, Alias = alias });
            }
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new ReferenceImportResult(true, counts.Select(c => $"{c.Key}: 追加 {c.Value.Added}件・更新 {c.Value.Updated}件").ToList());
    }

    private static List<string> Validate(ReferenceFile file)
    {
        var errors = new List<string>();
        foreach (var occurrence in file.Occurrences ?? [])
        {
            if (occurrence.Id == Guid.Empty || string.IsNullOrWhiteSpace(occurrence.Name))
            {
                errors.Add($"開催回のIDまたは名称がありません: {occurrence.Name}");
            }

            var dates = new HashSet<DateOnly>();
            foreach (var day in occurrence.Days ?? [])
            {
                var label = $"{occurrence.Name} {day.Date:yyyy-MM-dd}";
                if (day.Id == Guid.Empty)
                {
                    errors.Add($"開催日のIDがありません: {label}");
                }

                if (!dates.Add(day.Date))
                {
                    errors.Add($"同じ開催回に同じ日付が重複しています: {label}");
                }

                var start = ParseTime(day.PublicStart, out var startInvalid);
                var end = ParseTime(day.PublicEnd, out var endInvalid);
                if (startInvalid || endInvalid || (start is null) != (end is null) || (start is not null && start >= end))
                {
                    errors.Add($"一般公開時間が不正です（HH:mm、開始<終了、未登録なら両方省略）: {label}");
                }

                if (day.Status is not (null or OcDayStatus.Normal or OcDayStatus.Cancelled))
                {
                    errors.Add($"開催日の状態が不正です: {label}");
                }
            }
        }

        foreach (var category in file.Categories ?? [])
        {
            if (category.Id == Guid.Empty || string.IsNullOrWhiteSpace(category.Name))
            {
                errors.Add($"カテゴリのIDまたは名称がありません: {category.Name}");
            }
        }

        var canonicalIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var spot in file.Spots ?? [])
        {
            if (string.IsNullOrWhiteSpace(spot.CanonicalId) || spot.CanonicalId != spot.CanonicalId.Trim() || spot.CanonicalId.Length > 128)
            {
                errors.Add($"canonical ID が空、前後に空白がある、または長すぎます: \"{spot.CanonicalId}\"");
            }
            else if (!canonicalIds.Add(spot.CanonicalId))
            {
                errors.Add($"canonical ID が重複しています: {spot.CanonicalId}");
            }

            if (string.IsNullOrWhiteSpace(spot.Name))
            {
                errors.Add($"Spotの名称がありません: {spot.CanonicalId}");
            }

            if (spot.Utilization is not (null or SpotUtilization.Available or SpotUtilization.NoNewSelection or SpotUtilization.Withdrawn))
            {
                errors.Add($"Spotの利用状態が不正です: {spot.CanonicalId}");
            }
        }

        return errors;
    }

    private static TimeOnly? ParseTime(string? value) => ParseTime(value, out _);

    private static TimeOnly? ParseTime(string? value, out bool invalid)
    {
        invalid = false;
        if (value is null)
        {
            return null;
        }

        if (TimeOnly.TryParseExact(value, "HH:mm", out var time))
        {
            return time;
        }

        invalid = true;
        return null;
    }

    private static void Count(Dictionary<string, (int Added, int Updated)> counts, string kind, bool added)
    {
        var current = counts.GetValueOrDefault(kind);
        counts[kind] = added ? (current.Added + 1, current.Updated) : (current.Added, current.Updated + 1);
    }
}

public static class ReferenceCommand
{
    public const string Usage = """
        使い方: StudioApi reference import --file <JSONファイル>

          開催回・開催日・カテゴリ・Spotを取り込む。IDで突き合わせて追加・更新し、ファイルに無い行は削除しない。
          1件でも不正な行があれば何も書き込まない。
          開発用の設計用サンプル: docs/samples/reference-sample.json

        接続先は環境変数 ConnectionStrings__StudioDatabase で指定する。マイグレーションは適用しない。
        """;

    public static async Task<int> RunAsync(string[] args, ReferenceImporter importer, TextWriter output, TextWriter error)
    {
        if (args is not ["import", "--file", var path])
        {
            await error.WriteLineAsync(Usage);
            return 2;
        }

        ReferenceFile? file;
        try
        {
            await using var stream = File.OpenRead(path);
            file = await JsonSerializer.DeserializeAsync<ReferenceFile>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            await error.WriteLineAsync($"ファイルを読み取れません: {exception.Message}");
            return 1;
        }

        if (file is null)
        {
            await error.WriteLineAsync("ファイルが空です。");
            return 1;
        }

        var result = await importer.ImportAsync(file);
        foreach (var message in result.Messages)
        {
            await (result.Succeeded ? output : error).WriteLineAsync(message);
        }

        if (!result.Succeeded)
        {
            await error.WriteLineAsync("不正な行があるため、何も取り込んでいません。");
        }

        return result.Succeeded ? 0 : 1;
    }
}
