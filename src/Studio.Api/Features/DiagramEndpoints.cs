namespace Studio.Api.Features;

public static class DiagramEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/diagrams", List);
        group.MapPost("/projects/{projectId:guid}/diagrams", Create);
        group.MapGet("/projects/{projectId:guid}/diagrams/{diagramId:guid}", Get);
        group.MapPut("/projects/{projectId:guid}/diagrams/{diagramId:guid}", Save);
        group.MapDelete("/projects/{projectId:guid}/diagrams/{diagramId:guid}", Delete);
    }

    private static async Task<IResult> List(ProjectGuard guard, AppDbContext db, Guid projectId, DiagramKind? kind, Guid? areaId, bool? unassigned, string? q, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var query = db.Diagrams.AsNoTracking().Where(item => item.ProjectId == projectId);
        if (kind is not null)
        {
            query = query.Where(item => item.Kind == kind);
        }

        if (unassigned == true)
        {
            query = query.Where(item => item.AreaId == null);
        }
        else if (areaId is Guid selected)
        {
            query = query.Where(item => item.AreaId == selected);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = RequirementEndpoints.LikePattern(q);
            query = query.Where(item => EF.Functions.ILike(item.Name, pattern, "\\") || EF.Functions.ILike(item.Description, pattern, "\\"));
        }

        var diagrams = await query.OrderBy(item => item.Name).ThenBy(item => item.ArtifactId).ToListAsync(ct);
        var areaIds = diagrams.Where(item => item.AreaId is not null).Select(item => item.AreaId!.Value).Distinct().ToArray();
        var areas = await db.Areas.AsNoTracking().Where(item => areaIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Name, ct);
        var items = diagrams.Select(item => new DiagramSummaryResponse(
            item.ArtifactId,
            item.Kind,
            item.Name,
            item.Description,
            item.Version,
            item.UpdatedAt,
            item.AreaId,
            item.AreaId is Guid id && areas.TryGetValue(id, out var areaName) ? areaName : null)).ToList();
        return Results.Ok(items);
    }

    private static async Task<IResult> Create(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateDiagramRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateMeta(http, body.Name, body.Description);
        if (invalid is not null)
        {
            return invalid;
        }

        if (await AssignArea(db, http, projectId, body.AreaId, ct) is IResult areaError)
        {
            return areaError;
        }

        var now = clock.GetUtcNow();
        var artifact = Artifacts.Create(projectId, ArtifactType.Diagram, now);
        var diagram = new Diagram
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            Kind = body.Kind,
            Name = body.Name.Trim(),
            Description = body.Description?.Trim() ?? "",
            AreaId = body.AreaId,
            CreatedAt = now,
            UpdatedAt = now,
            SearchText = SearchText.Build(body.Name, body.Description),
        };
        db.Artifacts.Add(artifact);
        db.Diagrams.Add(diagram);
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        return Results.Created($"/api/v1/projects/{projectId}/diagrams/{diagram.ArtifactId}", await Project(db, diagram, ct));
    }

    private static async Task<IResult> Get(ProjectGuard guard, AppDbContext db, Guid projectId, Guid diagramId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var diagram = await db.Diagrams.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == diagramId, ct);
        return diagram is null ? Problems.NotFound(http) : Results.Ok(await Project(db, diagram, ct));
    }

    private static async Task<IResult> Save(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid diagramId, SaveDiagramRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateMeta(http, body.Name, body.Description);
        if (invalid is not null)
        {
            return invalid;
        }

        if (body.Nodes is null || body.Edges is null)
        {
            return Problems.BadRequest(http, "Knoten und Kanten müssen mitgesendet werden.");
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var diagram = await db.Diagrams.FromSqlInterpolated($"SELECT * FROM diagrams WHERE artifact_id = {diagramId} AND project_id = {projectId} FOR UPDATE").AsTracking().FirstOrDefaultAsync(ct);
        if (diagram is null)
        {
            return Problems.NotFound(http);
        }

        if (diagram.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", diagram.Version);
        }

        if (await AssignArea(db, http, projectId, body.AreaId, ct) is IResult areaError)
        {
            return areaError;
        }

        diagram.AreaId = body.AreaId;

        var drafts = body.Nodes.Select(node => new DiagramNodeDraft(node.Id, node.NodeType, node.Title ?? "", node.X, node.Y, node.ComponentId, node.Description, node.EventName)).ToList();
        var edgeDrafts = body.Edges.Select(edge => new DiagramEdgeDraft(edge.Id, edge.Kind, edge.SourceId, edge.TargetId, edge.Label, edge.Condition, edge.Protocol)).ToList();
        var structure = DiagramRules.ValidateStructure(diagram.Kind, drafts, edgeDrafts);
        if (structure.Count > 0)
        {
            return Problems.BadRequest(http, [.. structure]);
        }

        var componentIds = drafts.Where(node => node.ComponentId is not null).Select(node => node.ComponentId!.Value).Distinct().ToArray();
        var components = await db.Components.Where(item => item.ProjectId == projectId && componentIds.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, ct);
        if (components.Count != componentIds.Length)
        {
            return Problems.BadRequest(http, "Eine Komponente gehört nicht zu diesem Projekt.");
        }

        var existingNodes = await db.DiagramNodes.Where(item => item.DiagramId == diagramId).ToListAsync(ct);
        var existingEdges = await db.DiagramEdges.Where(item => item.DiagramId == diagramId).ToListAsync(ct);
        var existingNodeIds = existingNodes.Select(item => item.ArtifactId).ToHashSet();
        var payloadNodeIds = drafts.Select(item => item.Id).ToHashSet();
        var newNodeIds = payloadNodeIds.Except(existingNodeIds).ToArray();
        if (await db.Artifacts.AnyAsync(item => newNodeIds.Contains(item.Id), ct))
        {
            return Problems.BadRequest(http, "Eine Knotenkennung wird bereits verwendet.");
        }

        var existingEdgeIds = existingEdges.Select(item => item.Id).ToHashSet();
        var newEdgeIds = edgeDrafts.Select(item => item.Id).Except(existingEdgeIds).ToArray();
        if (await db.DiagramEdges.AnyAsync(item => newEdgeIds.Contains(item.Id), ct))
        {
            return Problems.BadRequest(http, "Eine Kantenkennung wird bereits verwendet.");
        }

        var removed = existingNodeIds.Except(payloadNodeIds).ToHashSet();
        var remainingIds = existingNodeIds.Intersect(payloadNodeIds).ToArray();
        var links = await db.ArtifactLinks.Where(item => item.ProjectId == projectId && (remainingIds.Contains(item.SourceArtifactId) || remainingIds.Contains(item.TargetArtifactId))).ToListAsync(ct);
        var surviving = links.Where(item => !removed.Contains(item.SourceArtifactId) && !removed.Contains(item.TargetArtifactId)).ToList();
        if (surviving.Count > 0)
        {
            var outside = surviving.SelectMany(item => new[] { item.SourceArtifactId, item.TargetArtifactId }).Where(id => !payloadNodeIds.Contains(id));
            var labels = await ArtifactCatalog.Labels(db, projectId, outside, ct);
            var nodeTypes = drafts.ToDictionary(item => item.Id, item => item.NodeType);
            foreach (var link in surviving)
            {
                if (!TryEnd(link.SourceArtifactId, nodeTypes, labels, out var sourceType, out var sourceNode)
                    || !TryEnd(link.TargetArtifactId, nodeTypes, labels, out var targetType, out var targetNode))
                {
                    return Problems.BadRequest(http, "Eine Verknüpfung verweist auf ein fehlendes Artefakt.");
                }

                if (LinkRules.Validate(sourceType, sourceNode, targetType, targetNode, link.Relation) is not null)
                {
                    return Problems.BadRequest(http, "Eine bestehende Verknüpfung passt nicht mehr zum Knotentyp. Entferne sie zuerst.");
                }
            }
        }

        var now = clock.GetUtcNow();
        var obsoleteLinks = removed.Count == 0
            ? []
            : await db.ArtifactLinks.Where(item => item.ProjectId == projectId && (removed.Contains(item.SourceArtifactId) || removed.Contains(item.TargetArtifactId))).ToListAsync(ct);
        var edgesToDelete = existingEdges.Where(item => edgeDrafts.All(edge => edge.Id != item.Id)).ToList();
        db.ArtifactLinks.RemoveRange(obsoleteLinks);
        db.DiagramEdges.RemoveRange(edgesToDelete);
        if (obsoleteLinks.Count > 0 || edgesToDelete.Count > 0)
        {
            var flushed = await DbSave.SaveAsync(db, http, ct);
            if (flushed is not null)
            {
                return flushed;
            }
        }

        if (removed.Count > 0)
        {
            db.ArtifactSources.RemoveRange(await db.ArtifactSources.Where(item => item.ProjectId == projectId && removed.Contains(item.ArtifactId)).ToListAsync(ct));
            var entries = await db.FlowEntries.Where(item => item.DiagramId == diagramId && removed.Contains(item.NodeId)).ToListAsync(ct);
            db.FlowEntries.RemoveRange(entries);
            db.DiagramNodes.RemoveRange(existingNodes.Where(item => removed.Contains(item.ArtifactId)));
            var obsoleteArtifacts = await db.Artifacts.Where(item => removed.Contains(item.Id)).ToListAsync(ct);
            db.Artifacts.RemoveRange(obsoleteArtifacts);
        }

        diagram.Name = body.Name.Trim();
        diagram.Description = body.Description?.Trim() ?? "";
        diagram.SearchText = SearchText.Build(diagram.Name, diagram.Description);
        diagram.Version++;
        diagram.UpdatedAt = now;
        var diagramArtifact = await db.Artifacts.FirstAsync(item => item.Id == diagram.ArtifactId, ct);
        diagramArtifact.UpdatedAt = now;

        foreach (var draft in drafts)
        {
            var component = draft.ComponentId is Guid componentId ? components[componentId] : null;
            var title = component?.Name ?? draft.Title.Trim();
            var current = existingNodes.FirstOrDefault(item => item.ArtifactId == draft.Id);
            if (current is null)
            {
                var artifact = new Artifact { Id = draft.Id, ProjectId = projectId, Type = ArtifactType.DiagramNode, CreatedAt = now, UpdatedAt = now };
                db.Artifacts.Add(artifact);
                db.DiagramNodes.Add(new DiagramNode
                {
                    ArtifactId = draft.Id,
                    ProjectId = projectId,
                    DiagramId = diagramId,
                    NodeType = draft.NodeType,
                    Title = title,
                    PositionX = draft.X,
                    PositionY = draft.Y,
                    ComponentId = draft.ComponentId,
                    Description = draft.Description?.Trim(),
                    EventName = draft.EventName?.Trim(),
                    CreatedAt = now,
                    UpdatedAt = now,
                    SearchText = SearchText.Build(title, draft.Description, draft.EventName),
                });
            }
            else
            {
                current.NodeType = draft.NodeType;
                current.Title = title;
                current.PositionX = draft.X;
                current.PositionY = draft.Y;
                current.ComponentId = draft.ComponentId;
                current.Description = draft.Description?.Trim();
                current.EventName = draft.EventName?.Trim();
                current.SearchText = SearchText.Build(title, current.Description, current.EventName);
                current.Version++;
                current.UpdatedAt = now;
            }
        }

        foreach (var draft in edgeDrafts)
        {
            var current = existingEdges.FirstOrDefault(item => item.Id == draft.Id);
            var condition = diagram.Kind == DiagramKind.Process ? draft.Condition?.Trim() : null;
            var protocol = diagram.Kind == DiagramKind.System ? draft.Protocol?.Trim() : null;
            if (current is null)
            {
                db.DiagramEdges.Add(new DiagramEdge
                {
                    Id = draft.Id,
                    ProjectId = projectId,
                    DiagramId = diagramId,
                    SourceNodeId = draft.SourceId,
                    TargetNodeId = draft.TargetId,
                    Kind = draft.Kind,
                    Label = draft.Label?.Trim(),
                    Condition = condition,
                    Protocol = protocol,
                });
            }
            else
            {
                current.SourceNodeId = draft.SourceId;
                current.TargetNodeId = draft.TargetId;
                current.Kind = draft.Kind;
                current.Label = draft.Label?.Trim();
                current.Condition = condition;
                current.Protocol = protocol;
            }
        }

        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(await Project(db, diagram, ct));
    }

    private static async Task<IResult> Delete(ProjectGuard guard, AppDbContext db, Guid projectId, Guid diagramId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var diagram = await db.Diagrams.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == diagramId, ct);
        if (diagram is null)
        {
            return Problems.NotFound(http);
        }

        var nodeIds = await db.DiagramNodes.Where(item => item.DiagramId == diagramId).Select(item => item.ArtifactId).ToListAsync(ct);
        var ids = nodeIds.Append(diagramId).ToArray();
        db.ArtifactSources.RemoveRange(await db.ArtifactSources.Where(item => item.ProjectId == projectId && ids.Contains(item.ArtifactId)).ToListAsync(ct));
        db.FlowEntries.RemoveRange(await db.FlowEntries.Where(item => item.DiagramId == diagramId).ToListAsync(ct));
        var links = await db.ArtifactLinks.Where(item => item.ProjectId == projectId && (ids.Contains(item.SourceArtifactId) || ids.Contains(item.TargetArtifactId))).ToListAsync(ct);
        db.ArtifactLinks.RemoveRange(links);
        db.DiagramEdges.RemoveRange(await db.DiagramEdges.Where(item => item.DiagramId == diagramId).ToListAsync(ct));
        var flushed = await DbSave.SaveAsync(db, http, ct);
        if (flushed is not null)
        {
            return flushed;
        }

        db.DiagramNodes.RemoveRange(await db.DiagramNodes.Where(item => item.DiagramId == diagramId).ToListAsync(ct));
        var nodesRemoved = await DbSave.SaveAsync(db, http, ct);
        if (nodesRemoved is not null)
        {
            return nodesRemoved;
        }

        db.Diagrams.Remove(diagram);
        var diagramRemoved = await DbSave.SaveAsync(db, http, ct);
        if (diagramRemoved is not null)
        {
            return diagramRemoved;
        }

        db.Artifacts.RemoveRange(await db.Artifacts.Where(item => ids.Contains(item.Id)).ToListAsync(ct));
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static bool TryEnd(Guid id, Dictionary<Guid, string> nodeTypes, Dictionary<Guid, ArtifactLabel> labels, out ArtifactType type, out string? nodeType)
    {
        if (nodeTypes.TryGetValue(id, out var localType))
        {
            type = ArtifactType.DiagramNode;
            nodeType = localType;
            return true;
        }

        if (labels.TryGetValue(id, out var label))
        {
            type = label.Type;
            nodeType = label.NodeType;
            return true;
        }

        type = default;
        nodeType = null;
        return false;
    }

    private static async Task<DiagramResponse> Project(AppDbContext db, Diagram diagram, CancellationToken ct)
    {
        var nodes = await db.DiagramNodes.AsNoTracking().Where(item => item.DiagramId == diagram.ArtifactId).OrderBy(item => item.Title).ThenBy(item => item.ArtifactId).ToListAsync(ct);
        var edges = await db.DiagramEdges.AsNoTracking().Where(item => item.DiagramId == diagram.ArtifactId).OrderBy(item => item.Id).ToListAsync(ct);
        var componentIds = nodes.Where(item => item.ComponentId is not null).Select(item => item.ComponentId!.Value).Distinct().ToArray();
        var components = await db.Components.AsNoTracking().Where(item => componentIds.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, ct);
        var nodeDrafts = nodes.Select(item => new DiagramNodeDraft(item.ArtifactId, item.NodeType, item.Title, item.PositionX, item.PositionY, item.ComponentId, item.Description, item.EventName)).ToList();
        var edgeDrafts = edges.Select(item => new DiagramEdgeDraft(item.Id, item.Kind, item.SourceNodeId, item.TargetNodeId, item.Label, item.Condition, item.Protocol)).ToList();
        string? areaName = null;
        if (diagram.AreaId is Guid areaId)
        {
            areaName = await db.Areas.AsNoTracking().Where(item => item.Id == areaId).Select(item => item.Name).FirstOrDefaultAsync(ct);
        }

        return new DiagramResponse(
            diagram.ArtifactId,
            diagram.Kind,
            diagram.Name,
            diagram.Description,
            diagram.Version,
            diagram.UpdatedAt,
            diagram.AreaId,
            areaName,
            nodes.Select(item =>
            {
                components.TryGetValue(item.ComponentId ?? Guid.Empty, out var component);
                return new DiagramNodeResponse(item.ArtifactId, item.NodeType, component?.Name ?? item.Title, item.PositionX, item.PositionY, item.ComponentId, component?.Name, component?.Kind.ToString(), component?.Technology, item.Description, item.EventName, item.Version);
            }).ToList(),
            edges.Select(item => new DiagramEdgeResponse(item.Id, item.Kind, item.SourceNodeId, item.TargetNodeId, item.Label, item.Condition, item.Protocol)).ToList(),
            DiagramRules.Analyze(diagram.Kind, nodeDrafts, edgeDrafts));
    }

    private static async Task<IResult?> AssignArea(AppDbContext db, HttpContext http, Guid projectId, Guid? areaId, CancellationToken ct)
    {
        if (areaId is null)
        {
            return null;
        }

        var exists = await db.Areas.AsNoTracking().AnyAsync(item => item.Id == areaId && item.ProjectId == projectId, ct);
        return exists ? null : Problems.BadRequest(http, "Der Bereich gehört nicht zu diesem Projekt.");
    }

    private static IResult? ValidateMeta(HttpContext http, string? name, string? description)
    {
        var errors = new List<string>();
        if (TextInput.Required(name, "Name", 160) is string nameError)
        {
            errors.Add(nameError);
        }

        if (TextInput.Optional(description, "Beschreibung", 4000) is string descriptionError)
        {
            errors.Add(descriptionError);
        }

        return errors.Count == 0 ? null : Problems.BadRequest(http, [.. errors]);
    }
}
