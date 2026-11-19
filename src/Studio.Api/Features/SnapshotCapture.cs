namespace Studio.Api.Features;

public static class SnapshotCapture
{
    public static async Task<SnapshotDocument> Project(AppDbContext db, Guid projectId, CancellationToken ct)
    {
        var document = new SnapshotDocument { Scope = "project" };
        await AddArtifacts(db, projectId, document, null, ct);
        document.Links = await db.ArtifactLinks.AsNoTracking().Where(item => item.ProjectId == projectId)
            .Select(item => new SnapshotLink { Id = item.Id, SourceId = item.SourceArtifactId, TargetId = item.TargetArtifactId, Relation = item.Relation.ToString(), Rationale = item.Rationale })
            .ToListAsync(ct);
        return SnapshotJson.Normalize(document);
    }

    public static async Task<SnapshotDocument> Package(AppDbContext db, Guid projectId, IReadOnlyCollection<Guid> artifactIds, CancellationToken ct)
    {
        var ids = artifactIds.ToHashSet();
        var nodes = await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId && ids.Contains(item.ArtifactId)).ToListAsync(ct);
        foreach (var node in nodes)
        {
            ids.Add(node.DiagramId);
        }

        var nodeIds = nodes.Select(item => item.ArtifactId).ToHashSet();
        var edges = nodeIds.Count == 0
            ? []
            : await db.DiagramEdges.AsNoTracking().Where(item => item.ProjectId == projectId && (nodeIds.Contains(item.SourceNodeId) || nodeIds.Contains(item.TargetNodeId))).ToListAsync(ct);
        var links = await db.ArtifactLinks.AsNoTracking().Where(item => item.ProjectId == projectId && (ids.Contains(item.SourceArtifactId) || ids.Contains(item.TargetArtifactId))).ToListAsync(ct);
        foreach (var link in links)
        {
            ids.Add(link.SourceArtifactId);
            ids.Add(link.TargetArtifactId);
        }

        var document = new SnapshotDocument { Scope = "package" };
        await AddArtifacts(db, projectId, document, ids, ct);
        var edgeIds = new HashSet<Guid>(edges.Select(item => item.Id));
        document.Artifacts.RemoveAll(item => item.Type == "edge" && !edgeIds.Contains(item.Id));
        document.Links = links.Select(item => new SnapshotLink { Id = item.Id, SourceId = item.SourceArtifactId, TargetId = item.TargetArtifactId, Relation = item.Relation.ToString(), Rationale = item.Rationale }).ToList();
        return SnapshotJson.Normalize(document);
    }

    private static async Task AddArtifacts(AppDbContext db, Guid projectId, SnapshotDocument document, HashSet<Guid>? only, CancellationToken ct)
    {
        var areas = await db.Areas.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.Id, item => item.Name, ct);
        bool Keep(Guid id) => only is null || only.Contains(id);

        foreach (var item in await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct))
        {
            if (!Keep(item.ArtifactId)) continue;
            document.Artifacts.Add(new SnapshotArtifact { Id = item.ArtifactId, Type = "requirement", Title = $"{item.Key} {item.Title}", Status = item.Status.ToString(), Content = item.Description });
        }

        var diagrams = await db.Diagrams.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct);
        foreach (var item in diagrams)
        {
            if (!Keep(item.ArtifactId)) continue;
            document.Artifacts.Add(new SnapshotArtifact
            {
                Id = item.ArtifactId,
                Type = "diagram",
                Title = item.Name,
                Content = item.Description,
                Kind = item.Kind.ToString(),
                AreaId = item.AreaId,
                AreaName = item.AreaId is Guid areaId ? areas.GetValueOrDefault(areaId) : null,
            });
        }

        var diagramNames = diagrams.ToDictionary(item => item.ArtifactId, item => item.Name);
        var diagramAreas = diagrams.ToDictionary(item => item.ArtifactId, item => item.AreaId);
        foreach (var item in await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct))
        {
            if (!Keep(item.ArtifactId)) continue;
            var areaId = diagramAreas.GetValueOrDefault(item.DiagramId);
            document.Artifacts.Add(new SnapshotArtifact
            {
                Id = item.ArtifactId,
                Type = "node",
                Title = string.IsNullOrWhiteSpace(item.Title) ? item.NodeType : item.Title,
                Content = item.Description,
                NodeType = item.NodeType,
                DiagramId = item.DiagramId,
                DiagramName = diagramNames.GetValueOrDefault(item.DiagramId),
                AreaId = areaId,
                AreaName = areaId is Guid area ? areas.GetValueOrDefault(area) : null,
                X = item.PositionX,
                Y = item.PositionY,
                Color = item.Color,
                Comment = item.Comment,
            });
        }

        foreach (var item in await db.DiagramEdges.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct))
        {
            if (only is not null && !only.Contains(item.SourceNodeId) && !only.Contains(item.TargetNodeId)) continue;
            document.Artifacts.Add(new SnapshotArtifact
            {
                Id = item.Id,
                Type = "edge",
                Title = item.Label ?? item.Condition ?? "Kante",
                Kind = item.Kind.ToString(),
                Label = item.Label,
                Condition = item.Condition,
                Content = item.Protocol,
                SourceId = item.SourceNodeId,
                TargetId = item.TargetNodeId,
                DiagramId = item.DiagramId,
                Color = item.Color,
            });
        }

        foreach (var item in await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct))
        {
            if (!Keep(item.ArtifactId)) continue;
            document.Artifacts.Add(new SnapshotArtifact { Id = item.ArtifactId, Type = "screen", Title = item.Name, Status = item.Status.ToString(), Content = item.Purpose, WireframeJson = item.WireframeJson, Label = item.Route });
        }

        foreach (var item in await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct))
        {
            if (!Keep(item.ArtifactId)) continue;
            document.Artifacts.Add(new SnapshotArtifact { Id = item.ArtifactId, Type = "component", Title = item.Name, Content = item.Description, Kind = item.Kind.ToString() });
        }

        foreach (var item in await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct))
        {
            if (!Keep(item.ArtifactId)) continue;
            document.Artifacts.Add(new SnapshotArtifact { Id = item.ArtifactId, Type = item.Kind == DocumentKind.Decision ? "decision" : "document", Title = item.Title, Status = item.Status.ToString(), ContentJson = item.ContentJson, Kind = item.Kind.ToString() });
        }
    }
}
