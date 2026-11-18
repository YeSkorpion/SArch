using Studio.Api.Domain;

namespace Studio.Api.Contracts;

public sealed record PageResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public sealed record UserResponse(Guid Id, string Email, string DisplayName, string Token);

public sealed record RegisterRequest(string DisplayName, string Email, string Password);

public sealed record LoginRequest(string Email, string Password);

public sealed record ProjectResponse(
    Guid Id,
    string Name,
    string Description,
    bool IsArchived,
    int Version,
    ProjectRole Role,
    DateTimeOffset UpdatedAt);

public sealed record PresenceRequest(string? Label, Guid? ArtifactId);

public sealed record PresencePerson(Guid UserId, string Name, string Label, Guid? ArtifactId);

public sealed record TogetherResponse(long Revision, IReadOnlyList<PresencePerson> People);

public sealed record CreateProjectRequest(string Name, string? Description);

public sealed record UpdateProjectRequest(int Version, string Name, string? Description);

public sealed record VersionRequest(int Version);

public sealed record MemberResponse(Guid UserId, string Email, string DisplayName, ProjectRole Role, DateTimeOffset CreatedAt);

public sealed record AddMemberRequest(string Email, ProjectRole Role);

public sealed record UpdateMemberRequest(ProjectRole Role);

public sealed record RequirementResponse(
    Guid Id,
    string Key,
    string Title,
    string Description,
    RequirementStatus Status,
    RequirementPriority Priority,
    IReadOnlyList<string> Tags,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    Guid? AreaId);

public sealed record CreateRequirementRequest(
    string Title,
    string? Description,
    RequirementStatus? Status,
    RequirementPriority? Priority,
    List<string>? Tags,
    Guid? AreaId);

public sealed record UpdateRequirementRequest(
    int Version,
    string Title,
    string? Description,
    RequirementStatus Status,
    RequirementPriority Priority,
    List<string>? Tags,
    Guid? AreaId);

public sealed record DiagramSummaryResponse(
    Guid Id,
    DiagramKind Kind,
    string Name,
    string Description,
    int Version,
    DateTimeOffset UpdatedAt,
    Guid? AreaId,
    string? AreaName);

public sealed record DiagramNodeResponse(
    Guid Id,
    string NodeType,
    string Title,
    double X,
    double Y,
    Guid? ComponentId,
    string? ComponentName,
    string? ComponentKind,
    string? Technology,
    string? Description,
    string? EventName,
    int Version);

public sealed record DiagramEdgeResponse(
    Guid Id,
    EdgeKind Kind,
    Guid SourceId,
    Guid TargetId,
    string? Label,
    string? Condition,
    string? Protocol);

public sealed record DiagramResponse(
    Guid Id,
    DiagramKind Kind,
    string Name,
    string Description,
    int Version,
    DateTimeOffset UpdatedAt,
    Guid? AreaId,
    string? AreaName,
    IReadOnlyList<DiagramNodeResponse> Nodes,
    IReadOnlyList<DiagramEdgeResponse> Edges,
    IReadOnlyList<DiagramIssue> Issues);

public sealed record CreateDiagramRequest(string Name, string? Description, DiagramKind Kind, Guid? AreaId);

public sealed record DiagramNodeInput(
    Guid Id,
    string NodeType,
    string Title,
    double X,
    double Y,
    Guid? ComponentId,
    string? Description,
    string? EventName);

public sealed record DiagramEdgeInput(
    Guid Id,
    EdgeKind Kind,
    Guid SourceId,
    Guid TargetId,
    string? Label,
    string? Condition,
    string? Protocol);

public sealed record SaveDiagramRequest(
    int Version,
    string Name,
    string? Description,
    List<DiagramNodeInput> Nodes,
    List<DiagramEdgeInput> Edges,
    Guid? AreaId);

public sealed record ComponentResponse(
    Guid Id,
    string Name,
    string Description,
    ComponentKind Kind,
    string? Technology,
    int Version,
    int PlacementCount,
    int DetailCount,
    DateTimeOffset UpdatedAt);

public sealed record CreateComponentRequest(string Name, string? Description, ComponentKind Kind, string? Technology);

public sealed record UpdateComponentRequest(int Version, string Name, string? Description, ComponentKind Kind, string? Technology);

