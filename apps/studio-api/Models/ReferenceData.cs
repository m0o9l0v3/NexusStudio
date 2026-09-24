namespace StudioApi.Models;

// 開催回・開催日・カテゴリ・Spotの参照表（15 v01 §4.3）。
// Step 2 では読み取り専用で、取り込みコマンドだけが書き込む。編集・Revision・公開は Step 3 以降で追加する。

/// <summary>開催回（例：2026 オープンキャンパス）。</summary>
public sealed class Occurrence
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<OcDay> Days { get; set; } = [];
}

/// <summary>開催日。一般公開時間は1日1区間（07 §4.6）。未登録ならnullのまま保持し、推定しない。</summary>
public sealed class OcDay
{
    public Guid Id { get; set; }
    public Guid OccurrenceId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly? PublicStart { get; set; }
    public TimeOnly? PublicEnd { get; set; }
    public string Status { get; set; } = OcDayStatus.Normal;
    public string? CancelNote { get; set; }
}

public static class OcDayStatus
{
    public const string Normal = "normal";
    public const string Cancelled = "cancelled";
}

/// <summary>カテゴリ。Selectable=false は「新規選択停止」で、既存の参照は維持する（08 CAT-05）。</summary>
public sealed class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool Selectable { get; set; } = true;
}

/// <summary>
/// 会場として選べるSpot。canonical ID は大文字小文字を含めて厳密一致で保持し、生成・正規化・推測しない（CLAUDE.md）。
/// </summary>
public sealed class Spot
{
    public string CanonicalId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? BuildingName { get; set; }
    public string? FloorName { get; set; }
    public bool IsPublished { get; set; }
    public string Utilization { get; set; } = SpotUtilization.Available;
    public List<SpotNameAlias> NameAliases { get; set; } = [];
}

/// <summary>検索用の別名（表示名の言い換え）。IDの別名（spot_id_aliases）とは別物。</summary>
public sealed class SpotNameAlias
{
    public string CanonicalId { get; set; } = string.Empty;
    public string Alias { get; set; } = string.Empty;
}

public static class SpotUtilization
{
    public const string Available = "available";
    public const string NoNewSelection = "noNewSelection";
    public const string Withdrawn = "withdrawn";
}
