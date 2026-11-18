namespace Studio.Api.Features;

public static class RequirementEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/requirements", List);
        group.MapPost("/projects/{projectId:guid}/requirements", Create);
        group.MapGet("/projects/{projectId:guid}/requirements/{requirementId:guid}", Get);
        group.MapPatch("/projects/{projectId:guid}/requirements/{requirementId:guid}", Update);
    }

    private static async Task<IResult> List(
        ProjectGuard guard,
        AppDbContext db,
        Guid projectId,
        RequirementStatus? status,
        RequirementPriority? priority,
        string? missing,
        string? q,
        int? page,
        int? pageSize,
        HttpContext http,
        CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var (normalizedPage, normalizedSize) = Paging.Normalize(page ?? 1, pageSize ?? 30);
        var query = Filtered(db, projectId, status, priority, missing, q);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(item => item.Key).ThenBy(item => item.ArtifactId)
            .Skip((normalizedPage - 1) * normalizedSize).Take(normalizedSize).ToListAsync(ct);
        return Results.Ok(new PageResponse<RequirementResponse>(items.Select(Map).ToList(), normalizedPage, normalizedSize, total));
    }

    public static IQueryable<Requirement> Filtered(AppDbContext db, Guid projectId, RequirementStatus? status, RequirementPriority? priority, string? missing, string? q)
    {
        var query = db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId);
        if (status is not null)
        {
            query = query.Where(item => item.Status == status);
        }

        if (priority is not null)
        {
            query = query.Where(item => item.Priority == priority);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = LikePattern(q);
            query = query.Where(item => EF.Functions.ILike(item.Key, pattern, "\\") || EF.Functions.ILike(item.SearchText, pattern, "\\"));
        }

        if (missing is "process" or "screen" or "component")
        {
            var sourceType = missing switch
            {
                "screen" => ArtifactType.Screen,
                "component" => ArtifactType.Component,
                _ => ArtifactType.DiagramNode,
            };
            query = query.Where(item => !db.ArtifactLinks.Any(link =>
                link.ProjectId == projectId
                && link.TargetArtifactId == item.ArtifactId
                && link.Relation == LinkRelation.Satisfies
                && db.Artifacts.Any(artifact => artifact.Id == link.SourceArtifactId && artifact.Type == sourceType)));
        }

        return query;
    }

    private static async Task<IResult> Create(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateRequirementRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var errors = new List<string>();
        var title = Validate(body.Title, body.Description, errors);
        var tags = TextInput.Tags(body.Tags, errors);
        if (body.AreaId is Guid createdArea && !await db.Areas.AnyAsync(item => item.ProjectId == projectId && item.Id == createdArea, ct))
        {
            errors.Add("Der Fachbereich gehört nicht zu diesem Projekt.");
        }

        if (errors.Count > 0)
        {
            return Problems.BadRequest(http, [.. errors]);
        }

        var now = clock.GetUtcNow();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var counter = await db.ProjectCounters.FromSqlInterpolated($"SELECT * FROM project_counters WHERE project_id = {projectId} FOR UPDATE").AsTracking().SingleAsync(ct);
        counter.NextRequirement++;
        var artifact = Artifacts.Create(projectId, ArtifactType.Requirement, now);
        var requirement = new Requirement
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            Key = $"REQ-{counter.NextRequirement:000}",
            Title = title,
            Description = body.Description?.Trim() ?? "",
            Status = body.Status ?? RequirementStatus.Offen,
            Priority = body.Priority ?? RequirementPriority.Mittel,
            Tags = tags,
            AreaId = body.AreaId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        requirement.SearchText = SearchText.Build(requirement.Key, requirement.Title, requirement.Description, string.Join(' ', requirement.Tags));
        db.Artifacts.Add(artifact);
        db.Requirements.Add(requirement);
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Created($"/api/v1/projects/{projectId}/requirements/{requirement.ArtifactId}", Map(requirement));
    }

    private static async Task<IResult> Get(ProjectGuard guard, AppDbContext db, Guid projectId, Guid requirementId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var requirement = await db.Requirements.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == requirementId, ct);
        return requirement is null ? Problems.NotFound(http) : Results.Ok(Map(requirement));
    }

    private static async Task<IResult> Update(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid requirementId, UpdateRequirementRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var errors = new List<string>();
        var title = Validate(body.Title, body.Description, errors);
        var tags = TextInput.Tags(body.Tags, errors);
        if (body.AreaId is Guid updatedArea && !await db.Areas.AnyAsync(item => item.ProjectId == projectId && item.Id == updatedArea, ct))
        {
            errors.Add("Der Fachbereich gehört nicht zu diesem Projekt.");
        }

        if (errors.Count > 0)
        {
            return Problems.BadRequest(http, [.. errors]);
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var requirement = await db.Requirements.FromSqlInterpolated($"SELECT * FROM requirements WHERE artifact_id = {requirementId} AND project_id = {projectId} FOR UPDATE").AsTracking().FirstOrDefaultAsync(ct);
        if (requirement is null)
        {
            return Problems.NotFound(http);
        }

        if (requirement.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", requirement.Version);
        }

        var now = clock.GetUtcNow();
        requirement.Title = title;
        requirement.Description = body.Description?.Trim() ?? "";
        requirement.Status = body.Status;
        requirement.Priority = body.Priority;
        requirement.Tags = tags;
        requirement.AreaId = body.AreaId;
        requirement.SearchText = SearchText.Build(requirement.Key, requirement.Title, requirement.Description, string.Join(' ', tags));
        requirement.Version++;
        requirement.UpdatedAt = now;
        var artifact = await db.Artifacts.FirstAsync(item => item.Id == requirement.ArtifactId, ct);
        artifact.UpdatedAt = now;
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(Map(requirement));
    }

    public static RequirementResponse Map(Requirement item) => new(
        item.ArtifactId,
        item.Key,
        item.Title,
        item.Description,
        item.Status,
        item.Priority,
        item.Tags,
        item.Version,
        item.CreatedAt,
        item.UpdatedAt,
        item.AreaId);

    public static string LikePattern(string value)
    {
        var escaped = value.Trim().Replace("\\", "\\\\", StringComparison.Ordinal).Replace("%", "\\%", StringComparison.Ordinal).Replace("_", "\\_", StringComparison.Ordinal);
        return $"%{escaped}%";
    }

    private static string Validate(string? title, string? description, List<string> errors)
    {
        if (TextInput.Required(title, "Titel", 200) is string titleError)
        {
            errors.Add(titleError);
        }

        if (TextInput.Optional(description, "Beschreibung", 20000) is string descriptionError)
        {
            errors.Add(descriptionError);
        }

        return title?.Trim() ?? "";
    }
}
