namespace Studio.Api.Contracts;

public sealed record CoverageRef(Guid Id, string Title, Guid? DiagramId, string? Path);

public sealed record CoverageWaiverInfo(string Reason, string AuthorName, DateTimeOffset CreatedAt, bool Superseded);

public sealed record CoverageCell(
    CoverageState State,
    IReadOnlyList<CoverageRef> Direct,
    IReadOnlyList<CoverageRef> Indirect,
    CoverageWaiverInfo? Waiver);

public sealed record CoverageItem(
    Guid Id,
    string Key,
    string Title,
    RequirementStatus Status,
    Guid? AreaId,
    CoverageCell Process,
    CoverageCell Screen,
    CoverageCell Component,
    CoverageCell Decision);

public sealed record CoverageResponse(
    int Total,
    int Page,
    int PageSize,
    int ProcessMissing,
    int ScreenMissing,
    int ComponentMissing,
    int DecisionMissing,
    IReadOnlyList<CoverageItem> Items);

public sealed record CoverageWaiverRequest(string Reason);

public sealed record CriterionInput(Guid? Id, string Text, bool Done);

public sealed record SaveCriteriaRequest(IReadOnlyList<CriterionInput>? Items);

public sealed record CriterionResponse(Guid Id, string Text, bool Done, int Position);

public sealed record OpenPointResponse(
    Guid Id,
    OpenPointKind Kind,
    string Title,
    string Detail,
    OpenPointStatus Status,
    Guid? ArtifactId,
    string? ArtifactTitle,
    DateTimeOffset UpdatedAt);

public sealed record OpenPointRequest(OpenPointKind Kind, string Title, string Detail, Guid? ArtifactId);

public sealed record OpenPointUpdate(OpenPointKind Kind, string Title, string Detail, OpenPointStatus Status, Guid? ArtifactId);

public sealed record DataFieldResponse(Guid Id, string Name, string FieldType, bool Required, string Notes, int Position);

public sealed record DataUseResponse(Guid Id, Guid ArtifactId, string ArtifactType, string ArtifactTitle, DataUseRole Role);

public sealed record DataEntityResponse(
    Guid Id,
    string Name,
    string Description,
    IReadOnlyList<DataFieldResponse> Fields,
    IReadOnlyList<DataUseResponse> Uses);

public sealed record DataEntityRequest(string Name, string Description);

public sealed record DataFieldRequest(string Name, string FieldType, bool Required, string Notes);

public sealed record DataUseRequest(Guid ArtifactId, DataUseRole Role);

public sealed record ContractResponse(
    Guid Id,
    string Name,
    Guid ProviderId,
    string ProviderName,
    Guid? ConsumerId,
    string? ConsumerName,
    string Operation,
    string Input,
    string Output,
    string Errors);

public sealed record ContractRequest(
    string Name,
    Guid ProviderId,
    Guid? ConsumerId,
    string Operation,
    string Input,
    string Output,
    string Errors);

public sealed record DeliveryRequirement(Guid Id, string Key, string Title, RequirementStatus Status);

public sealed record DeliverySlice(
    Guid Id,
    string Title,
    PackageStatus Status,
    int SortOrder,
    IReadOnlyList<DeliveryRequirement> Requirements);

public sealed record DeliveryResponse(IReadOnlyList<DeliverySlice> Slices, IReadOnlyList<DeliveryRequirement> Unassigned);

public sealed record DeliveryOrderRequest(IReadOnlyList<Guid>? Ids);
