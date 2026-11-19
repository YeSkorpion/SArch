namespace Studio.Api.Contracts;

public sealed record UsageAlternate(Guid LinkId, string Relation, string RelationLabel);

public sealed record UsageHit(
    Guid ArtifactId,
    string Type,
    string Title,
    Guid? AreaId,
    string? AreaName,
    Guid? DiagramId,
    string Relation,
    string RelationLabel,
    string Direction,
    Guid LinkId,
    IReadOnlyList<UsageAlternate> Alternates,
    bool Cycle,
    bool Expandable);

public sealed record UsageResponse(
    Guid ArtifactId,
    IReadOnlyList<UsageHit> Uses,
    IReadOnlyList<UsageHit> UsedBy,
    int UsesTotal,
    int UsedByTotal,
    bool UsesHasMore,
    bool UsedByHasMore);

public sealed record PackageSummary(
    Guid Id,
    string Title,
    string Goal,
    Guid? AreaId,
    string? AreaName,
    Guid OwnerId,
    string OwnerName,
    Guid? ReviewerId,
    string? ReviewerName,
    PackageStatus Status,
    int Version,
    bool ReviewStale,
    DateTimeOffset UpdatedAt);

public sealed record PackageItemResponse(
    Guid Id,
    Guid ArtifactId,
    string ArtifactType,
    string ArtifactTitle,
    Guid? DiagramId,
    string Note,
    bool Missing);

public sealed record PackageCommentResponse(
    Guid Id,
    Guid? ArtifactId,
    string TargetType,
    string TargetTitle,
    Guid? DiagramId,
    string AuthorName,
    string Text,
    CommentStatus Status,
    DateTimeOffset CreatedAt,
    bool Missing,
    Guid? AssigneeId,
    string? AssigneeName);

public sealed record PackageDecisionResponse(
    Guid Id,
    Guid SnapshotId,
    string Action,
    string Reason,
    string ActorName,
    DateTimeOffset CreatedAt);

public sealed record PackageDetailResponse(
    Guid Id,
    string Title,
    string Goal,
    Guid? AreaId,
    string? AreaName,
    Guid OwnerId,
    string OwnerName,
    Guid? ReviewerId,
    string? ReviewerName,
    PackageStatus Status,
    int Version,
    bool ReviewStale,
    Guid? ReviewSnapshotId,
    Guid? ApprovedSnapshotId,
    IReadOnlyList<PackageItemResponse> Items,
    IReadOnlyList<PackageCommentResponse> Comments,
    IReadOnlyList<PackageDecisionResponse> Decisions);

public sealed record CreatePackageRequest(string Title, string Goal, Guid? AreaId, Guid OwnerId, Guid? ReviewerId);

public sealed record UpdatePackageRequest(int Version, string Title, string Goal, Guid? AreaId, Guid OwnerId, Guid? ReviewerId);

public sealed record AddPackageItemRequest(int Version, Guid ArtifactId, string Note);

public sealed record RemovePackageItemRequest(int Version, Guid ItemId);

public sealed record PackageCommentRequest(int Version, string Text, Guid? ArtifactId, Guid? AssigneeId);

public sealed record CommentStatusRequest(int Version, CommentStatus Status);

public sealed record ReviewActionRequest(int Version, string? Reason);

public sealed record ArtifactReviewComment(
    Guid Id,
    Guid PackageId,
    string PackageTitle,
    string Text,
    string AuthorName,
    DateTimeOffset CreatedAt);

public sealed record SnapshotSummary(
    Guid Id,
    string Name,
    string Scope,
    Guid? PackageId,
    string CreatedByName,
    DateTimeOffset CreatedAt);

public sealed record CreateSnapshotRequest(string Name);

public sealed record SnapshotDetailResponse(
    Guid Id,
    string Name,
    string Scope,
    Guid? PackageId,
    string CreatedByName,
    DateTimeOffset CreatedAt,
    SnapshotDocument Document,
    IReadOnlyList<Guid> LiveIds);

public sealed record CompareResponse(Guid LeftId, Guid RightId, IReadOnlyList<SnapshotChange> Changes);

public sealed record HandoverResponse(string Markdown);

public sealed class TransferFile
{
    public string? Format { get; set; }
    public int Version { get; set; }
    public DateTimeOffset ExportedAt { get; set; }
    public TransferProject? Project { get; set; }
    public List<TransferArea> Areas { get; set; } = [];
    public List<TransferRequirement> Requirements { get; set; } = [];
    public List<TransferDiagram> Diagrams { get; set; } = [];
    public List<TransferNode> Nodes { get; set; } = [];
    public List<TransferEdge> Edges { get; set; } = [];
    public List<TransferComponent> Components { get; set; } = [];
    public List<TransferScreen> Screens { get; set; } = [];
    public List<TransferNavigation> Navigations { get; set; } = [];
    public List<TransferDocument> Documents { get; set; } = [];
    public List<TransferRevision> Revisions { get; set; } = [];
    public List<TransferLink> Links { get; set; } = [];
    public List<TransferView> Views { get; set; } = [];
    public List<TransferPackage> Packages { get; set; } = [];
    public List<TransferPackageItem> PackageItems { get; set; } = [];
    public List<TransferComment> Comments { get; set; } = [];
    public List<TransferDecision> Decisions { get; set; } = [];
    public List<TransferSnapshot> Snapshots { get; set; } = [];
}

