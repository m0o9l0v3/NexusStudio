using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StudioApi.Auth;
using StudioApi.Data;
using StudioApi.Events;
using StudioApi.Map;
using StudioApi.Models;
using StudioApi.Publishing;
using StudioApi.Reference;
using StudioApi.Services.MapValidation;

namespace StudioApi.Tests;

public sealed class OverviewTests : IAsyncLifetime
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 15, 5, 0, TimeSpan.Zero);
    private static readonly string[] Areas = ["event", "map", "spot", "occurrence", "categories"];
    private readonly StudioApiFactory _root = new();
    private readonly string _settingsPath = Path.Combine(Path.GetTempPath(), $"studio-overview-{Guid.NewGuid():N}.json");
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    private sealed class FixedTime : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    public async Task InitializeAsync()
    {
        _factory = _root.WithWebHostBuilder(builder =>
        {
            builder.UseSetting(ApprovedMapSettingsSource.ConfigurationKey, _settingsPath);
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider, FixedTime>());
        });
        await _root.InitializeDatabaseAsync();
        await _root.AddAdminAsync();
        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _root.DisposeAsync();
        File.Delete(_settingsPath);
    }

    [Fact]
    public async Task RequiresAuthentication()
    {
        using var response = await _client.GetAsync("/api/overview");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task EmptyWorkspace_ReportsNeverRunAndCampusDate()
    {
        await LoginAsync();

        var overview = await ReadOverviewAsync();
        Assert.Equal(Now, overview.GeneratedAt);
        Assert.Equal(new DateOnly(2026, 9, 11), overview.CampusToday);
        Assert.Null(overview.LatestRelease);
        Assert.Empty(overview.PublishedOccurrences);
        Assert.Empty(overview.RecentLogs);
        Assert.False(overview.DataHealth.HasPublishedRelease);
        Assert.False(overview.DataHealth.IncludesMap);
        Assert.Null(overview.DataHealth.LastCheckedAt);
        AssertUnknownFindings(overview, "neverRun");
        Assert.Equal(0, overview.DataHealth.UncheckedDraftCount);
        Assert.Empty(overview.DataHealth.UncheckedByArea);
        Assert.Equal(Areas, overview.UnpublishedChanges.Select(a => a.TargetKind));
        Assert.All(overview.UnpublishedChanges, area =>
        {
            Assert.Equal(0, area.DraftCount);
            Assert.Equal(0, area.UncheckedCount);
            Assert.Null(area.LatestMapRevisionId);
        });
    }

    [Fact]
    public async Task SavedDrafts_AreUncheckedUntilDiagnosis()
    {
        await LoginAsync();
        await CreateEventAsync("イベント");
        var occurrence = await CreateOccurrenceAsync("開催回");
        // 公開候補 Run は作られるが、全下書き診断としては扱わない。
        using var preview = await _client.PostWithCsrfAsync("/api/releases/preview", new PreviewRequest([OccurrenceEntry(occurrence)]));
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);

        var overview = await ReadOverviewAsync();
        AssertUnknownFindings(overview, "neverRun");
        Assert.Equal(2, overview.DataHealth.UncheckedDraftCount);
        Assert.Equal([new("event", 1), new("occurrence", 1)], overview.DataHealth.UncheckedByArea);
        Assert.All(overview.UnpublishedChanges, area => Assert.Equal(area.DraftCount, area.UncheckedCount));
        Assert.Empty(overview.PublishedOccurrences);
    }

    [Fact]
    public async Task CompletedDiagnosis_ReportsBlockingAndWarningCountsByArea()
    {
        await LoginAsync();
        await CreateEventAsync(null);
        await CreateOccurrenceAsync("日程未定の開催回");
        var diagnosis = await DiagnoseAsync();
        Assert.Contains(diagnosis.Findings, f => f is { TargetKind: "event", Code: "title_required" });
        Assert.Contains(diagnosis.Findings, f => f is { TargetKind: "occurrence", Code: "occurrence_no_days" });

        var overview = await ReadOverviewAsync();
        Assert.Equal("ok", overview.DataHealth.DiagnosisStatus);
        Assert.Equal(Now, overview.DataHealth.LastCheckedAt);
        Assert.Equal(0, overview.DataHealth.UncheckedDraftCount);
        Assert.Empty(overview.DataHealth.UncheckedByArea);
        AssertFindingCounts(overview, diagnosis);
    }

    [Fact]
    public async Task ChangedDraft_OnlyItsNewRevisionIsUnchecked()
    {
        await LoginAsync();
        var first = await CreateEventAsync(null);
        await CreateEventAsync("変更しない下書き");
        await CreateOccurrenceAsync("日程未定の開催回");
        var diagnosis = await DiagnoseAsync();
        var updated = await UpdateAsync<EventDetail>($"/api/events/{first.Id}", new UpdateEventRequest(
            Guid.NewGuid(), first.RowVersion, first.Draft with { Title = "診断後に変更した下書き" }));
        Assert.NotEqual(first.RevisionId, updated.RevisionId);

        var overview = await ReadOverviewAsync();
        Assert.Equal("stale", overview.DataHealth.DiagnosisStatus);
        Assert.Equal(diagnosis.CreatedAt, overview.DataHealth.LastCheckedAt);
        Assert.Equal(1, overview.DataHealth.UncheckedDraftCount);
        Assert.Equal(new OverviewAreaCount("event", 1), Assert.Single(overview.DataHealth.UncheckedByArea));
        var events = overview.UnpublishedChanges.Single(area => area.TargetKind == "event");
        Assert.Equal(2, events.DraftCount);
        Assert.Equal(1, events.UncheckedCount);
        AssertFindingCounts(overview, diagnosis);
    }

    [Fact]
    public async Task FailedDiagnosis_ReportsUnknownCountsEvenWhenItsFingerprintIsStale()
    {
        await LoginAsync();
        await CreateEventAsync(null);
        await DiagnoseAsync();
        await using (var scope = _root.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
            var run = await db.ValidationRuns.SingleAsync();
            run.Status = ValidationRunStatus.Failed;
            await db.SaveChangesAsync();
        }
        await CreateOccurrenceAsync("診断後に保存した開催回");

        var overview = await ReadOverviewAsync();
        AssertUnknownFindings(overview, "failed");
        Assert.Equal(Now, overview.DataHealth.LastCheckedAt);
        Assert.Equal(2, overview.DataHealth.UncheckedDraftCount);
        Assert.Equal([new("event", 1), new("occurrence", 1)], overview.DataHealth.UncheckedByArea);
    }

    [Fact]
    public async Task MapSettingsChange_RequiresRecheckingTheSameMapRevision()
    {
        await LoginAsync();
        await File.WriteAllTextAsync(_settingsPath, """{ "status": "draft" }""");
        Guid mapId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var imported = await scope.ServiceProvider.GetRequiredService<MapImporter>()
                .ImportAsync(MapImportTests.FixturePayload, MapImportTests.Evidence);
            Assert.True(imported.Succeeded, string.Join("\n", imported.Messages));
            var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
            mapId = await db.MapDatasets.Select(m => m.Id).SingleAsync();
        }
        var overview = await ReadOverviewAsync();
        Assert.True(overview.DataHealth.IncludesMap);
        Assert.Equal(mapId, overview.UnpublishedChanges.Single(area => area.TargetKind == "map").LatestMapRevisionId);

        Assert.Equal("ok", (await DiagnoseAsync()).Status);
        await CreateEventAsync("診断後に保存したイベント");
        overview = await ReadOverviewAsync();
        Assert.Equal("stale", overview.DataHealth.DiagnosisStatus);
        Assert.Equal(new OverviewAreaCount("event", 1), Assert.Single(overview.DataHealth.UncheckedByArea));

        await File.WriteAllTextAsync(_settingsPath, """{"status":"draft"}""");
        overview = await ReadOverviewAsync();
        Assert.Equal("stale", overview.DataHealth.DiagnosisStatus);
        Assert.Equal([new("event", 1), new("map", 1)], overview.DataHealth.UncheckedByArea);
        Assert.Equal(mapId, overview.UnpublishedChanges.Single(area => area.TargetKind == "map").LatestMapRevisionId);
    }

    [Fact]
    public async Task ReleasesAndOccurrences_UsePublishedRevisionsAndExcludeWithdrawnOccurrences()
    {
        await LoginAsync();
        await ReferenceDataTests.ImportSampleAsync(_root);
        var import = Assert.IsType<OverviewRelease>((await ReadOverviewAsync()).LatestRelease);
        Assert.Equal(ReleaseSource.Import, import.Source);
        Assert.Null(import.PublishedBy);
        Assert.Null(import.PreviousSequence);

        var firstDay = new OcDayDraft(Guid.NewGuid(), new DateOnly(2026, 9, 20), "10:00", "16:00", "normal", null);
        var cancelledDay = new OcDayDraft(Guid.NewGuid(), new DateOnly(2026, 9, 21), null, null, "cancelled", "悪天候");
        var main = await CreateOccurrenceAsync("公開時の開催回", cancelledDay, firstDay);
        var earlier = await CreateOccurrenceAsync("先に始まる開催回", firstDay with { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 19) });
        var sameDate = await CreateOccurrenceAsync("A", firstDay with { Id = Guid.NewGuid() });
        var categories = await _client.GetFromJsonAsync<CategoryListDetail>("/api/categories");
        var references = await PublishAsync(
            OccurrenceEntry(main), OccurrenceEntry(earlier), OccurrenceEntry(sameDate),
            new PublishEntry("categories", "categories", "publish", categories!.RevisionId));
        var categoryId = categories.Items.First(c => c.Selectable).Id;
        var firstEvent = await CreateEventAsync("イベント1", main.Id, firstDay.Id, categoryId);
        var secondEvent = await CreateEventAsync("イベント2", main.Id, firstDay.Id, categoryId);
        var events = await PublishAsync(EventEntry(firstEvent), EventEntry(secondEvent));

        var overview = await ReadOverviewAsync();
        var release = Assert.IsType<OverviewRelease>(overview.LatestRelease);
        Assert.True(overview.DataHealth.HasPublishedRelease);
        Assert.Equal(events.ReleaseId, release.ReleaseId);
        Assert.Equal(events.Sequence, release.Sequence);
        Assert.Equal(references.Sequence, release.PreviousSequence);
        Assert.Equal(Now, release.PublishedAt);
        Assert.Equal(ReleaseSource.Studio, release.Source);
        Assert.Equal("m09", release.PublishedBy?.DisplayName);
        Assert.Equal(new OverviewReleaseKindCount("event", "publish", 2), Assert.Single(release.EntrySummary));
        Assert.Equal([earlier.Id, sameDate.Id, main.Id], overview.PublishedOccurrences.Select(o => o.Id));
        var published = overview.PublishedOccurrences.Last();
        Assert.Equal(main.Draft.Name, published.Name);
        Assert.Equal(
            [new(firstDay.Id, firstDay.Date!.Value, "10:00", "16:00", "normal", null),
                new(cancelledDay.Id, cancelledDay.Date!.Value, null, null, "cancelled", "悪天候")],
            published.Days);

        await UpdateAsync<OccurrenceDetail>($"/api/occurrences/{main.Id}", new SaveOccurrenceRequest(
            Guid.NewGuid(), main.RowVersion, main.Draft with
            {
                Name = "未公開の開催回名",
                Days = [firstDay with { PublicStart = "11:00" }, cancelledDay with { CancelNote = "未公開の中止理由" }],
            }));
        await CreateOccurrenceAsync("公開したことのない開催回");
        var withdrawal = await PublishAsync(new PublishEntry("occurrence", sameDate.Id.ToString(), "withdraw", null));
        overview = await ReadOverviewAsync();
        Assert.Equal(events.Sequence, overview.LatestRelease?.PreviousSequence);
        Assert.Equal(withdrawal.Sequence, overview.LatestRelease?.Sequence);
        Assert.Equal(new OverviewReleaseKindCount("occurrence", "withdraw", 1), Assert.Single(overview.LatestRelease!.EntrySummary));
        Assert.Equal([earlier.Id, main.Id], overview.PublishedOccurrences.Select(o => o.Id));
        Assert.Equal(published.Name, overview.PublishedOccurrences.Last().Name);
        Assert.Equal(published.Days, overview.PublishedOccurrences.Last().Days);
    }

    [Fact]
    public async Task RecentLogs_ReturnFiveContentOperationsAndShareAbandonedProcessingStatus()
    {
        await LoginAsync();
        var occurrence = await CreateOccurrenceAsync("公開する開催回");
        var release = await PublishAsync(OccurrenceEntry(occurrence));
        using var logout = await _client.PostWithCsrfAsync("/api/auth/logout");
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        using var denied = await _client.LoginAsync(password: "wrong password here");
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        await LoginAsync();

        Guid abandoned;
        await using (var scope = _root.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StudioDbContext>();
            var started = Now - TimeSpan.FromMinutes(3);
            abandoned = Guid.NewGuid();
            db.OperationLogs.Add(new OperationLog
            {
                Id = abandoned,
                Action = "publish",
                Status = "processing",
                StartedAt = started,
                StartedAtMs = started.ToUnixTimeMilliseconds(),
            });
            for (var minutes = 4; minutes <= 7; minutes++)
            {
                OperationLogs.Add(db, Now - TimeSpan.FromMinutes(minutes), OperationAction.Import, null, OperationStatus.Succeeded);
            }
            await db.SaveChangesAsync();
        }

        var logs = (await ReadOverviewAsync()).RecentLogs;
        Assert.Equal(5, logs.Count);
        Assert.All(logs, log => Assert.Contains(log.Action, new[] { "save", "publish", "import" }));
        Assert.Equal(logs.Select(l => l.StartedAt).OrderDescending(), logs.Select(l => l.StartedAt));
        Assert.Contains(logs, l => l is { Action: "save" } && l.RevisionId == occurrence.RevisionId);
        Assert.Contains(logs, l => l is { Action: "publish" } && l.ReleaseId == release.ReleaseId && l.ReleaseSequence == release.Sequence);
        Assert.Equal(2, logs.Count(l => l.Action == "import"));
        var abandonedLog = logs.Single(l => l.Id == abandoned);
        Assert.Equal("failed", abandonedLog.Status);
        Assert.Equal(await _client.GetFromJsonAsync<LogItem>($"/api/logs/{abandoned}"), abandonedLog);
    }

    private async Task LoginAsync()
    {
        using var response = await _client.LoginAsync();
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private async Task<OverviewResponse> ReadOverviewAsync() => (await _client.GetFromJsonAsync<OverviewResponse>("/api/overview"))!;

    private async Task<EventDetail> CreateEventAsync(string? title, Guid? occurrenceId = null, Guid? dayId = null, Guid? categoryId = null)
    {
        IReadOnlyList<EventSlot> slots = dayId is null ? [] :
            [new(Guid.NewGuid(), dayId, "allDay", null, "anytime", "normal", null, [new("mb_2f_cl_001", null)])];
        var draft = new EventDraft(EventDraftRules.SchemaVersion, title, "公開用のイベント説明", categoryId, occurrenceId, slots);
        return await PostAsync<EventDetail>("/api/events", new CreateEventRequest(Guid.NewGuid(), draft), HttpStatusCode.Created);
    }

    private Task<OccurrenceDetail> CreateOccurrenceAsync(string name, params OcDayDraft[] days)
        => PostAsync<OccurrenceDetail>("/api/occurrences", new CreateOccurrenceRequest(Guid.NewGuid(), new OccurrenceDraft(name, null, days)), HttpStatusCode.Created);

    private Task<DraftDiagnosisResult> DiagnoseAsync()
        => PostAsync<DraftDiagnosisResult>("/api/validation/draft", null, HttpStatusCode.OK);

    private async Task<ReleaseSummary> PublishAsync(params PublishEntry[] entries)
    {
        var preview = await PostAsync<PublishPreview>("/api/releases/preview", new PreviewRequest(entries), HttpStatusCode.OK);
        Assert.True(preview.Validation.BlockingCount == 0, string.Join("\n", preview.Validation.Findings.Select(f => f.Message)));
        var published = await PostAsync<OperationResult>("/api/releases",
            new PublishRequest(Guid.NewGuid(), preview.Validation.Entries, preview.Validation.Id, null), HttpStatusCode.OK);
        Assert.Equal("succeeded", published.Status);
        return Assert.IsType<ReleaseSummary>(published.Release);
    }

    private static PublishEntry OccurrenceEntry(OccurrenceDetail occurrence)
        => new("occurrence", occurrence.Id.ToString(), "publish", occurrence.RevisionId);

    private static PublishEntry EventEntry(EventDetail item) => new("event", item.Id.ToString(), "publish", item.RevisionId);

    private async Task<T> PostAsync<T>(string path, object? body, HttpStatusCode expectedStatus)
    {
        using var response = await _client.PostWithCsrfAsync(path, body);
        return await ReadResponseAsync<T>(response, expectedStatus);
    }

    private async Task<T> UpdateAsync<T>(string path, object body)
    {
        var token = await _client.GetCsrfTokenAsync();
        using var request = new HttpRequestMessage(HttpMethod.Put, path) { Content = JsonContent.Create(body) };
        request.Headers.Add(CsrfValidationMiddleware.HeaderName, token);
        using var response = await _client.SendAsync(request);
        return await ReadResponseAsync<T>(response, HttpStatusCode.OK);
    }

    private static async Task<T> ReadResponseAsync<T>(HttpResponseMessage response, HttpStatusCode expectedStatus)
    {
        Assert.True(response.StatusCode == expectedStatus, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static void AssertUnknownFindings(OverviewResponse overview, string diagnosisStatus)
    {
        Assert.Equal(diagnosisStatus, overview.DataHealth.DiagnosisStatus);
        Assert.Null(overview.DataHealth.TotalBlockingCount);
        Assert.Null(overview.DataHealth.TotalWarningCount);
        Assert.All(overview.UnpublishedChanges, area =>
        {
            Assert.Null(area.BlockingCount);
            Assert.Null(area.WarningCount);
        });
    }

    private static void AssertFindingCounts(OverviewResponse overview, DraftDiagnosisResult diagnosis)
    {
        Assert.Equal(diagnosis.Areas.Sum(a => a.BlockingCount), overview.DataHealth.TotalBlockingCount);
        Assert.Equal(diagnosis.Areas.Sum(a => a.WarningCount), overview.DataHealth.TotalWarningCount);
        Assert.All(overview.UnpublishedChanges, area =>
        {
            var expected = diagnosis.Areas.Single(a => a.TargetKind == area.TargetKind);
            Assert.Equal(expected.BlockingCount, area.BlockingCount);
            Assert.Equal(expected.WarningCount, area.WarningCount);
        });
    }
}
