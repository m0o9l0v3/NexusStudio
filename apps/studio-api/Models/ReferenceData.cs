namespace StudioApi.Models;

// 開催回・開催日・カテゴリ・Spot（15 v01 §4.3）。
// 各行は「現在の下書き」で、RowVersion による楽観的排他制御の対象。保存のたびに不変の ReferenceRevision を残す。
// 公開（Release）は Step 4 で追加する。

/// <summary>編集できる参照データの共通項目。</summary>
public interface IEditableReference
{
    long RowVersion { get; set; }
    DateTimeOffset? UpdatedAt { get; set; }
    /// <summary>最後に画面から保存した管理者。取り込みコマンドで更新した場合はnull。</summary>
    Guid? UpdatedBy { get; set; }
}

/// <summary>開催回（例：2026 オープンキャンパス）。開催日を含めて1つの編集・公開単位（08 OC-12）。</summary>
public sealed class Occurrence : IEditableReference
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>任意の出典情報（08 OC-03）。</summary>
    public string? SourceNote { get; set; }
    public List<OcDay> Days { get; set; } = [];
    public long RowVersion { get; set; } = 1;
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}

/// <summary>
/// 開催日。一般公開時間は1日1区間（07 §4.6）。未登録ならnullのまま保持し、推定しない。
/// 下書きでは片方だけの入力や前後の逆転も保存でき、公開前の確認で止める（08 OV-01）。
/// </summary>
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

/// <summary>
/// カテゴリ。Selectable=false は「新規選択停止」で、既存の参照は維持する（08 CAT-05）。
/// カテゴリ一覧全体が1つの編集・公開単位で、排他制御は <see cref="CategoryListState"/> の RowVersion で行う。
/// </summary>
public sealed class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool Selectable { get; set; } = true;
}

/// <summary>カテゴリ一覧の編集状態（1行だけ）。</summary>
public sealed class CategoryListState : IEditableReference
{
    public const int SingletonId = 1;
    public int Id { get; set; } = SingletonId;
    public long RowVersion { get; set; } = 1;
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}

/// <summary>
/// 会場として選べるSpot。canonical ID は大文字小文字を含めて厳密一致で保持し、生成・正規化・推測しない（CLAUDE.md）。
/// Step 3 では名称・別名・建物・階・利用状態を編集する。位置・出典・経路は Map Data と合わせて扱う。
/// </summary>
public sealed class Spot : IEditableReference
{
    public string CanonicalId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? BuildingName { get; set; }
    public string? FloorName { get; set; }
    public bool IsPublished { get; set; }
    public string Utilization { get; set; } = SpotUtilization.Available;
    public List<SpotNameAlias> NameAliases { get; set; } = [];
    public long RowVersion { get; set; } = 1;
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
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

/// <summary>参照データの保存1回ごとの不変スナップショット（開催回・カテゴリ一覧・Spot）。</summary>
public sealed class ReferenceRevision
{
    public Guid RevisionId { get; set; }
    public string Kind { get; set; } = string.Empty;
    /// <summary>開催回ID・canonical ID。カテゴリ一覧は "categories"。</summary>
    public string TargetId { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    /// <summary>画面から保存した管理者。取り込みコマンドではnull。</summary>
    public Guid? CreatedBy { get; set; }
    public string Source { get; set; } = ReferenceRevisionSource.Editor;
    /// <summary>画面からの保存操作のID。再送で重複したRevisionを作らない。取り込みではnull。</summary>
    public Guid? OperationId { get; set; }
}

public static class ReferenceRevisionKind
{
    public const string Occurrence = "occurrence";
    public const string Categories = "categories";
    public const string Spot = "spot";
}

public static class ReferenceRevisionSource
{
    public const string Editor = "editor";
    public const string Import = "import";
}
