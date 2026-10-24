namespace StudioApi.Services.MapValidation;

public sealed record ValidationFinding(string Code, string Path, string Message, string? CanonicalId = null);
public sealed record DatasetValidationResult(IReadOnlyList<ValidationFinding> Errors, bool PublicationChecksRequested)
{
    public bool IsValid => Errors.Count == 0;
    public bool CanPublish => PublicationChecksRequested && IsValid;
}

public sealed record SpotIdentity(Guid Id, string Code, bool IsPublished);
public sealed record SpotAlias(string AliasCode, Guid SpotId);
/// <summary>ID 予約表（E2-5 §5.5）で、ID と種別ごとの最新の状態。alias の行は EntityKind に解決先の種別、State に alias を入れる。</summary>
public sealed record ReservedId(string Id, string EntityKind, string State);
public sealed record GeoOrigin(double Longitude, double Latitude);
public sealed record FloorTransformEvidence(double RoundTripMaxMetres, double FitRmsMetres,
    double FitMaxMetres, double CheckMaxMetres, double RoundingMaxMetres);

/// <summary>Caller-supplied authoritative snapshots; the validator never opens a DB or infers field measurements.</summary>
public sealed record DatasetValidationContext
{
    public bool ForPublication { get; init; }
    public IReadOnlyList<string>? StartNodeIds { get; init; }
    public string? CampusBoundaryGeoJson { get; init; }
    public GeoOrigin? EnuOrigin { get; init; }
    public double? EntranceMaxGapMetres { get; init; }
    public double? PathDistanceToleranceMetres { get; init; }
    public IReadOnlyDictionary<string, double>? ExpectedPathSeconds { get; init; }
    public IReadOnlyDictionary<string, FloorTransformEvidence>? FloorTransforms { get; init; }
    public IReadOnlyList<SpotIdentity>? DatabaseSpots { get; init; }
    public IReadOnlyList<string>? PublishedNavigationSpotIds { get; init; }
    public IReadOnlyList<SpotAlias>? Aliases { get; init; }
    public IReadOnlyList<string>? OtherReservedCanonicalIds { get; init; }
    /// <summary>ID 予約表の現在の状態。公開時には必須（E1-4 改訂1 §12 の5）。</summary>
    public IReadOnlyList<ReservedId>? ReservedIds { get; init; }
}
