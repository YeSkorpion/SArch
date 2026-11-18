namespace Studio.Api.Contracts;

public sealed record SourceResponse(
    Guid Id,
    SourceKind Kind,
    string Title,
    string Target,
    string Destination,
    SourceState State,
    string? CheckedByName,
    DateTimeOffset? CheckedAt,
    string? CheckedReference);

public sealed record SourceRequest(SourceKind Kind, string Title, string Target);

public sealed record SourceCheckRequest(string? Reference);

public sealed record FlowChoice(Guid NodeId, string Title, Guid ScreenId, string ScreenName);

public sealed record FlowScreen(Guid Id, string Name, string WireframeJson);

public sealed record FlowResponse(
    bool Ready,
    Guid? EntryNodeId,
    Guid? EntryScreenId,
    string? EntryStepTitle,
    IReadOnlyList<FlowChoice> Choices,
    IReadOnlyList<FlowScreen> Screens);

public sealed record FlowEntryRequest(Guid NodeId, Guid ScreenId);

public sealed record CatalogColumnResponse(Guid Id, string Name, bool IsPrimaryKey, Guid? ForeignTableId, string? ForeignTableName, string Notes, int Position);

public sealed record CatalogTableResponse(
    Guid Id,
    string Name,
    string Purpose,
    string SourceName,
    Guid? AreaId,
    string? AreaName,
    Guid? DocumentId,
    string? DocumentTitle,
    IReadOnlyList<CatalogColumnResponse> Columns);

public sealed record CatalogTableRequest(string Name, string? Purpose, string? SourceName, Guid? AreaId, Guid? DocumentId);

public sealed record CatalogColumnRequest(string Name, bool IsPrimaryKey, Guid? ForeignTableId, string? Notes);

public sealed record WorkRow(Guid Id, string Title, string Status, string NextStep, string Href, DateTimeOffset UpdatedAt);

public sealed record WorkResponse(IReadOnlyList<WorkRow> Review, IReadOnlyList<WorkRow> Comments, IReadOnlyList<WorkRow> Packages);
