namespace Studio.Api.Domain;

public enum ProjectRole
{
    Owner,
    Editor,
    Viewer,
}

public enum ArtifactType
{
    Requirement,
    Diagram,
    DiagramNode,
    Screen,
    Component,
    Document,
}

public enum RequirementStatus
{
    Offen,
    InBearbeitung,
    Erledigt,
    Zurueckgestellt,
}

public enum RequirementPriority
{
    Niedrig,
    Mittel,
    Hoch,
    Kritisch,
}

public enum DiagramKind
{
    Process,
    System,
}

public enum EdgeKind
{
    Sequence,
    Dependency,
    DataFlow,
}

public enum ComponentKind
{
    Client,
    Api,
    Service,
    Database,
    Queue,
    External,
}

public enum ScreenStatus
{
    Entwurf,
    Review,
    Abgestimmt,
}

public enum DocumentKind
{
    Page,
    Decision,
}

public enum DocumentStatus
{
    Entwurf,
    Vorgeschlagen,
    Akzeptiert,
    Abgeloest,
}

public enum LinkRelation
{
    Satisfies,
    Uses,
    Triggers,
    Documents,
}

public enum PackageStatus
{
    Entwurf,
    InPruefung,
    Freigegeben,
}

public enum CommentStatus
{
    Offen,
    Erledigt,
}
