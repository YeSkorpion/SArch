namespace Studio.Api.Domain;

public static class LinkRules
{
    public static string? Validate(
        ArtifactType sourceType,
        string? sourceNodeType,
        ArtifactType targetType,
        string? targetNodeType,
        LinkRelation relation)
    {
        var allowed = relation switch
        {
            LinkRelation.Satisfies =>
                (sourceType == ArtifactType.DiagramNode && DiagramRules.IsProcessStep(sourceNodeType ?? "") && targetType == ArtifactType.Requirement)
                || (sourceType == ArtifactType.Screen && targetType == ArtifactType.Requirement)
                || (sourceType == ArtifactType.Component && targetType == ArtifactType.Requirement),
            LinkRelation.Uses =>
                sourceType == ArtifactType.DiagramNode
                && DiagramRules.IsProcessStep(sourceNodeType ?? "")
                && targetType is ArtifactType.Screen or ArtifactType.Component,
            LinkRelation.Triggers =>
                sourceType == ArtifactType.DiagramNode
                && sourceNodeType == "action"
                && targetType == ArtifactType.DiagramNode
                && targetNodeType == "event",
            LinkRelation.Documents => sourceType == ArtifactType.Document && targetType != ArtifactType.Document || sourceType == ArtifactType.Document,
            _ => false,
        };

        if (relation == LinkRelation.Documents)
        {
            allowed = sourceType == ArtifactType.Document;
        }

        return allowed
            ? null
            : "Diese Verknüpfung ist zwischen den gewählten Artefakten nicht zulässig.";
    }
}
