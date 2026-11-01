using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using StudioApi.Data;
using StudioApi.Models;
using StudioApi.Publishing;
using StudioApi.Services.MapValidation;

namespace StudioApi.Map;

public sealed record MapImportResult(bool Succeeded, IReadOnlyList<string> Messages, long? Version = null);

/// <summary>
/// 地図（GeoJSON payload 契約 2.x）を下書きの版として取り込む（決定事項31 D1）。運用者が明示的に実行するコマンド専用で、
/// 起動時には実行しない（Step 0-c）。公開はしない：公開は Release（対象の種類 map）で行う。
/// 検証器の下書き検証に合格しない payload、根拠の形式の誤り、直前の版と同じ内容は取り込まない。
/// 版ごとの根拠（経路の所要時間・フロアの座標変換）は任意で、無ければ公開判定で不足として止まる。
/// </summary>
public sealed class MapImporter(StudioDbContext db, MapDatasetValidator validator, TimeProvider timeProvider)
{
    public const int MaxReportedErrors = 20;

    public async Task<MapImportResult> ImportAsync(string payload, string? evidenceJson)
    {
        var result = validator.Validate(payload);
        if (!result.IsValid)
        {
            var messages = result.Errors.Take(MaxReportedErrors)
                .Select(e => $"{e.Code} {e.Path}{(e.CanonicalId is null ? "" : $"（{e.CanonicalId}）")}: {e.Message}")
                .ToList();
            if (result.Errors.Count > MaxReportedErrors)
            {
                messages.Add($"ほか{result.Errors.Count - MaxReportedErrors}件");
            }

            return new MapImportResult(false, messages);
        }

        string? evidenceText = null;
        if (evidenceJson is not null)
        {
            MapDatasetEvidence evidence;
            try
            {
                evidence = MapDatasetEvidence.Parse(evidenceJson);
            }
            catch (InvalidOperationException exception)
            {
                return new MapImportResult(false, [exception.Message]);
            }

            // 根拠が地図に無い ID を指すのは、別の版の根拠を渡した可能性が高い。取り込まない。
            var index = MapFeatureIndex.Parse(payload);
            var unknown = evidence.ExpectedPathSeconds.Keys.Where(id => index.Features.GetValueOrDefault(id) != IdEntityKind.WalkingPath)
                .Concat(evidence.FloorTransforms.Keys.Where(id => !index.Floors.ContainsKey(id)))
                .ToList();
            if (unknown.Count > 0)
            {
                return new MapImportResult(false, [$"根拠が地図に無い経路・フロアを指しています: {string.Join("、", unknown.Take(MaxReportedErrors))}"]);
            }

            evidenceText = evidenceJson;
        }

        var checksum = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(payload)));
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (db.Database.IsNpgsql())
        {
            // 版番号の採番を、公開・ほかの取り込みと直列にする。
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7201)");
        }

        var latest = await db.MapDatasets.AsNoTracking().OrderByDescending(m => m.Version).FirstOrDefaultAsync();
        if (latest is not null && latest.Checksum == checksum && latest.ValidationEvidence == evidenceText)
        {
            return new MapImportResult(false, [$"直前の版 v{latest.Version} と同じ内容です。取り込みませんでした。"]);
        }

        var dataset = new MapDataset
        {
            Id = Guid.CreateVersion7(),
            Version = (latest?.Version ?? 0) + 1,
            Status = MapDatasetStatus.Draft,
            Payload = payload,
            Checksum = checksum,
            ValidationEvidence = evidenceText,
        };
        db.MapDatasets.Add(dataset);
        var message = $"地図: v{dataset.Version} を下書きとして取り込みました（sha256 {checksum}、根拠 {(evidenceText is null ? "なし" : "あり")}）";
        OperationLogs.Add(db, timeProvider.GetUtcNow(), OperationAction.Import, null, OperationStatus.Succeeded, message);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new MapImportResult(true, [message], dataset.Version);
    }
}

public static class MapCommand
{
    public const string Usage = """
        使い方: StudioApi map import --file <GeoJSON ファイル> [--evidence <根拠の JSON ファイル>]

          地図（GeoJSON payload 契約 2.x）を下書きの版として取り込む。公開はしない（公開は Releases の操作で行う）。
          検証器の下書き検証に合格しない地図、直前の版と同じ内容は取り込まない。
          根拠（経路の所要時間・フロアの座標変換の検証結果）の形式は deploy/map-validation/README.md。
          根拠が無い版は取り込めるが、公開判定で不足として止まる。

        接続先は環境変数 ConnectionStrings__StudioDatabase で指定する。マイグレーションは適用しない。
        """;

    public static async Task<int> RunAsync(string[] args, MapImporter importer, TextWriter output, TextWriter error)
    {
        // --file は必須、--evidence は任意（順序は問わない）。
        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 1; i + 1 < args.Length; i += 2)
        {
            if (args[i] is not ("--file" or "--evidence") || !options.TryAdd(args[i], args[i + 1]))
            {
                options.Clear();
                break;
            }
        }

        if (args.Length is not (3 or 5) || args[0] != "import" || !options.TryGetValue("--file", out var payloadPath))
        {
            await error.WriteLineAsync(Usage);
            return 2;
        }

        var evidencePath = options.GetValueOrDefault("--evidence");

        string payload;
        string? evidenceJson = null;
        try
        {
            // 保存したバイト列から checksum を求めるため、改行・空白を含めてそのまま読む。
            payload = await File.ReadAllTextAsync(payloadPath, new UTF8Encoding(false, throwOnInvalidBytes: true));
            if (evidencePath is not null)
            {
                evidenceJson = await File.ReadAllTextAsync(evidencePath, new UTF8Encoding(false, throwOnInvalidBytes: true));
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or DecoderFallbackException)
        {
            await error.WriteLineAsync($"ファイルを読み取れません: {exception.Message}");
            return 1;
        }

        var result = await importer.ImportAsync(payload, evidenceJson);
        foreach (var message in result.Messages)
        {
            await (result.Succeeded ? output : error).WriteLineAsync(message);
        }

        return result.Succeeded ? 0 : 1;
    }
}
