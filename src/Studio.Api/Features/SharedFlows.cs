namespace Studio.Api.Features;

public static class SharedFlows
{
    public static async Task<IReadOnlyList<SharedComponentResponse>> AcrossProcesses(AppDbContext db, Guid projectId, CancellationToken ct)
    {
        var rows = await Load(db, projectId, null, ct);
        return Group(rows)
            .Where(item => item.Flows.Select(flow => flow.DiagramId).Distinct().Count() >= 2)
            .ToList();
    }

    public static async Task<IReadOnlyList<AffectedFlowResponse>> ForComponent(AppDbContext db, Guid projectId, Guid componentId, CancellationToken ct)
    {
        var rows = await Load(db, projectId, componentId, ct);
        return rows.Select(ToFlow).OrderBy(item => item.DiagramName).ThenBy(item => item.NodeTitle).ToList();
    }

    private static async Task<List<FlowRow>> Load(AppDbContext db, Guid projectId, Guid? componentId, CancellationToken ct)
    {
        var raw = await (
            from link in db.ArtifactLinks.AsNoTracking()
            join node in db.DiagramNodes.AsNoTracking() on new { Id = link.SourceArtifactId, link.ProjectId } equals new { Id = node.ArtifactId, node.ProjectId }
            join diagram in db.Diagrams.AsNoTracking() on new { Id = node.DiagramId, node.ProjectId } equals new { Id = diagram.ArtifactId, diagram.ProjectId }
            join component in db.Components.AsNoTracking() on new { Id = link.TargetArtifactId, link.ProjectId } equals new { Id = component.ArtifactId, component.ProjectId }
            where link.ProjectId == projectId
                && link.Relation == LinkRelation.Uses
                && diagram.Kind == DiagramKind.Process
                && (componentId == null || component.ArtifactId == componentId)
            select new
            {
                ComponentId = component.ArtifactId,
                ComponentName = component.Name,
                DiagramId = diagram.ArtifactId,
                DiagramName = diagram.Name,
                diagram.AreaId,
                NodeId = node.ArtifactId,
                NodeTitle = node.Title,
                link.Rationale,
            }
        ).ToListAsync(ct);
        var rows = raw.Select(item => new FlowRow(item.ComponentId, item.ComponentName, item.DiagramId, item.DiagramName, item.AreaId, item.NodeId, item.NodeTitle, item.Rationale)).ToList();

        var areaIds = rows.Where(item => item.AreaId is not null).Select(item => item.AreaId!.Value).Distinct().ToArray();
        var names = await db.Areas.AsNoTracking().Where(item => areaIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Name, ct);
        foreach (var row in rows)
        {
            if (row.AreaId is Guid areaId && names.TryGetValue(areaId, out var name))
            {
                row.AreaName = name;
            }
        }

        return rows;
    }

    private static List<SharedComponentResponse> Group(List<FlowRow> rows) =>
        rows.GroupBy(item => item.ComponentId)
            .Select(group => new SharedComponentResponse(
                group.Key,
                group.First().ComponentName,
                group.Select(ToFlow).OrderBy(item => item.DiagramName).ThenBy(item => item.NodeTitle).ToList()))
            .OrderBy(item => item.Name)
            .ToList();

    private static AffectedFlowResponse ToFlow(FlowRow row) =>
        new(row.DiagramId, row.DiagramName, row.AreaId, row.AreaName, row.NodeId, row.NodeTitle, row.Rationale);

    private sealed class FlowRow(Guid componentId, string componentName, Guid diagramId, string diagramName, Guid? areaId, Guid nodeId, string nodeTitle, string? rationale)
    {
        public Guid ComponentId { get; } = componentId;
        public string ComponentName { get; } = componentName;
        public Guid DiagramId { get; } = diagramId;
        public string DiagramName { get; } = diagramName;
        public Guid? AreaId { get; } = areaId;
        public string? AreaName { get; set; }
        public Guid NodeId { get; } = nodeId;
        public string NodeTitle { get; } = nodeTitle;
        public string? Rationale { get; } = rationale;
    }
}
