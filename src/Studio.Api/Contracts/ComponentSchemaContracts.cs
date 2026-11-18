namespace Studio.Api.Contracts;

public sealed record SchemaColumnResponse(
    Guid Id,
    string Name,
    string DataType,
    bool Required,
    bool IsKey,
    string Role,
    string Notes,
    int Position);

public sealed record SchemaSectionResponse(
    Guid Id,
    ComponentSectionKind Kind,
    string Title,
    string Subtitle,
    string Description,
    int Position,
    IReadOnlyList<SchemaColumnResponse> Columns);

public sealed record SchemaSectionRequest(ComponentSectionKind Kind, string Title, string Subtitle, string Description);

public sealed record SchemaColumnRequest(string Name, string DataType, bool Required, bool IsKey, string Role, string Notes);
