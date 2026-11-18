namespace Studio.Api.Features;

public static class TraceEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/overview", Overview);
        group.MapGet("/projects/{projectId:guid}/search", Search);
        group.MapGet("/projects/{projectId:guid}/artifacts/{artifactId:guid}/links", Links);
        group.MapPost("/projects/{projectId:guid}/links", CreateLink);
        group.MapDelete("/projects/{projectId:guid}/links/{linkId:guid}", DeleteLink);
        group.MapGet("/projects/{projectId:guid}/components/{componentId:guid}/effects", Effects);
        group.MapGet("/projects/{projectId:guid}/artifacts/{artifactId:guid}/impact", Impact);
        group.MapDelete("/projects/{projectId:guid}/artifacts/{artifactId:guid}", DeleteArtifact);
    }

    private static async Task<IResult> Overview(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var openQuery = db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId && (item.Status == RequirementStatus.Offen || item.Status == RequirementStatus.InBearbeitung));
        var missingProcess = RequirementEndpoints.Filtered(db, projectId, null, null, "process", null);
        var missingScreen = RequirementEndpoints.Filtered(db, projectId, null, null, "screen", null);
        var missingComponent = RequirementEndpoints.Filtered(db, projectId, null, null, "component", null);
        var recent = await Recent(db, projectId, ct);
        return Results.Ok(new OverviewResponse(
            await openQuery.CountAsync(ct),
            (await openQuery.OrderBy(item => item.Key).Take(8).ToListAsync(ct)).Select(RequirementEndpoints.Map).ToList(),
            recent,
            await missingProcess.CountAsync(ct),
            (await missingProcess.OrderBy(item => item.Key).Take(8).ToListAsync(ct)).Select(RequirementEndpoints.Map).ToList(),
            await missingScreen.CountAsync(ct),
            (await missingScreen.OrderBy(item => item.Key).Take(8).ToListAsync(ct)).Select(RequirementEndpoints.Map).ToList(),
            await missingComponent.CountAsync(ct),
            (await missingComponent.OrderBy(item => item.Key).Take(8).ToListAsync(ct)).Select(RequirementEndpoints.Map).ToList(),
            await SharedFlows.AcrossProcesses(db, projectId, ct),
            await db.Requirements.CountAsync(item => item.ProjectId == projectId, ct),
            await db.Diagrams.CountAsync(item => item.ProjectId == projectId && item.Kind == DiagramKind.Process, ct),
            await db.Diagrams.CountAsync(item => item.ProjectId == projectId && item.Kind == DiagramKind.System, ct),
            await db.Screens.CountAsync(item => item.ProjectId == projectId, ct),
            await db.Documents.CountAsync(item => item.ProjectId == projectId, ct),
            await db.Components.CountAsync(item => item.ProjectId == projectId, ct)));
    }

    private static async Task<IResult> Search(ProjectGuard guard, AppDbContext db, Guid projectId, string? q, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var term = q?.Trim() ?? "";
        if (term.Length is 0 or > 200)
        {
            return Results.Ok(Array.Empty<SearchHit>());
        }

        var pattern = RequirementEndpoints.LikePattern(term);
        var hits = new List<SearchHit>();
        hits.AddRange(await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId && (EF.Functions.ILike(item.Key, pattern, "\\") || EF.Functions.ILike(item.SearchText, pattern, "\\")))
            .OrderBy(item => item.Key).Take(12)
            .Select(item => new SearchHit(item.ArtifactId, "requirement", item.Key + " " + item.Title, "Anforderung", null)).ToListAsync(ct));
        hits.AddRange(await db.Diagrams.AsNoTracking().Where(item => item.ProjectId == projectId && EF.Functions.ILike(item.SearchText, pattern, "\\"))
            .OrderBy(item => item.Name).Take(12)
            .Select(item => new SearchHit(item.ArtifactId, item.Kind == DiagramKind.Process ? "process" : "system", item.Name, item.Kind == DiagramKind.Process ? "Prozessdiagramm" : "Systemdiagramm", null)).ToListAsync(ct));
        hits.AddRange(await (
            from node in db.DiagramNodes.AsNoTracking()
            join diagram in db.Diagrams.AsNoTracking() on node.DiagramId equals diagram.ArtifactId
            where node.ProjectId == projectId && EF.Functions.ILike(node.SearchText, pattern, "\\")
            orderby node.Title
            select new SearchHit(node.ArtifactId, "node", node.Title, diagram.Name, node.DiagramId)).Take(12).ToListAsync(ct));
        hits.AddRange(await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId && EF.Functions.ILike(item.SearchText, pattern, "\\"))
            .OrderBy(item => item.Name).Take(12)
            .Select(item => new SearchHit(item.ArtifactId, "screen", item.Name, "Screen", null)).ToListAsync(ct));
        hits.AddRange(await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId && EF.Functions.ILike(item.SearchText, pattern, "\\"))
            .OrderBy(item => item.Name).Take(12)
            .Select(item => new SearchHit(item.ArtifactId, "component", item.Name, "Komponente", null)).ToListAsync(ct));
        hits.AddRange(await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId && EF.Functions.ILike(item.SearchText, pattern, "\\"))
            .OrderBy(item => item.Title).Take(12)
            .Select(item => new SearchHit(item.ArtifactId, item.Kind == DocumentKind.Decision ? "decision" : "document", item.Title, item.Kind == DocumentKind.Decision ? "Architekturentscheidung" : "Seite", null)).ToListAsync(ct));
        var ordered = hits.OrderBy(item => item.Title).ThenBy(item => item.Id).Take(30).ToList();
        return Results.Ok(ordered);
    }

    private static async Task<IResult> Links(ProjectGuard guard, AppDbContext db, Guid projectId, Guid artifactId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (!await db.Artifacts.AnyAsync(item => item.ProjectId == projectId && item.Id == artifactId, ct))
        {
            return Problems.NotFound(http);
        }

        var links = await db.ArtifactLinks.AsNoTracking().Where(item => item.ProjectId == projectId && (item.SourceArtifactId == artifactId || item.TargetArtifactId == artifactId)).ToListAsync(ct);
        var labels = await ArtifactCatalog.Labels(db, projectId, links.SelectMany(item => new[] { item.SourceArtifactId, item.TargetArtifactId }), ct);
        var result = links.Select(item =>
        {
            var outgoing = item.SourceArtifactId == artifactId;
            var otherId = outgoing ? item.TargetArtifactId : item.SourceArtifactId;
            labels.TryGetValue(otherId, out var label);
            return new LinkResponse(item.Id, item.Relation, outgoing ? "outgoing" : "incoming", otherId, label?.Type.ToString() ?? "deleted", label?.Title ?? "Gelöschtes Artefakt", label?.NodeType, label?.DiagramId, item.Rationale);
        }).OrderBy(item => item.Title).ThenBy(item => item.Id).ToList();
        return Results.Ok(result);
    }

    private static async Task<IResult> CreateLink(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateLinkRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (body.SourceId == body.TargetId)
        {
            return Problems.BadRequest(http, "Ein Artefakt kann nicht mit sich selbst verknüpft werden.");
        }

        var labels = await ArtifactCatalog.Labels(db, projectId, [body.SourceId, body.TargetId], ct);
        if (!labels.TryGetValue(body.SourceId, out var source) || !labels.TryGetValue(body.TargetId, out var target))
        {
            return Problems.NotFound(http, "Quelle oder Ziel wurde nicht gefunden.");
        }

        if (LinkRules.Validate(source.Type, source.NodeType, target.Type, target.NodeType, body.Relation) is string rule)
        {
            return Problems.BadRequest(http, rule);
        }

        if (await db.ArtifactLinks.AnyAsync(item => item.SourceArtifactId == body.SourceId && item.TargetArtifactId == body.TargetId && item.Relation == body.Relation, ct))
        {
            return Problems.Conflict(http, "Diese Verknüpfung besteht bereits.", "duplicate");
        }

        var rationale = string.IsNullOrWhiteSpace(body.Rationale) ? null : body.Rationale.Trim();
        if (TextInput.Optional(rationale, "Begründung", 500) is string rationaleError)
        {
            return Problems.BadRequest(http, rationaleError);
        }

        var link = new ArtifactLink
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            SourceArtifactId = body.SourceId,
            TargetArtifactId = body.TargetId,
            Relation = body.Relation,
            Rationale = rationale,
            CreatedAt = clock.GetUtcNow(),
        };
        db.ArtifactLinks.Add(link);
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        return Results.Created($"/api/v1/projects/{projectId}/links/{link.Id}", new LinkResponse(link.Id, link.Relation, "outgoing", target.Id, target.Type.ToString(), target.Title, target.NodeType, target.DiagramId, link.Rationale));
    }

    private static async Task<IResult> Effects(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (!await db.Components.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == componentId, ct))
        {
            return Problems.NotFound(http);
        }

        return Results.Ok(await SharedFlows.ForComponent(db, projectId, componentId, ct));
    }

    private static async Task<IResult> DeleteLink(ProjectGuard guard, AppDbContext db, Guid projectId, Guid linkId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var link = await db.ArtifactLinks.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == linkId, ct);
        if (link is null)
        {
            return Problems.NotFound(http);
        }

        if (link.Relation == LinkRelation.Documents)
        {
            return Problems.BadRequest(http, "Dokumentlinks werden im Seitentext entfernt.");
        }

        db.ArtifactLinks.Remove(link);
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.NoContent();
    }

    private static async Task<IResult> Impact(ProjectGuard guard, AppDbContext db, Guid projectId, Guid artifactId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var artifact = await db.Artifacts.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == artifactId, ct);
        if (artifact is null)
        {
            return Problems.NotFound(http);
        }

        return Results.Ok(await BuildImpact(db, projectId, artifact, ct));
    }

    private static async Task<IResult> DeleteArtifact(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid artifactId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var artifact = await db.Artifacts.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == artifactId, ct);
        if (artifact is null)
        {
            return Problems.NotFound(http);
        }

        var impact = await BuildImpact(db, projectId, artifact, ct);
        if (!impact.CanDelete)
        {
            return Problems.Conflict(http, impact.BlockReason ?? "Das Artefakt kann nicht gelöscht werden.", "blocked");
        }

        var now = clock.GetUtcNow();
        if (artifact.Type == ArtifactType.Screen)
        {
            await ClearIncomingNavigations(db, projectId, artifactId, now, ct);
        }

        var links = await db.ArtifactLinks.Where(item => item.ProjectId == projectId && (item.SourceArtifactId == artifactId || item.TargetArtifactId == artifactId)).ToListAsync(ct);
        db.ArtifactLinks.RemoveRange(links);
        switch (artifact.Type)
        {
            case ArtifactType.Requirement:
                db.Requirements.Remove(await db.Requirements.FirstAsync(item => item.ArtifactId == artifactId, ct));
                break;
            case ArtifactType.Diagram:
                return Problems.BadRequest(http, "Diagramme werden über ihre eigene Aktion gelöscht.");
            case ArtifactType.DiagramNode:
                return Problems.BadRequest(http, "Knoten werden im Diagramm gelöscht. Dabei verschwinden auch ihre Kanten.");
            case ArtifactType.Screen:
                db.ScreenNavigations.RemoveRange(await db.ScreenNavigations.Where(item => item.SourceScreenId == artifactId || item.TargetScreenId == artifactId).ToListAsync(ct));
                db.Screens.Remove(await db.Screens.FirstAsync(item => item.ArtifactId == artifactId, ct));
                break;
            case ArtifactType.Component:
                db.Components.Remove(await db.Components.FirstAsync(item => item.ArtifactId == artifactId, ct));
                break;
            case ArtifactType.Document:
                var descendantError = await DeleteDescendantPages(db, http, projectId, artifactId, ct);
                if (descendantError is not null)
                {
                    return descendantError;
                }

                db.DocumentRevisions.RemoveRange(await db.DocumentRevisions.Where(item => item.DocumentId == artifactId).ToListAsync(ct));
                db.Documents.Remove(await db.Documents.FirstAsync(item => item.ArtifactId == artifactId, ct));
                break;
        }

        db.Artifacts.Remove(artifact);
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult?> DeleteDescendantPages(AppDbContext db, HttpContext http, Guid projectId, Guid pageId, CancellationToken ct)
    {
        var pages = await db.Documents.Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var ids = new List<Guid>();
        Collect(pageId);
        if (ids.Count == 0)
        {
            return null;
        }

        ids.Reverse();
        var links = await db.ArtifactLinks.Where(item => item.ProjectId == projectId && (ids.Contains(item.SourceArtifactId) || ids.Contains(item.TargetArtifactId))).ToListAsync(ct);
        db.ArtifactLinks.RemoveRange(links);
        db.DocumentRevisions.RemoveRange(await db.DocumentRevisions.Where(item => ids.Contains(item.DocumentId)).ToListAsync(ct));
        db.Documents.RemoveRange(pages.Where(item => ids.Contains(item.ArtifactId)));
        var saved = await DbSave.SaveAsync(db, http, ct);
        if (saved is not null)
        {
            return saved;
        }

        db.Artifacts.RemoveRange(await db.Artifacts.Where(item => ids.Contains(item.Id)).ToListAsync(ct));
        return await DbSave.SaveAsync(db, http, ct);

        void Collect(Guid current)
        {
            foreach (var child in pages.Where(item => item.ParentId == current))
            {
                ids.Add(child.ArtifactId);
                Collect(child.ArtifactId);
            }
        }
    }

    private static async Task ClearIncomingNavigations(AppDbContext db, Guid projectId, Guid screenId, DateTimeOffset now, CancellationToken ct)
    {
        var incoming = await db.ScreenNavigations.Where(item => item.ProjectId == projectId && item.TargetScreenId == screenId).ToListAsync(ct);
        var sourceIds = incoming.Select(item => item.SourceScreenId).Distinct().ToArray();
        var screens = await db.Screens.Where(item => sourceIds.Contains(item.ArtifactId)).ToListAsync(ct);
        foreach (var screen in screens)
        {
            var parsed = WireframeRules.Parse(screen.WireframeJson);
            if (parsed.Model is null)
            {
                continue;
            }

            var elements = parsed.Model.Desktop.Elements.Concat(parsed.Model.Mobile.Elements)
                .Select(item => item.TargetScreenId == screenId ? item with { TargetScreenId = null } : item)
                .ToList();
            var desktopIds = parsed.Model.Desktop.Elements.Select(item => item.Id).ToHashSet();
            screen.WireframeJson = WireframeRules.Serialize(new WireframeRules.DocumentModel(
                1,
                new WireframeRules.Frame(elements.Where(item => desktopIds.Contains(item.Id)).ToList()),
                new WireframeRules.Frame(elements.Where(item => !desktopIds.Contains(item.Id)).ToList())));
            screen.Version++;
            screen.UpdatedAt = now;
        }
    }

    private static async Task<ImpactResponse> BuildImpact(AppDbContext db, Guid projectId, Artifact artifact, CancellationToken ct)
    {
        var links = await db.ArtifactLinks.AsNoTracking().Where(item => item.ProjectId == projectId && (item.SourceArtifactId == artifact.Id || item.TargetArtifactId == artifact.Id)).ToListAsync(ct);
        var labels = await ArtifactCatalog.Labels(db, projectId, links.SelectMany(item => new[] { item.SourceArtifactId, item.TargetArtifactId }).Where(id => id != artifact.Id), ct);
        var linkRefs = links.Select(item =>
        {
            var other = item.SourceArtifactId == artifact.Id ? item.TargetArtifactId : item.SourceArtifactId;
            labels.TryGetValue(other, out var label);
            return new ImpactRef(item.Id, item.Relation.ToString(), label?.Title ?? "Gelöschtes Artefakt");
        }).ToList();

        var edges = new List<ImpactRef>();
        var placements = new List<ImpactRef>();
        var children = new List<ImpactRef>();
        var navigations = new List<ImpactRef>();
        var nodes = new List<ImpactRef>();
        string? block = null;

        if (artifact.Type == ArtifactType.DiagramNode)
        {
            var nodeEdges = await db.DiagramEdges.AsNoTracking().Where(item => item.SourceNodeId == artifact.Id || item.TargetNodeId == artifact.Id).ToListAsync(ct);
            edges.AddRange(nodeEdges.Select(item => new ImpactRef(item.Id, "Kante", item.Condition ?? item.Label ?? "Kante")));
        }

        if (artifact.Type == ArtifactType.Component)
        {
            var placed = await db.DiagramNodes.AsNoTracking().Where(item => item.ComponentId == artifact.Id).ToListAsync(ct);
            var diagrams = await db.Diagrams.AsNoTracking().Where(item => placed.Select(node => node.DiagramId).Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
            placements.AddRange(placed.Select(item => new ImpactRef(item.ArtifactId, "Platzierung", diagrams.GetValueOrDefault(item.DiagramId, "Diagramm"))));
            if (placements.Count > 0)
            {
                block = "Die Komponente ist noch in Diagrammen platziert. Entferne zuerst die Platzierungen.";
            }
        }

        if (artifact.Type == ArtifactType.Document)
        {
            var pages = await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Title).ToListAsync(ct);
            var pending = new Queue<Guid>();
            pending.Enqueue(artifact.Id);
            var seen = new HashSet<Guid> { artifact.Id };
            while (pending.Count > 0)
            {
                var current = pending.Dequeue();
                foreach (var child in pages.Where(item => item.ParentId == current && seen.Add(item.ArtifactId)))
                {
                    children.Add(new ImpactRef(child.ArtifactId, "Unterseite", child.Title));
                    pending.Enqueue(child.ArtifactId);
                }
            }
        }

        if (artifact.Type == ArtifactType.Diagram)
        {
            var diagramNodes = await db.DiagramNodes.AsNoTracking().Where(item => item.DiagramId == artifact.Id).OrderBy(item => item.Title).ToListAsync(ct);
            nodes.AddRange(diagramNodes.Select(item => new ImpactRef(item.ArtifactId, "Knoten", string.IsNullOrWhiteSpace(item.Title) ? item.NodeType : item.Title)));
        }

        if (artifact.Type == ArtifactType.Screen)
        {
            var rows = await db.ScreenNavigations.AsNoTracking().Where(item => item.TargetScreenId == artifact.Id || item.SourceScreenId == artifact.Id).ToListAsync(ct);
            var screenIds = rows.SelectMany(item => new[] { item.SourceScreenId, item.TargetScreenId }).Where(id => id != artifact.Id).Distinct().ToArray();
            var names = await db.Screens.AsNoTracking().Where(item => screenIds.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
            navigations.AddRange(rows.Select(item =>
            {
                var other = item.SourceScreenId == artifact.Id ? item.TargetScreenId : item.SourceScreenId;
                return new ImpactRef(item.Id, "Navigation", names.GetValueOrDefault(other, "Screen"));
            }));
        }

        return new ImpactResponse(block is null, block, linkRefs, edges, placements, children, navigations, nodes);
    }

    private static async Task<List<RecentItem>> Recent(AppDbContext db, Guid projectId, CancellationToken ct)
    {
        var items = new List<RecentItem>();
        items.AddRange(await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId).OrderByDescending(item => item.UpdatedAt).Take(8)
            .Select(item => new RecentItem(item.ArtifactId, "requirement", item.Key + " " + item.Title, "Anforderung", item.UpdatedAt, null)).ToListAsync(ct));
        items.AddRange(await db.Diagrams.AsNoTracking().Where(item => item.ProjectId == projectId).OrderByDescending(item => item.UpdatedAt).Take(8)
            .Select(item => new RecentItem(item.ArtifactId, item.Kind == DiagramKind.Process ? "process" : "system", item.Name, item.Kind == DiagramKind.Process ? "Prozess" : "System", item.UpdatedAt, null)).ToListAsync(ct));
        items.AddRange(await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId).OrderByDescending(item => item.UpdatedAt).Take(8)
            .Select(item => new RecentItem(item.ArtifactId, "screen", item.Name, "Screen", item.UpdatedAt, null)).ToListAsync(ct));
        items.AddRange(await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId).OrderByDescending(item => item.UpdatedAt).Take(8)
            .Select(item => new RecentItem(item.ArtifactId, "component", item.Name, "Komponente", item.UpdatedAt, null)).ToListAsync(ct));
        items.AddRange(await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId).OrderByDescending(item => item.UpdatedAt).Take(8)
            .Select(item => new RecentItem(item.ArtifactId, item.Kind == DocumentKind.Decision ? "decision" : "document", item.Title, item.Kind == DocumentKind.Decision ? "Entscheidung" : "Seite", item.UpdatedAt, null)).ToListAsync(ct));
        var picked = new List<RecentItem>();
        var perType = new Dictionary<string, int>();
        foreach (var item in items.OrderByDescending(item => item.UpdatedAt).ThenBy(item => item.Id))
        {
            perType.TryGetValue(item.Type, out var count);
            if (count >= 2)
            {
                continue;
            }

            perType[item.Type] = count + 1;
            picked.Add(item);
            if (picked.Count == 8)
            {
                break;
            }
        }

        return picked;
    }
}
