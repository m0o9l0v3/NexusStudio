namespace StudioApi.Models;

/// <summary>
/// ID 予約表の1行（nexus-mobile E2-5 §5.5、O-3b S2）。一度でも公開された canonical ID と alias を記録する追記専用の表。
/// 行の変更・削除はしない。状態の変化は行の追記で表し、同じ（ID・種別）または同じ alias では最新の行を有効とする。
/// draft の ID は登録しない（検証時に現在の draft と照合する）。
/// </summary>
public sealed class IdReservation
{
    /// <summary>追記の順序。「最新の行」はこの値が最大の行。</summary>
    public long Sequence { get; set; }
    /// <summary>canonical ID、または旧 ID（alias）。大文字小文字を区別する完全一致で保持し、正規化しない。</summary>
    public string Id { get; set; } = string.Empty;
    public string EntityKind { get; set; } = string.Empty;
    public string State { get; set; } = IdReservationState.Active;
    /// <summary>alias の解決先の canonical ID（state = alias のときだけ）。</summary>
    public string? CanonicalId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    /// <summary>登録の根拠：release（公開）／rename（改名の管理コマンド）／import（取り込み元。O-3a 条件2）。</summary>
    public string Source { get; set; } = IdReservationSource.Release;
    /// <summary>公開・改名の Release。取り込みではnull。</summary>
    public Guid? ReleaseId { get; set; }
    /// <summary>取り込み元などの補足。</summary>
    public string? Note { get; set; }
}

public static class IdReservationState
{
    public const string Active = "active";
    public const string Retired = "retired";
    public const string Alias = "alias";
}

public static class IdReservationSource
{
    public const string Release = "release";
    public const string Rename = "rename";
    public const string Import = "import";
}

/// <summary>予約表に記録する ID の種別（E2-5 §5.5 の entity_kind）。</summary>
public static class IdEntityKind
{
    public const string Spot = "spot";
    public const string Building = "building";
    public const string Floor = "floor";
    public const string IndoorNode = "indoor_node";
    public const string OutdoorNode = "outdoor_node";
    public const string WalkingPath = "walking_path";
    public const string FormalEntrance = "formal_entrance";
    public const string Room = "room";
    public const string Landmark = "landmark";

    public static readonly string[] All = [Spot, Building, Floor, IndoorNode, OutdoorNode, WalkingPath, FormalEntrance, Room, Landmark];

    /// <summary>spot と同じ ID を持てる地図の種別（目的地Feature。E2-5 §5.4）。spot はこれらの Feature を同じ ID で参照する。</summary>
    public static readonly IReadOnlySet<string> Destinations = new HashSet<string>(StringComparer.Ordinal) { Building, FormalEntrance, Room, Landmark };

    /// <summary>同じ ID を2つの種別で登録してよいか（spot とその目的地Featureだけ）。</summary>
    public static bool CanShareId(string a, string b)
        => a == b || (a == Spot && Destinations.Contains(b)) || (b == Spot && Destinations.Contains(a));
}