public sealed class TransferProject
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
}

public sealed class TransferArea
{
    public Guid Id { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int SortOrder { get; set; }
}

public sealed class TransferRequirement
{
    public Guid Id { get; set; }
    public string Key { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Status { get; set; } = "";
    public string Priority { get; set; } = "";
    public List<string> Tags { get; set; } = [];
}

public sealed class TransferDiagram
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Kind { get; set; } = "";
    public Guid? AreaId { get; set; }
}

public sealed class TransferNode
{
    public Guid Id { get; set; }
    public Guid DiagramId { get; set; }
    public string NodeType { get; set; } = "";
    public string Title { get; set; } = "";
    public double X { get; set; }
    public double Y { get; set; }
    public Guid? ComponentId { get; set; }
    public string? Description { get; set; }
    public string? EventName { get; set; }
    public string? Color { get; set; }
    public string? Comment { get; set; }
}

public sealed class TransferEdge
{
    public Guid Id { get; set; }
    public Guid DiagramId { get; set; }
    public Guid SourceId { get; set; }
    public Guid TargetId { get; set; }
    public string Kind { get; set; } = "";
    public string? Label { get; set; }
    public string? Condition { get; set; }
    public string? Protocol { get; set; }
    public string? Color { get; set; }
}

public sealed class TransferComponent
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Kind { get; set; } = "";
    public string? Technology { get; set; }
}

public sealed class TransferScreen
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Route { get; set; } = "";
    public string Purpose { get; set; } = "";
    public string Status { get; set; } = "";
    public string Notes { get; set; } = "";
    public string WireframeJson { get; set; } = "";
}

public sealed class TransferNavigation
{
    public Guid Id { get; set; }
    public Guid SourceScreenId { get; set; }
    public string ElementId { get; set; } = "";
    public Guid TargetScreenId { get; set; }
}

public sealed class TransferDocument
{
    public Guid Id { get; set; }
    public Guid? ParentId { get; set; }
    public string Title { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Status { get; set; } = "";
    public string ContentJson { get; set; } = "";
    public int SortOrder { get; set; }
}

public sealed class TransferRevision
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public int Number { get; set; }
    public string Title { get; set; } = "";
    public string Status { get; set; } = "";
    public string ContentJson { get; set; } = "";
    public string AuthorName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class TransferLink
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public Guid TargetId { get; set; }
    public string Relation { get; set; } = "";
    public string? Rationale { get; set; }
}

public sealed class TransferView
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Scope { get; set; } = "";
    public Guid? AreaId { get; set; }
    public bool Unassigned { get; set; }
    public string Query { get; set; } = "";
}

public sealed class TransferPackage
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "";
    public string Goal { get; set; } = "";
    public Guid? AreaId { get; set; }
    public string OwnerName { get; set; } = "";
    public string? ReviewerName { get; set; }
    public string Status { get; set; } = "";
    public Guid? ReviewSnapshotId { get; set; }
    public Guid? ApprovedSnapshotId { get; set; }
}

public sealed class TransferPackageItem
{
    public Guid Id { get; set; }
    public Guid PackageId { get; set; }
    public Guid ArtifactId { get; set; }
    public string ArtifactType { get; set; } = "";
    public string ArtifactTitle { get; set; } = "";
    public Guid? DiagramId { get; set; }
    public string Note { get; set; } = "";
}

public sealed class TransferComment
{
    public Guid Id { get; set; }
    public Guid PackageId { get; set; }
    public Guid? SnapshotId { get; set; }
    public Guid? ArtifactId { get; set; }
    public string TargetType { get; set; } = "";
    public string TargetTitle { get; set; } = "";
    public Guid? DiagramId { get; set; }
    public string AuthorName { get; set; } = "";
    public string Text { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class TransferDecision
{
    public Guid Id { get; set; }
    public Guid PackageId { get; set; }
    public Guid SnapshotId { get; set; }
    public string Action { get; set; } = "";
    public string Reason { get; set; } = "";
    public string ActorName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class TransferSnapshot
{
    public Guid Id { get; set; }
    public Guid? PackageId { get; set; }
    public string Name { get; set; } = "";
    public string Scope { get; set; } = "";
    public string CreatedByName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string ContentHash { get; set; } = "";
    public string PayloadJson { get; set; } = "{}";
}

public sealed record TransferSummary(
    int Areas,
    int Requirements,
    int Diagrams,
    int Nodes,
    int Screens,
    int Components,
    int Documents,
    int Revisions,
    int Links,
    int Packages,
    int Snapshots);

public sealed record TransferPreview(bool Valid, IReadOnlyList<string> Errors, TransferSummary Summary);
