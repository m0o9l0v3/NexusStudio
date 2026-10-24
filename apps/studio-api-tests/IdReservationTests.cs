using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Data;
using StudioApi.Models;
using StudioApi.Publishing;

namespace StudioApi.Tests;

/// <summary>ID 予約表（nexus-mobile E2-5 §5.5）：追記専用、最新の行が有効、名前空間の一意性と再利用禁止。</summary>
public sealed class IdReservationTests : IAsyncLifetime
{
    private readonly StudioApiFactory _factory = new();
    private AsyncServiceScope _scope;
    private StudioDbContext _db = null!;

    public async Task InitializeAsync()
    {
        await _factory.InitializeDatabaseAsync();
        _scope = _factory.Services.CreateAsyncScope();
        _db = _scope.ServiceProvider.GetRequiredService<StudioDbContext>();
    }

    public async Task DisposeAsync()
    {
        await _scope.DisposeAsync();
        await _factory.DisposeAsync();
    }

    private async Task<IdReservationLedger> LedgerAsync() => new(_db, await IdReservationSnapshot.LoadAsync(_db), TimeProvider.System);

    private async Task SeedActiveAsync(params (string Id, string Kind)[] ids)
    {
        var sequence = await _db.IdReservations.MaxAsync(r => (long?)r.Sequence) ?? 0;
        foreach (var (id, kind) in ids)
        {
            _db.IdReservations.Add(new IdReservation { Sequence = ++sequence, Id = id, EntityKind = kind, State = IdReservationState.Active, Source = IdReservationSource.Import, CreatedAt = DateTimeOffset.UtcNow });
        }

        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Rows_CannotBeModifiedOrDeleted()
    {
        await SeedActiveAsync(("mb", "building"));
        var row = await _db.IdReservations.SingleAsync();

        row.State = IdReservationState.Retired;
        await Assert.ThrowsAsync<InvalidOperationException>(() => _db.SaveChangesAsync());
        _db.ChangeTracker.Clear();

        _db.IdReservations.Remove(await _db.IdReservations.SingleAsync());
        await Assert.ThrowsAsync<InvalidOperationException>(() => _db.SaveChangesAsync());
    }

    [Fact]
    public async Task Retire_AppendsRowAndLatestRowWins()
    {
        await SeedActiveAsync(("mb_2f_n_001", "indoor_node"));
        (await LedgerAsync()).Retire("mb_2f_n_001", "indoor_node", IdReservationSource.Rename, null);
        await _db.SaveChangesAsync();

        Assert.Equal(2, await _db.IdReservations.CountAsync());
        var snapshot = await IdReservationSnapshot.LoadAsync(_db);
        Assert.Equal(IdReservationState.Retired, snapshot.StateOf("mb_2f_n_001", "indoor_node"));
        Assert.Equal("reserved_id_retired", snapshot.Conflict("mb_2f_n_001", "indoor_node"));
        // 廃止した ID は別の種別でも再利用できない（E1-2）。
        Assert.Equal("reserved_id_retired", snapshot.Conflict("mb_2f_n_001", "room"));
    }

    [Fact]
    public async Task Conflict_AllowsSpotAndItsDestinationFeatureOnly()
    {
        await SeedActiveAsync(("mb", "building"), ("mb_2f_n_001", "indoor_node"));
        var snapshot = await IdReservationSnapshot.LoadAsync(_db);

        Assert.Null(snapshot.Conflict("mb", "building"));
        Assert.Null(snapshot.Conflict("mb", "spot"));
        Assert.Equal("reserved_id_kind_conflict", snapshot.Conflict("mb", "room"));
        Assert.Equal("reserved_id_kind_conflict", snapshot.Conflict("mb_2f_n_001", "spot"));
        // 大文字小文字を区別する完全一致。
        Assert.Null(snapshot.Conflict("MB_2F_N_001", "spot"));
        Assert.Null(snapshot.Conflict("never_published", "spot"));
    }

    [Fact]
    public async Task AddAlias_RetargetsExistingAliasesSoChainsDoNotForm()
    {
        await SeedActiveAsync(("spot_c", "spot"));
        var ledger = await LedgerAsync();
        // A → B の後に B → C（O-3c T2）。A の解決先も C へ付け替える行を追記する。
        ledger.AddAlias("spot_a", "spot_b", "spot", IdReservationSource.Import, null);
        await _db.SaveChangesAsync();
        ledger = await LedgerAsync();
        ledger.AddAlias("spot_b", "spot_c", "spot", IdReservationSource.Rename, null);
        await _db.SaveChangesAsync();

        var snapshot = await IdReservationSnapshot.LoadAsync(_db);
        Assert.Equal("spot_c", snapshot.Resolve("spot_a"));
        Assert.Equal("spot_c", snapshot.Resolve("spot_b"));
        Assert.Equal(3, await _db.IdReservations.CountAsync(r => r.State == IdReservationState.Alias));
        Assert.Equal("reserved_id_alias", snapshot.Conflict("spot_a", "spot"));
    }

    [Fact]
    public async Task AddAlias_RejectsActiveIdsAndAliasTargets()
    {
        await SeedActiveAsync(("spot_b", "spot"), ("spot_c", "spot"));
        var ledger = await LedgerAsync();
        Assert.Throws<InvalidOperationException>(() => ledger.AddAlias("spot_b", "spot_c", "spot", IdReservationSource.Rename, null));
        ledger.AddAlias("spot_a", "spot_c", "spot", IdReservationSource.Import, null);
        Assert.Throws<InvalidOperationException>(() => ledger.AddAlias("spot_x", "spot_a", "spot", IdReservationSource.Import, null));
    }

    [Fact]
    public async Task RegisterPublished_SkipsActiveAndRefusesReservedIds()
    {
        await SeedActiveAsync(("mb", "building"));
        var ledger = await LedgerAsync();
        ledger.RegisterPublished([("mb", "building"), ("mb", "spot"), ("mb", "spot")], Guid.Empty);
        Assert.Single(_db.ChangeTracker.Entries<IdReservation>(), e => e.State == EntityState.Added);

        ledger.Retire("mb", "building", IdReservationSource.Rename, null);
        Assert.Throws<InvalidOperationException>(() => ledger.RegisterPublished([("mb", "building")], Guid.Empty));
    }
}
