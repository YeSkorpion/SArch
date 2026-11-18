namespace Studio.Api.Features;

public static class UsageEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/artifacts/{artifactId:guid}/usage", Usage);
    }

    private static async Task<IResult> Usage(
        ProjectGuard guard,
        AppDbContext db,
        Guid projectId,
        Guid artifactId,
        string? via,
        string? type,
        string? area,
        int? skip,
        int? take,
        HttpContext http,
        CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (!await db.Artifacts.AsNoTracking().AnyAsync(item => item.ProjectId == projectId && item.Id == artifactId, ct))
        {
            return Problems.NotFound(http);
        }

        var ancestors = ParseVia(via);
        if (ancestors.Count > UsageRelations.MaxDepth - 1)
        {
            return Problems.BadRequest(http, "Die Abfragetiefe ist begrenzt.");
        }

        var pageSize = take is null or < 1 ? 20 : Math.Min(take.Value, UsageRelations.MaxTake);
        var offset = skip is null or < 0 ? 0 : skip.Value;
        var outgoing = await db.ArtifactLinks.AsNoTracking()
            .Where(item => item.ProjectId == projectId && item.SourceArtifactId == artifactId)
            .OrderBy(item => item.Id)
            .Take(500)
            .ToListAsync(ct);
        var incoming = await db.ArtifactLinks.AsNoTracking()
            .Where(item => item.ProjectId == projectId && item.TargetArtifactId == artifactId)
            .OrderBy(item => item.Id)
            .Take(500)
            .ToListAsync(ct);
        var neighborIds = outgoing.Select(item => item.TargetArtifactId).Concat(incoming.Select(item => item.SourceArtifactId)).Distinct().ToArray();
        var labels = await ArtifactCatalog.Labels(db, projectId, neighborIds, ct);
        var kinds = await DocumentKinds(db, projectId, labels, ct);
        var areas = await Areas(db, projectId, labels, ct);
        var uses = Page(Build(outgoing, true, labels, kinds, areas, ancestors, artifactId), type, area, offset, pageSize);
        var usedBy = Page(Build(incoming, false, labels, kinds, areas, ancestors, artifactId), type, area, offset, pageSize);
        await MarkExpandable(db, projectId, uses.Items.Concat(usedBy.Items).ToList(), ancestors, artifactId, ct);
        return Results.Ok(new UsageResponse(artifactId, uses.Items, usedBy.Items, uses.Total, usedBy.Total, uses.HasMore, usedBy.HasMore));
    }

    private static List<Guid> ParseVia(string? via)
    {
        if (string.IsNullOrWhiteSpace(via))
        {
            return [];
        }

        return via.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(item => Guid.TryParse(item, out var id) ? id : Guid.Empty)
            .Where(item => item != Guid.Empty)
            .Distinct()
            .Take(UsageRelations.MaxDepth)
            .ToList();
    }

    private static async Task<Dictionary<Guid, DocumentKind>> DocumentKinds(AppDbContext db, Guid projectId, Dictionary<Guid, ArtifactLabel> labels, CancellationToken ct)
    {
        var ids = labels.Values.Where(item => item.Type == ArtifactType.Document).Select(item => item.Id).ToArray();
        if (ids.Length == 0)
        {
            return [];
        }

        return await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId && ids.Contains(item.ArtifactId))
            .ToDictionaryAsync(item => item.ArtifactId, item => item.Kind, ct);
    }

    private static async Task<Dictionary<Guid, (Guid? AreaId, string? AreaName)>> Areas(AppDbContext db, Guid projectId, Dictionary<Guid, ArtifactLabel> labels, CancellationToken ct)
    {
        var result = new Dictionary<Guid, (Guid?, string?)>();
        var diagramIds = labels.Values.Where(item => item.Type == ArtifactType.Diagram).Select(item => item.Id).ToList();
        var nodeIds = labels.Values.Where(item => item.Type == ArtifactType.DiagramNode).Select(item => item.Id).ToArray();
        var nodeDiagrams = nodeIds.Length == 0
            ? []
            : await db.DiagramNodes.AsNoTracking().Where(item => nodeIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.DiagramId }).ToListAsync(ct);
        diagramIds.AddRange(nodeDiagrams.Select(item => item.DiagramId));
        var diagrams = diagramIds.Count == 0
            ? []
            : await db.Diagrams.AsNoTracking().Where(item => item.ProjectId == projectId && diagramIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.AreaId }).ToListAsync(ct);
        var areaIds = diagrams.Where(item => item.AreaId != null).Select(item => item.AreaId!.Value).Distinct().ToArray();
        var names = areaIds.Length == 0
            ? new Dictionary<Guid, string>()
            : await db.Areas.AsNoTracking().Where(item => item.ProjectId == projectId && areaIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Name, ct);
        foreach (var diagram in diagrams)
        {
            result[diagram.ArtifactId] = (diagram.AreaId, diagram.AreaId is Guid areaId ? names.GetValueOrDefault(areaId) : null);
        }

        foreach (var node in nodeDiagrams)
        {
            if (result.TryGetValue(node.DiagramId, out var area))
            {
                result[node.ArtifactId] = area;
            }
        }

        return result;
    }

    private static List<UsageHit> Build(
        List<ArtifactLink> links,
        bool outgoing,
        Dictionary<Guid, ArtifactLabel> labels,
        Dictionary<Guid, DocumentKind> kinds,
        Dictionary<Guid, (Guid? AreaId, string? AreaName)> areas,
        List<Guid> ancestors,
        Guid currentId)
    {
        var seenPath = ancestors.Append(currentId).ToHashSet();
        return links.Where(item => UsageRelations.Relevant(item.Relation))
            .GroupBy(item => outgoing ? item.TargetArtifactId : item.SourceArtifactId)
            .Select(group =>
            {
                var ordered = group.OrderBy(item => item.Relation).ThenBy(item => item.Id).ToList();
                var primary = ordered[0];
                if (!labels.TryGetValue(group.Key, out var label))
                {
                    return null;
                }

                var publicType = PublicType(label, kinds);
                areas.TryGetValue(group.Key, out var area);
                var names = UsageRelations.Labels(primary.Relation);
                var cycle = seenPath.Contains(group.Key);
                return new UsageHit(
                    group.Key,
                    publicType,
                    label.Title,
                    area.AreaId,
                    area.AreaName,
                    label.DiagramId,
                    primary.Relation.ToString(),
                    outgoing ? names.Outgoing : names.Incoming,
                    outgoing ? "outgoing" : "incoming",
                    primary.Id,
                    ordered.Skip(1).Select(item =>
                    {
                        var alternate = UsageRelations.Labels(item.Relation);
                        return new UsageAlternate(item.Id, item.Relation.ToString(), outgoing ? alternate.Outgoing : alternate.Incoming);
                    }).Take(8).ToList(),
                    cycle,
                    false);
            })
            .Where(item => item is not null)
            .Select(item => item!)
            .OrderBy(item => item.Title)
            .ThenBy(item => item.ArtifactId)
            .ToList();
    }

    private static (List<UsageHit> Items, int Total, bool HasMore) Page(List<UsageHit> hits, string? type, string? area, int skip, int take)
    {
        IEnumerable<UsageHit> filtered = hits;
        if (!string.IsNullOrWhiteSpace(type))
        {
            filtered = filtered.Where(item => string.Equals(item.Type, type.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(area))
        {
            if (string.Equals(area, "none", StringComparison.OrdinalIgnoreCase))
            {
                filtered = filtered.Where(item => item.AreaId is null);
            }
            else if (Guid.TryParse(area, out var areaId))
            {
                filtered = filtered.Where(item => item.AreaId == areaId);
            }
        }

        var list = filtered.ToList();
        var page = list.Skip(skip).Take(take).ToList();
        return (page, list.Count, skip + page.Count < list.Count);
    }

    private static async Task MarkExpandable(AppDbContext db, Guid projectId, List<UsageHit> hits, List<Guid> ancestors, Guid currentId, CancellationToken ct)
    {
        if (ancestors.Count >= UsageRelations.MaxDepth - 1 || hits.Count == 0)
        {
            return;
        }

        var ids = hits.Where(item => !item.Cycle).Select(item => item.ArtifactId).ToArray();
        if (ids.Length == 0)
        {
            return;
        }

        var touching = await db.ArtifactLinks.AsNoTracking()
            .Where(item => item.ProjectId == projectId && (ids.Contains(item.SourceArtifactId) || ids.Contains(item.TargetArtifactId)))
            .Select(item => new { item.SourceArtifactId, item.TargetArtifactId })
            .ToListAsync(ct);
        for (var index = 0; index < hits.Count; index++)
        {
            var hit = hits[index];
            if (hit.Cycle)
            {
                continue;
            }

            var further = touching.Any(item =>
                (item.SourceArtifactId == hit.ArtifactId && item.TargetArtifactId != currentId)
                || (item.TargetArtifactId == hit.ArtifactId && item.SourceArtifactId != currentId));
            if (further)
            {
                hits[index] = hit with { Expandable = true };
            }
        }
    }

    private static string PublicType(ArtifactLabel label, Dictionary<Guid, DocumentKind> kinds)
    {
        if (label.Type == ArtifactType.Document)
        {
            return kinds.GetValueOrDefault(label.Id) == DocumentKind.Decision ? "decision" : "document";
        }

        if (label.Type == ArtifactType.Diagram)
        {
            return label.NodeType == nameof(DiagramKind.Process) ? "process" : "system";
        }

        return label.Type switch
        {
            ArtifactType.Requirement => "requirement",
            ArtifactType.DiagramNode => "node",
            ArtifactType.Screen => "screen",
            ArtifactType.Component => "component",
            _ => "document",
        };
    }
}
