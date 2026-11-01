namespace StudioApi.Services.MapValidation;

/// <summary>
/// 承認済み設定のファイル（設定キー MapValidation:ApprovedSettingsFile）を、公開判定のたびに読む。
/// 既定のパスは持たない。未設定なら null を返し、地図の公開判定は検証器の missing_validation_context で止まる（決定事項31 D3）。
/// 読めない・形式が違うファイルは例外にし、公開判定を「検証失敗」として扱わせる（合格にしない）。
/// </summary>
public class ApprovedMapSettingsSource(IConfiguration configuration)
{
    public const string ConfigurationKey = "MapValidation:ApprovedSettingsFile";

    public virtual ApprovedMapSettings? Load()
        => configuration[ConfigurationKey] is { Length: > 0 } path ? ApprovedMapSettings.Load(path) : null;
}
