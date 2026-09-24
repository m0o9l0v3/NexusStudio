using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;

namespace StudioApi.Publishing;

/// <summary>
/// 公開状態（07 §5）。手入力の状態は持たず、Publication の行と現在の下書きの版から算出する。
/// </summary>
public static class PublicationState
{
    public const string Unpublished = "unpublished";
    public const string Published = "published";
    /// <summary>公開中・未公開変更あり。</summary>
    public const string PublishedWithChanges = "publishedWithChanges";
    public const string Withdrawn = "withdrawn";

    public static string Of(Publication? publication, Guid? currentRevisionId) => publication switch
    {
        null => Unpublished,
        { State: PublicationRowState.Withdrawn } => Withdrawn,
        _ when publication.RevisionId == currentRevisionId => Published,
        _ => PublishedWithChanges,
    };

    /// <summary>参加者向けに提供されているか（公開中、または公開中・未公開変更あり）。</summary>
    public static bool IsLive(string state) => state is Published or PublishedWithChanges;
}

/// <summary>公開状態の要約（一覧・詳細で使う）。</summary>
/// <param name="State">unpublished／published／publishedWithChanges／withdrawn。</param>
/// <param name="PublishedRevisionId">公開中の版（取り下げ済みでは最後に公開していた版）。</param>
public sealed record PublicationSummary(string State, Guid? PublishedRevisionId, DateTimeOffset? PublishedAt);

/// <summary>Publication の行をまとめて読み、対象ごとの公開状態を引く。</summary>
public sealed class PublicationIndex
{
    private readonly Dictionary<(string Kind, string Id), Publication> _rows;

    private PublicationIndex(Dictionary<(string, string), Publication> rows) => _rows = rows;

    public static async Task<PublicationIndex> LoadAsync(StudioDbContext db, string? kind = null)
    {
        var query = db.Publications.AsNoTracking();
        if (kind is not null)
        {
            query = query.Where(p => p.TargetKind == kind);
        }

        // canonical ID は大文字小文字を区別する。辞書も序数比較にする。
        var rows = await query.ToListAsync();
        return new PublicationIndex(rows.ToDictionary(p => (p.TargetKind, p.TargetId)));
    }

    public Publication? Find(string kind, string id) => _rows.GetValueOrDefault((kind, id));

    public PublicationSummary Summarize(string kind, string id, Guid? currentRevisionId)
    {
        var row = Find(kind, id);
        return new PublicationSummary(PublicationState.Of(row, currentRevisionId), row?.RevisionId, row?.UpdatedAt);
    }
}