public sealed record ScreenResponse(
    Guid Id,
    string Name,
    string Route,
    string Purpose,
    ScreenStatus Status,
    string Notes,
    string WireframeJson,
    int Version,
    DateTimeOffset UpdatedAt);

public sealed record CreateScreenRequest(string Name, string Route, string? Purpose);

public sealed record UpdateScreenRequest(
    int Version,
    string Name,
    string Route,
    string? Purpose,
    ScreenStatus Status,
    string? Notes,
    string WireframeJson);

public sealed record DocumentListItem(
    Guid Id,
    Guid? ParentId,
    string Title,
    DocumentKind Kind,
    DocumentStatus Status,
    int SortOrder,
    int Version,
    DateTimeOffset UpdatedAt);

public sealed record DocumentResponse(
    Guid Id,
    Guid? ParentId,
    string Title,
    DocumentKind Kind,
    DocumentStatus Status,
    string ContentJson,
    int Version,
    int SortOrder,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<EmbeddedArtifact> Embeds);

public sealed record EmbeddedArtifact(Guid Id, string Title, string Type, bool Deleted);

public sealed record CreateDocumentRequest(string Title, Guid? ParentId, DocumentKind Kind);

public sealed record UpdateDocumentRequest(int Version, string Title, DocumentStatus Status, string ContentJson);

public sealed record MoveDocumentRequest(int Version, Guid? ParentId, int SortOrder);

public sealed record RevisionResponse(
    Guid Id,
    int Number,
    string Title,
    DocumentStatus Status,
    string ContentJson,
    Guid AuthorId,
    string AuthorName,
    DateTimeOffset CreatedAt,
    IReadOnlyList<EmbeddedArtifact> Embeds);

public sealed record RestoreRevisionRequest(int Version);

public sealed record LinkResponse(
    Guid Id,
    LinkRelation Relation,
    string Direction,
    Guid ArtifactId,
    string ArtifactType,
    string Title,
    string? NodeType,
    Guid? DiagramId,
    string? Rationale);

public sealed record CreateLinkRequest(Guid SourceId, Guid TargetId, LinkRelation Relation, string? Rationale);

public sealed record ImpactRef(Guid Id, string Kind, string Title);

public sealed record ImpactResponse(
    bool CanDelete,
    string? BlockReason,
    IReadOnlyList<ImpactRef> Links,
    IReadOnlyList<ImpactRef> Edges,
    IReadOnlyList<ImpactRef> Placements,
    IReadOnlyList<ImpactRef> ChildPages,
    IReadOnlyList<ImpactRef> Navigations,
    IReadOnlyList<ImpactRef> Nodes);

public sealed record SearchHit(
    Guid Id,
    string Type,
    string Title,
    string Subtitle,
    Guid? DiagramId);

public sealed record RecentItem(Guid Id, string Type, string Title, string Subtitle, DateTimeOffset UpdatedAt, Guid? DiagramId);

public sealed record OverviewResponse(
    int OpenCount,
    IReadOnlyList<RequirementResponse> OpenRequirements,
    IReadOnlyList<RecentItem> Recent,
    int MissingProcessCount,
    IReadOnlyList<RequirementResponse> MissingProcess,
    int MissingScreenCount,
    IReadOnlyList<RequirementResponse> MissingScreen,
    int MissingComponentCount,
    IReadOnlyList<RequirementResponse> MissingComponent,
    IReadOnlyList<SharedComponentResponse> SharedComponents,
    int RequirementCount,
    int ProcessCount,
    int SystemCount,
    int ScreenCount,
    int DocumentCount,
    int ComponentCount);

public sealed record SharedComponentResponse(Guid ComponentId, string Name, IReadOnlyList<AffectedFlowResponse> Flows);

public sealed record AffectedFlowResponse(
    Guid DiagramId,
    string DiagramName,
    Guid? AreaId,
    string? AreaName,
    Guid NodeId,
    string NodeTitle,
    string? Rationale);

public sealed record AreaResponse(Guid Id, string Name, string Description, int SortOrder, int DiagramCount, Guid? ParentId);

public sealed record SaveAreaRequest(string Name, string? Description, Guid? ParentId);

public sealed record SavedViewResponse(Guid Id, string Name, string Scope, Guid? AreaId, string? AreaName, bool Unassigned, string Query);

public sealed record CreateSavedViewRequest(string Name, string Scope, Guid? AreaId, bool Unassigned, string? Query);
