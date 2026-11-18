namespace Studio.Api.Features;

public static class CoverageReader
{
    public const string ScreenPath = "Anforderung → Prozessschritt → Screen";
    public const string ComponentPath = "Anforderung → Prozessschritt → Komponente";
    public const string DecisionPath = "Anforderung → Prozessschritt → Entscheidung";
    public const string ProcessPath = "Anforderung → Screen → Prozessschritt";

    public static async Task<List<CoverageItem>> Build(AppDbContext db, Guid projectId, CancellationToken ct)
    {
        var requirements = await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Key).ToListAsync(ct);
        var links = await db.ArtifactLinks.AsNoTracking()
            .Where(item => item.ProjectId == projectId && (item.Relation == LinkRelation.Satisfies || item.Relation == LinkRelation.Uses || item.Relation == LinkRelation.Documents))
            .ToListAsync(ct);
        var nodes = await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var screens = await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        var components = await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        var decisions = await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId && item.Kind == DocumentKind.Decision).ToDictionaryAsync(item => item.ArtifactId, item => item.Title, ct);
        var waivers = await db.CoverageWaivers.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var nodeById = nodes.ToDictionary(item => item.ArtifactId);

        return requirements.Select(requirement =>
        {
            var incoming = links.Where(item => item.TargetArtifactId == requirement.ArtifactId).ToList();
            var directSteps = Distinct(incoming
                .Where(item => item.Relation == LinkRelation.Satisfies && nodeById.TryGetValue(item.SourceArtifactId, out var node) && DiagramRules.IsProcessStep(node.NodeType))
                .Select(item =>
                {
                    var node = nodeById[item.SourceArtifactId];
                    return new CoverageRef(node.ArtifactId, node.Title, node.DiagramId, null);
                }));
            var directScreens = Distinct(incoming.Where(item => item.Relation == LinkRelation.Satisfies && screens.ContainsKey(item.SourceArtifactId)).Select(item => new CoverageRef(item.SourceArtifactId, screens[item.SourceArtifactId], null, null)));
            var directComponents = Distinct(incoming.Where(item => item.Relation == LinkRelation.Satisfies && components.ContainsKey(item.SourceArtifactId)).Select(item => new CoverageRef(item.SourceArtifactId, components[item.SourceArtifactId], null, null)));
            var directDecisions = Distinct(incoming.Where(item => item.Relation == LinkRelation.Documents && decisions.ContainsKey(item.SourceArtifactId)).Select(item => new CoverageRef(item.SourceArtifactId, decisions[item.SourceArtifactId], null, null)));
            var stepIds = directSteps.Select(item => item.Id).ToHashSet();
            var indirectScreens = new List<CoverageRef>();
            var indirectComponents = new List<CoverageRef>();
            var indirectDecisions = new List<CoverageRef>();
            foreach (var stepId in stepIds)
            {
                indirectScreens.AddRange(links.Where(item => item.SourceArtifactId == stepId && item.Relation == LinkRelation.Uses && screens.ContainsKey(item.TargetArtifactId) && directScreens.All(screen => screen.Id != item.TargetArtifactId))
                    .Select(item => new CoverageRef(item.TargetArtifactId, screens[item.TargetArtifactId], null, ScreenPath)));
                indirectComponents.AddRange(links.Where(item => item.SourceArtifactId == stepId && item.Relation == LinkRelation.Uses && components.ContainsKey(item.TargetArtifactId) && directComponents.All(component => component.Id != item.TargetArtifactId))
                    .Select(item => new CoverageRef(item.TargetArtifactId, components[item.TargetArtifactId], null, ComponentPath)));
                indirectDecisions.AddRange(links.Where(item => item.TargetArtifactId == stepId && item.Relation == LinkRelation.Documents && decisions.ContainsKey(item.SourceArtifactId) && directDecisions.All(decision => decision.Id != item.SourceArtifactId))
                    .Select(item => new CoverageRef(item.SourceArtifactId, decisions[item.SourceArtifactId], null, DecisionPath)));
            }

            var indirectSteps = new List<CoverageRef>();
            foreach (var screen in directScreens)
            {
                indirectSteps.AddRange(links.Where(item => item.Relation == LinkRelation.Uses && item.TargetArtifactId == screen.Id && nodeById.TryGetValue(item.SourceArtifactId, out var node) && DiagramRules.IsProcessStep(node.NodeType) && directSteps.All(step => step.Id != item.SourceArtifactId))
                    .Select(item =>
                    {
                        var node = nodeById[item.SourceArtifactId];
                        return new CoverageRef(node.ArtifactId, node.Title, node.DiagramId, ProcessPath);
                    }));
            }

            return new CoverageItem(
                requirement.ArtifactId,
                requirement.Key,
                requirement.Title,
                requirement.Status,
                requirement.AreaId,
                Cell(requirement.ArtifactId, CoverageKind.Process, directSteps, indirectSteps),
                Cell(requirement.ArtifactId, CoverageKind.Screen, directScreens, indirectScreens),
                Cell(requirement.ArtifactId, CoverageKind.Component, directComponents, indirectComponents),
                Cell(requirement.ArtifactId, CoverageKind.Decision, directDecisions, indirectDecisions));
        }).ToList();

        CoverageCell Cell(Guid requirementId, CoverageKind kind, IEnumerable<CoverageRef> direct, IEnumerable<CoverageRef> indirect)
        {
            var linked = Distinct(direct);
            var waiver = waivers.FirstOrDefault(item => item.RequirementId == requirementId && item.Kind == kind);
            return new CoverageCell(
                CoverageEvaluation.Resolve(linked.Count, waiver is not null),
                linked,
                Distinct(indirect),
                waiver is null ? null : new CoverageWaiverInfo(waiver.Reason, waiver.AuthorName, waiver.CreatedAt, linked.Count > 0));
        }
    }

    public static bool MatchesArea(CoverageItem item, Guid areaId, IReadOnlyDictionary<Guid, Guid?> diagramAreas)
    {
        if (item.AreaId == areaId)
        {
            return true;
        }

        return item.Process.Direct.Any(step => step.DiagramId is Guid diagramId && diagramAreas.TryGetValue(diagramId, out var area) && area == areaId);
    }

    private static List<CoverageRef> Distinct(IEnumerable<CoverageRef> links) =>
        links.GroupBy(item => item.Id).Select(group => group.First()).ToList();
}
