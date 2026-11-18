namespace Studio.Api.Domain;

public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = "";
}

public sealed class Project
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public bool IsArchived { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public int Version { get; set; } = 1;
    public long ContentRevision { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<ProjectMembership> Memberships { get; set; } = [];
}

public sealed class ProjectPresence
{
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = "";
    public string Label { get; set; } = "";
    public Guid? ArtifactId { get; set; }
    public DateTimeOffset SeenAt { get; set; }
}

public sealed class ProjectMembership
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public ProjectRole Role { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Project Project { get; set; } = null!;
    public AppUser User { get; set; } = null!;
}

public sealed class ProjectCounter
{
    public Guid ProjectId { get; set; }
    public int NextRequirement { get; set; }
}

public sealed class Artifact
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public ArtifactType Type { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Project Project { get; set; } = null!;
}

public sealed class Requirement
{
    public Guid ArtifactId { get; set; }
    public Guid ProjectId { get; set; }
    public string Key { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public RequirementStatus Status { get; set; } = RequirementStatus.Offen;
    public RequirementPriority Priority { get; set; } = RequirementPriority.Mittel;
    public List<string> Tags { get; set; } = [];
    public Guid? AreaId { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string SearchText { get; set; } = "";
    public Artifact Artifact { get; set; } = null!;
}

public sealed class Diagram
{
    public Guid ArtifactId { get; set; }
    public Guid ProjectId { get; set; }
    public DiagramKind Kind { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string SearchText { get; set; } = "";
    public Guid? AreaId { get; set; }
    public Artifact Artifact { get; set; } = null!;
    public List<DiagramNode> Nodes { get; set; } = [];
    public List<DiagramEdge> Edges { get; set; } = [];
}

public sealed class DiagramNode
{
    public Guid ArtifactId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid DiagramId { get; set; }
    public string NodeType { get; set; } = "";
    public string Title { get; set; } = "";
    public double PositionX { get; set; }
    public double PositionY { get; set; }
    public Guid? ComponentId { get; set; }
    public string? Description { get; set; }
    public string? EventName { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string SearchText { get; set; } = "";
    public Artifact Artifact { get; set; } = null!;
    public Diagram Diagram { get; set; } = null!;
    public Component? Component { get; set; }
}

public sealed class DiagramEdge
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid DiagramId { get; set; }
    public Guid SourceNodeId { get; set; }
    public Guid TargetNodeId { get; set; }
    public EdgeKind Kind { get; set; }
    public string? Label { get; set; }
    public string? Condition { get; set; }
    public string? Protocol { get; set; }
}

public sealed class Component
{
    public Guid ArtifactId { get; set; }
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public ComponentKind Kind { get; set; }
    public string? Technology { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string SearchText { get; set; } = "";
    public Artifact Artifact { get; set; } = null!;
}

public sealed class Screen
{
    public Guid ArtifactId { get; set; }
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
    public string Route { get; set; } = "";
    public string Purpose { get; set; } = "";
    public ScreenStatus Status { get; set; } = ScreenStatus.Entwurf;
    public string Notes { get; set; } = "";
    public string WireframeJson { get; set; } = """{"version":1,"desktop":{"elements":[]},"mobile":{"elements":[]}}""";
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string SearchText { get; set; } = "";
    public Artifact Artifact { get; set; } = null!;
}

public sealed class ScreenNavigation
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid SourceScreenId { get; set; }
    public string ElementId { get; set; } = "";
    public Guid TargetScreenId { get; set; }
}

public sealed class Document
{
    public Guid ArtifactId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? ParentId { get; set; }
    public string Title { get; set; } = "";
    public DocumentKind Kind { get; set; }
    public DocumentStatus Status { get; set; }
    public string ContentJson { get; set; } = """{"type":"doc","content":[{"type":"paragraph"}]}""";
    public int Version { get; set; } = 1;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string SearchText { get; set; } = "";
    public Artifact Artifact { get; set; } = null!;
    public Document? Parent { get; set; }
}

public sealed class DocumentRevision
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public Guid ProjectId { get; set; }
    public int Number { get; set; }
    public string Title { get; set; } = "";
    public DocumentStatus Status { get; set; }
    public string ContentJson { get; set; } = "";
    public Guid AuthorId { get; set; }
    public string? AuthorName { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ArtifactLink
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid SourceArtifactId { get; set; }
    public Guid TargetArtifactId { get; set; }
    public LinkRelation Relation { get; set; }
    public string? Rationale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class Area
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class SavedView
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
    public string Scope { get; set; } = "processes";
    public Guid? AreaId { get; set; }
    public bool Unassigned { get; set; }
    public string Query { get; set; } = "";
    public Guid CreatedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ChangePackage
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public string Title { get; set; } = "";
    public string Goal { get; set; } = "";
    public Guid? AreaId { get; set; }
    public Guid OwnerId { get; set; }
    public Guid? ReviewerId { get; set; }
    public PackageStatus Status { get; set; } = PackageStatus.Entwurf;
    public int SortOrder { get; set; }
    public int Version { get; set; } = 1;
    public Guid? ReviewSnapshotId { get; set; }
    public Guid? ApprovedSnapshotId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class ChangePackageItem
{
    public Guid Id { get; set; }
    public Guid PackageId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid ArtifactId { get; set; }
    public string ArtifactType { get; set; } = "";
    public string ArtifactTitle { get; set; } = "";
    public Guid? DiagramId { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PackageComment
{
    public Guid Id { get; set; }
    public Guid PackageId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? SnapshotId { get; set; }
    public Guid? ArtifactId { get; set; }
    public string TargetType { get; set; } = "";
    public string TargetTitle { get; set; } = "";
    public Guid? DiagramId { get; set; }
    public Guid AuthorId { get; set; }
    public string AuthorName { get; set; } = "";
    public Guid? AssigneeId { get; set; }
    public string Text { get; set; } = "";
    public CommentStatus Status { get; set; } = CommentStatus.Offen;
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PackageDecision
{
    public Guid Id { get; set; }
    public Guid PackageId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid SnapshotId { get; set; }
    public string Action { get; set; } = "";
    public string Reason { get; set; } = "";
    public Guid ActorId { get; set; }
    public string ActorName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ProjectSnapshot
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? PackageId { get; set; }
    public string Name { get; set; } = "";
    public string Scope { get; set; } = "project";
    public Guid CreatedById { get; set; }
    public string CreatedByName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string ContentHash { get; set; } = "";
    public string PayloadJson { get; set; } = "{}";
}

public sealed class RequirementCriterion
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid RequirementId { get; set; }
    public int Position { get; set; }
    public string Text { get; set; } = "";
    public bool Done { get; set; }
}

public sealed class OpenPoint
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public OpenPointKind Kind { get; set; }
    public string Title { get; set; } = "";
    public string Detail { get; set; } = "";
    public OpenPointStatus Status { get; set; } = OpenPointStatus.Offen;
    public Guid? ArtifactId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class DataEntity
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class DataField
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid EntityId { get; set; }
    public int Position { get; set; }
    public string Name { get; set; } = "";
    public string FieldType { get; set; } = "";
    public bool Required { get; set; }
    public string Notes { get; set; } = "";
}

public sealed class DataUse
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid EntityId { get; set; }
    public Guid ArtifactId { get; set; }
    public DataUseRole Role { get; set; }
}

public sealed class ComponentSection
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid ComponentId { get; set; }
    public ComponentSectionKind Kind { get; set; }
    public int Position { get; set; }
    public string Title { get; set; } = "";
    public string Subtitle { get; set; } = "";
    public string Description { get; set; } = "";
}

public sealed class ComponentColumn
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid SectionId { get; set; }
    public int Position { get; set; }
    public string Name { get; set; } = "";
    public string DataType { get; set; } = "";
    public bool Required { get; set; }
    public bool IsKey { get; set; }
    public string Role { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed class ServiceContract
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
    public Guid ProviderId { get; set; }
    public Guid? ConsumerId { get; set; }
    public string Operation { get; set; } = "";
    public string Input { get; set; } = "";
    public string Output { get; set; } = "";
    public string Errors { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class CoverageWaiver
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid RequirementId { get; set; }
    public CoverageKind Kind { get; set; }
    public string Reason { get; set; } = "";
    public Guid AuthorId { get; set; }
    public string AuthorName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ArtifactSource
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid ArtifactId { get; set; }
    public SourceKind Kind { get; set; }
    public string Title { get; set; } = "";
    public string Target { get; set; } = "";
    public DateTimeOffset? CheckedAt { get; set; }
    public Guid? CheckedById { get; set; }
    public string? CheckedByName { get; set; }
    public string? CheckedReference { get; set; }
    public string? CheckedTarget { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class FlowEntry
{
    public Guid DiagramId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid NodeId { get; set; }
    public Guid ScreenId { get; set; }
}

public sealed class CatalogTable
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? AreaId { get; set; }
    public string SourceName { get; set; } = "";
    public string Name { get; set; } = "";
    public string Purpose { get; set; } = "";
    public Guid? DocumentId { get; set; }
}

public sealed class CatalogColumn
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid TableId { get; set; }
    public int Position { get; set; }
    public string Name { get; set; } = "";
    public bool IsPrimaryKey { get; set; }
    public Guid? ForeignTableId { get; set; }
    public string Notes { get; set; } = "";
}
