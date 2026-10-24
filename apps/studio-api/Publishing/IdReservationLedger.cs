using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;
using StudioApi.Services.MapValidation;

namespace StudioApi.Publishing;

/// <summary>
/// ID 予約表（nexus-mobile E2-5 §5.5）のある時点の状態。行は追記専用で、ID と種別ごと・alias ごとに最新の行を有効とする。
/// 比較は大文字小文字を区別する完全一致（canonical ID を正規化しない）。
/// </summary>
public sealed class IdReservationSnapshot
{
    private readonly Dictionary<(string Id, string Kind), IdReservation> _latest;
    private readonly Dictionary<string, IdReservation> _aliases;

    private IdReservationSnapshot(IReadOnlyList<IdReservation> rows)
    {
        _latest = new Dictionary<(string, string), IdReservation>();
        _aliases = new Dictionary<string, IdReservation>(StringComparer.Ordinal);
        foreach (var row in rows.OrderBy(r => r.Sequence))
        {
            MaxSequence = Math.Max(MaxSequence, row.Sequence);
            if (row.State == IdReservationState.Alias)
            {
                _aliases[row.Id] = row;
            }
            else
            {
                _latest[(row.Id, row.EntityKind)] = row;
            }
        }
    }

    /// <summary>最後に追記した行の順序（行が無ければ0）。</summary>
    public long MaxSequence { get; private set; }

    public static async Task<IdReservationSnapshot> LoadAsync(StudioDbContext db)
        => new(await db.IdReservations.AsNoTracking().ToListAsync());

    /// <summary>ID と種別の最新の状態（active／retired）。登録が無ければnull。</summary>
    public string? StateOf(string id, string kind) => _latest.GetValueOrDefault((id, kind))?.State;

    /// <summary>alias の現在の解決先（alias ごとの最新の行）。alias でなければnull。</summary>
    public string? Resolve(string alias) => _aliases.GetValueOrDefault(alias)?.CanonicalId;

    /// <summary>現在の alias と解決先。</summary>
    public IEnumerable<(string Alias, string CanonicalId)> Aliases => _aliases.Values.Select(r => (r.Id, r.CanonicalId!));

    /// <summary>
    /// ID を種別 kind として公開してよいか（名前空間の一意性と再利用禁止。E2-5 §5.5、E1-2）。
    /// alias・廃止済みの ID は使えない。公開中の ID は、同じ種別か spot とその目的地Featureの組み合わせのときだけ使える。
    /// </summary>
    /// <returns>使えない理由のコード。使えればnull。</returns>
    public string? Conflict(string id, string kind)
    {
        if (_aliases.ContainsKey(id))
        {
            return "reserved_id_alias";
        }

        foreach (var ((rowId, rowKind), row) in _latest)
        {
            if (!string.Equals(rowId, id, StringComparison.Ordinal))
            {
                continue;
            }

            if (row.State == IdReservationState.Retired)
            {
                return "reserved_id_retired";
            }

            if (!IdEntityKind.CanShareId(rowKind, kind))
            {
                return "reserved_id_kind_conflict";
            }
        }

        return null;
    }

    /// <summary>MapDatasetValidator に渡す形（E1-4 改訂1 §12 の5）。</summary>
    public IReadOnlyList<ReservedId> ToValidationContext()
        => _latest.Values.Select(r => new ReservedId(r.Id, r.EntityKind, r.State))
            .Concat(_aliases.Values.Select(r => new ReservedId(r.Id, r.EntityKind, r.State)))
            .ToList();

    /// <summary>同じトランザクションで追記した行を、続く判断に反映する。</summary>
    internal void Apply(IdReservation row)
    {
        MaxSequence = Math.Max(MaxSequence, row.Sequence);
        if (row.State == IdReservationState.Alias)
        {
            _aliases[row.Id] = row;
        }
        else
        {
            _latest[(row.Id, row.EntityKind)] = row;
        }
    }
}

/// <summary>ID 予約表への追記（E2-5 §5.5）。行の変更・削除はしない。</summary>
public sealed class IdReservationLedger(StudioDbContext db, IdReservationSnapshot snapshot, TimeProvider timeProvider)
{
    public IdReservationSnapshot Snapshot => snapshot;

    /// <summary>
    /// 公開された ID を active として登録する（公開と同じトランザクション）。すでに active の ID は追記しない。
    /// 取り下げ・地図から消えた ID には retired を追記しない：取り下げた対象は復旧できるため、廃止は改名などの明示的な操作でだけ行う。
    /// </summary>
    public void RegisterPublished(IEnumerable<(string Id, string Kind)> published, Guid releaseId)
    {
        foreach (var (id, kind) in published.Distinct())
        {
            if (snapshot.StateOf(id, kind) == IdReservationState.Active)
            {
                continue;
            }

            // 公開前の検証で止めているはず。ここで廃止済み・alias の ID を登録しない（予約表を矛盾させない）。
            if (snapshot.Conflict(id, kind) is { } conflict)
            {
                throw new InvalidOperationException($"ID {id}（{kind}）は予約表と衝突するため登録できません: {conflict}");
            }

            Append(new IdReservation { Id = id, EntityKind = kind, State = IdReservationState.Active, Source = IdReservationSource.Release, ReleaseId = releaseId });
        }
    }

    /// <summary>ID を廃止する（retired の追記）。廃止した ID は再利用できない。</summary>
    public void Retire(string id, string kind, string source, Guid? releaseId, string? note = null)
    {
        if (snapshot.StateOf(id, kind) != IdReservationState.Active)
        {
            throw new InvalidOperationException($"公開中でない ID {id}（{kind}）は廃止できません。");
        }

        Append(new IdReservation { Id = id, EntityKind = kind, State = IdReservationState.Retired, Source = source, ReleaseId = releaseId, Note = note });
    }

    /// <summary>
    /// alias（旧 ID）→ canonical ID を追記する（O-3c T2）。alias を解決先にしている既存の alias も、同じ解決先へ付け替える行を追記する。
    /// 同じ alias では最新の行が有効なので、A→B の後に B→C を追記しても A→B→C の連鎖は生じない。
    /// </summary>
    public void AddAlias(string alias, string canonicalId, string kind, string source, Guid? releaseId, string? note = null)
    {
        if (string.Equals(alias, canonicalId, StringComparison.Ordinal))
        {
            throw new ArgumentException("alias と解決先が同じです。");
        }

        if (snapshot.Resolve(canonicalId) is not null)
        {
            throw new InvalidOperationException($"解決先 {canonicalId} は alias です。alias の解決は1段だけです。");
        }

        if (snapshot.StateOf(alias, kind) == IdReservationState.Active)
        {
            throw new InvalidOperationException($"公開中の ID {alias} を alias にはできません。先に廃止してください。");
        }

        var retargeted = snapshot.Aliases.Where(a => string.Equals(a.CanonicalId, alias, StringComparison.Ordinal)).Select(a => a.Alias).ToList();
        Append(new IdReservation { Id = alias, EntityKind = kind, State = IdReservationState.Alias, CanonicalId = canonicalId, Source = source, ReleaseId = releaseId, Note = note });
        foreach (var older in retargeted)
        {
            Append(new IdReservation { Id = older, EntityKind = kind, State = IdReservationState.Alias, CanonicalId = canonicalId, Source = source, ReleaseId = releaseId, Note = note });
        }
    }

    private void Append(IdReservation row)
    {
        row.Sequence = snapshot.MaxSequence + 1;
        row.CreatedAt = timeProvider.GetUtcNow();
        db.IdReservations.Add(row);
        snapshot.Apply(row);
    }
}
