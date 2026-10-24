using System.Text.Json;
using Xunit;

namespace StudioApi.Tests;

/// <summary>
/// 最初の公開より前に、取り込みデータから資料上の旧部屋 ID を無くす（nexus-mobile E2-5 O-3a 条件1）。
/// 旧 ID のまま一度でも公開すると「公開した ID」になり、alias として予約し続ける必要が生じるため、
/// 対応表（決定事項26 = nexus-mobile E1-7）の旧 ID が設計用サンプルに戻ってこないことを確かめる。
/// </summary>
public sealed class LegacyRoomIdTests
{
    private static string FixturePath(string name) => Path.Combine(AppContext.BaseDirectory, "Fixtures", name);

    private static HashSet<string> LegacyIds()
    {
        var lines = File.ReadAllLines(FixturePath("room-canonical-ids.csv"));
        Assert.StartsWith("old_canonical_id,new_canonical_id,", lines[0]);
        var ids = lines.Skip(1)
            .Where(line => line.Length > 0)
            .Select(line => line.Split(',')[0])
            .ToHashSet(StringComparer.Ordinal);
        // 部屋の対応表のほかに、資料上の旧ランドマーク ID も参加者向けに登録しない（E1-4 改訂1 §4.2）。
        ids.Add("lm_koku_shrine");
        return ids;
    }

    [Fact]
    public void ReferenceSample_HasNoLegacyCanonicalIds()
    {
        var legacy = LegacyIds();
        Assert.Equal(75, legacy.Count);

        using var sample = JsonDocument.Parse(File.ReadAllText(FixturePath("reference-sample.json")));
        var spotIds = sample.RootElement.GetProperty("spots").EnumerateArray()
            .Select(spot => spot.GetProperty("canonicalId").GetString()!)
            .ToArray();

        Assert.NotEmpty(spotIds);
        Assert.Empty(spotIds.Where(legacy.Contains));
    }
}
