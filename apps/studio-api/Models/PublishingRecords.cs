namespace StudioApi.Models;

// 公開・取り下げ・操作の記録（15 v01 §4.1・§5.3、11、12 §6）。
// Release と ReleaseEntry は不変。Publication は対象ごとの「現在の公開版」を指す可変の行で、公開処理と同じトランザクションで書き換える。

/// <summary>公開操作1回の結果。成功した公開だけが行になる（失敗した公開は OperationLog にだけ残る）。</summary>
public sealed class Release
{
    public Guid ReleaseId { get; set; }
    /// <summary>画面に出す通し番号（Release #12）。</summary>
    public long Sequence { get; set; }
    /// <summary>画面からの公開操作のID。取り込みで作った Release ではnull。</summary>
    public Guid? OperationId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    /// <summary>取り込みコマンドではnull。</summary>
    public Guid? CreatedBy { get; set; }
    public string Source { get; set; } = ReleaseSource.Studio;
    public string? Message { get; set; }
    /// <summary>公開前に管理者が確認した検証結果。</summary>
    public Guid? ValidationRunId { get; set; }
    public List<ReleaseEntry> Entries { get; set; } = [];
}

public static class ReleaseSource
{
    public const string Studio = "studio";
    public const string Import = "import";
}

/// <summary>Release に含まれる対象1件。</summary>
public sealed class ReleaseEntry
{
    public Guid ReleaseId { get; set; }
    public string TargetKind { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string Action { get; set; } = ReleaseAction.Publish;
    /// <summary>公開した版。取り下げでは、取り下げた時点の公開版。</summary>
    public Guid RevisionId { get; set; }
    /// <summary>この操作の直前の公開版。初めての公開ではnull。</summary>
    public Guid? PreviousRevisionId { get; set; }
    /// <summary>画面に出す対象名（公開時点の名称）。</summary>
    public string Label { get; set; } = string.Empty;
}

public static class ReleaseAction
{
    public const string Publish = "publish";
    public const string Withdraw = "withdraw";
}

public static class PublishTargetKind
{
    public const string Event = "event";
    public const string Occurrence = ReferenceRevisionKind.Occurrence;
    public const string Categories = ReferenceRevisionKind.Categories;
    public const string Spot = ReferenceRevisionKind.Spot;

    public static readonly string[] All = [Event, Occurrence, Categories, Spot];
}

/// <summary>対象ごとの現在の公開版。取り下げても行は残し、State で区別する（取り下げ済みと未公開を分けるため）。</summary>
public sealed class Publication
{
    public string TargetKind { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string State { get; set; } = PublicationRowState.Published;
    /// <summary>公開中の版。取り下げ済みでは最後に公開していた版。</summary>
    public Guid RevisionId { get; set; }
    public Guid ReleaseId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public static class PublicationRowState
{
    public const string Published = "published";
    public const string Withdrawn = "withdrawn";
}

/// <summary>公開候補の検証1回の結果。公開時は、ここで確認した前提から変わっていないことを Fingerprint で確かめる（11 RA-04）。</summary>
public sealed class ValidationRun
{
    public Guid Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid CreatedBy { get; set; }
    /// <summary>候補（対象・版・操作）のJSON。</summary>
    public string Entries { get; set; } = string.Empty;
    /// <summary>候補と、検証に使った公開データの版から作る値。一致しなければ再確認を求める。</summary>
    public string Fingerprint { get; set; } = string.Empty;
    /// <summary>ok／failed（検証処理そのものの失敗。合格とは扱わない。11 VA-10）。</summary>
    public string Status { get; set; } = ValidationRunStatus.Ok;
    /// <summary>所見のJSON。</summary>
    public string Findings { get; set; } = string.Empty;
}

public static class ValidationRunStatus
{
    public const string Ok = "ok";
    public const string Failed = "failed";
}

/// <summary>
/// 管理操作の記録（12 UI-18・UI-19、利用者判断 2026-09-24：保存・公開・ログイン）。
/// パスワード・トークンなどの秘密値は記録しない。未登録のメールアドレスでのログイン失敗は、入力値を残さない。
/// </summary>
public sealed class OperationLog
{
    public Guid Id { get; set; }
    /// <summary>画面からの操作のID（保存・公開）。公開では結果の照会に使う（17 §4）。</summary>
    public Guid? OperationId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public Guid? ActorId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? TargetKind { get; set; }
    public string? TargetId { get; set; }
    public string? TargetLabel { get; set; }
    public string Status { get; set; } = OperationStatus.Succeeded;
    public Guid? ReleaseId { get; set; }
    public Guid? RevisionId { get; set; }
    /// <summary>失敗の理由などの補足（利用者向けの文言）。</summary>
    public string? Detail { get; set; }
}

public static class OperationAction
{
    public const string Save = "save";
    public const string Import = "import";
    public const string Publish = "publish";
    public const string SignIn = "signIn";
    public const string SignInFailed = "signInFailed";
    public const string SignOut = "signOut";
}

public static class OperationStatus
{
    public const string Processing = "processing";
    public const string Succeeded = "succeeded";
    public const string Failed = "failed";
}
