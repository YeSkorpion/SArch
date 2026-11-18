namespace Studio.Api.Features;

public static class OrganizationEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/areas", ListAreas);
        group.MapPost("/projects/{projectId:guid}/areas", CreateArea);
        group.MapPut("/projects/{projectId:guid}/areas/{areaId:guid}", UpdateArea);
        group.MapDelete("/projects/{projectId:guid}/areas/{areaId:guid}", DeleteArea);
        group.MapGet("/projects/{projectId:guid}/views", ListViews);
        group.MapPost("/projects/{projectId:guid}/views", CreateView);
        group.MapDelete("/projects/{projectId:guid}/views/{viewId:guid}", DeleteView);
    }

    private static async Task<IResult> ListAreas(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var areas = await db.Areas.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ToListAsync(ct);
        var counts = await db.Diagrams.AsNoTracking()
            .Where(item => item.ProjectId == projectId && item.AreaId != null)
            .GroupBy(item => item.AreaId)
            .Select(group => new { Id = group.Key, Count = group.Count() })
            .ToListAsync(ct);
        var byId = counts.ToDictionary(item => item.Id!.Value, item => item.Count);
        return Results.Ok(areas.Select(item => new AreaResponse(item.Id, item.Name, item.Description, item.SortOrder, byId.GetValueOrDefault(item.Id))).ToList());
    }

    private static async Task<IResult> CreateArea(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, SaveAreaRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateArea(http, body.Name, body.Description);
        if (invalid is not null)
        {
            return invalid;
        }

        var name = body.Name.Trim();
        if (await db.Areas.AnyAsync(item => item.ProjectId == projectId && item.Name == name, ct))
        {
            return Problems.Conflict(http, "Ein Bereich mit diesem Namen besteht bereits.", "duplicate");
        }

        var now = clock.GetUtcNow();
        var sort = await db.Areas.Where(item => item.ProjectId == projectId).Select(item => (int?)item.SortOrder).MaxAsync(ct) ?? 0;
        var area = new Area
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Name = name,
            Description = body.Description?.Trim() ?? "",
            SortOrder = sort + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Areas.Add(area);
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.Created($"/api/v1/projects/{projectId}/areas/{area.Id}", new AreaResponse(area.Id, area.Name, area.Description, area.SortOrder, 0));
    }

    private static async Task<IResult> UpdateArea(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid areaId, SaveAreaRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateArea(http, body.Name, body.Description);
        if (invalid is not null)
        {
            return invalid;
        }

        var area = await db.Areas.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == areaId, ct);
        if (area is null)
        {
            return Problems.NotFound(http);
        }

        var name = body.Name.Trim();
        if (await db.Areas.AnyAsync(item => item.ProjectId == projectId && item.Id != areaId && item.Name == name, ct))
        {
            return Problems.Conflict(http, "Ein Bereich mit diesem Namen besteht bereits.", "duplicate");
        }

        area.Name = name;
        area.Description = body.Description?.Trim() ?? "";
        area.UpdatedAt = clock.GetUtcNow();
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        var count = await db.Diagrams.CountAsync(item => item.AreaId == area.Id, ct);
        return Results.Ok(new AreaResponse(area.Id, area.Name, area.Description, area.SortOrder, count));
    }

    private static async Task<IResult> DeleteArea(ProjectGuard guard, AppDbContext db, Guid projectId, Guid areaId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var area = await db.Areas.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == areaId, ct);
        if (area is null)
        {
            return Problems.NotFound(http);
        }

        if (await db.Diagrams.AnyAsync(item => item.AreaId == areaId, ct))
        {
            return Problems.Conflict(http, "In diesem Bereich liegen noch Diagramme. Verschiebe sie zuerst.", "blocked");
        }

        db.Areas.Remove(area);
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.NoContent();
    }

    private static async Task<IResult> ListViews(ProjectGuard guard, AppDbContext db, Guid projectId, string? scope, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var query = db.SavedViews.AsNoTracking().Where(item => item.ProjectId == projectId);
        if (!string.IsNullOrWhiteSpace(scope))
        {
            query = query.Where(item => item.Scope == scope);
        }

        var views = await query.OrderBy(item => item.Name).ToListAsync(ct);
        var areaIds = views.Where(item => item.AreaId is not null).Select(item => item.AreaId!.Value).Distinct().ToArray();
        var areas = await db.Areas.AsNoTracking().Where(item => areaIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Name, ct);
        return Results.Ok(views.Select(item => new SavedViewResponse(
            item.Id,
            item.Name,
            item.Scope,
            item.AreaId,
            item.AreaId is Guid id && areas.TryGetValue(id, out var name) ? name : null,
            item.Unassigned,
            item.Query)).ToList());
    }

    private static async Task<IResult> CreateView(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateSavedViewRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var errors = new List<string>();
        if (TextInput.Required(body.Name, "Name", 160) is string nameError)
        {
            errors.Add(nameError);
        }

        if (body.Scope is not ("processes" or "system"))
        {
            errors.Add("Die Ansicht gilt für Prozesse oder die Systemarchitektur.");
        }

        if (TextInput.Optional(body.Query, "Suche", 200) is string queryError)
        {
            errors.Add(queryError);
        }

        if (errors.Count > 0)
        {
            return Problems.BadRequest(http, [.. errors]);
        }

        if (body.Unassigned && body.AreaId is not null)
        {
            return Problems.BadRequest(http, "Eine Ansicht filtert entweder einen Bereich oder die Diagramme ohne Bereich.");
        }

        if (body.AreaId is Guid areaId && !await db.Areas.AnyAsync(item => item.Id == areaId && item.ProjectId == projectId, ct))
        {
            return Problems.BadRequest(http, "Der Bereich gehört nicht zu diesem Projekt.");
        }

        var name = body.Name.Trim();
        if (await db.SavedViews.AnyAsync(item => item.ProjectId == projectId && item.Name == name, ct))
        {
            return Problems.Conflict(http, "Eine Ansicht mit diesem Namen besteht bereits.", "duplicate");
        }

        var userId = CurrentUser.Id(http.User);
        if (userId is null)
        {
            return Problems.NotFound(http);
        }

        var view = new SavedView
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Name = name,
            Scope = body.Scope,
            AreaId = body.AreaId,
            Unassigned = body.Unassigned,
            Query = body.Query?.Trim() ?? "",
            CreatedById = userId.Value,
            CreatedAt = clock.GetUtcNow(),
        };
        db.SavedViews.Add(view);
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        string? areaName = null;
        if (view.AreaId is Guid stored)
        {
            areaName = await db.Areas.Where(item => item.Id == stored).Select(item => item.Name).FirstAsync(ct);
        }

        return Results.Created($"/api/v1/projects/{projectId}/views/{view.Id}", new SavedViewResponse(view.Id, view.Name, view.Scope, view.AreaId, areaName, view.Unassigned, view.Query));
    }

    private static async Task<IResult> DeleteView(ProjectGuard guard, AppDbContext db, Guid projectId, Guid viewId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var view = await db.SavedViews.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == viewId, ct);
        if (view is null)
        {
            return Problems.NotFound(http);
        }

        db.SavedViews.Remove(view);
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.NoContent();
    }

    private static IResult? ValidateArea(HttpContext http, string? name, string? description)
    {
        var errors = new List<string>();
        if (TextInput.Required(name, "Name", 160) is string nameError)
        {
            errors.Add(nameError);
        }

        if (TextInput.Optional(description, "Beschreibung", 2000) is string descriptionError)
        {
            errors.Add(descriptionError);
        }

        return errors.Count == 0 ? null : Problems.BadRequest(http, [.. errors]);
    }
}
