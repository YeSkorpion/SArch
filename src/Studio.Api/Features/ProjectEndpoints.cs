namespace Studio.Api.Features;

public static class ProjectEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects", List);
        group.MapPost("/projects", Create);
        group.MapGet("/projects/{projectId:guid}", Get);
        group.MapPatch("/projects/{projectId:guid}", Update);
        group.MapPost("/projects/{projectId:guid}/archive", Archive);
        group.MapPost("/projects/{projectId:guid}/restore", Restore);
        group.MapDelete("/projects/{projectId:guid}", Delete);
        group.MapGet("/projects/{projectId:guid}/members", Members);
        group.MapPost("/projects/{projectId:guid}/members", AddMember);
        group.MapPatch("/projects/{projectId:guid}/members/{userId:guid}", UpdateMember);
        group.MapDelete("/projects/{projectId:guid}/members/{userId:guid}", RemoveMember);
    }

    private static async Task<IResult> List(AppDbContext db, ClaimsPrincipal principal, bool includeArchived = true, CancellationToken ct = default)
    {
        var userId = CurrentUser.Id(principal)!.Value;
        var query = db.Memberships.AsNoTracking().Where(item => item.UserId == userId);
        if (!includeArchived)
        {
            query = query.Where(item => !item.Project.IsArchived);
        }

        var items = await query
            .OrderBy(item => item.Project.Name).ThenBy(item => item.ProjectId)
            .Select(item => new ProjectResponse(item.ProjectId, item.Project.Name, item.Project.Description, item.Project.IsArchived, item.Project.Version, item.Role, item.Project.UpdatedAt))
            .ToListAsync(ct);
        return Results.Ok(items);
    }

    private static async Task<IResult> Create(AppDbContext db, TimeProvider clock, ClaimsPrincipal principal, HttpContext http, CreateProjectRequest body, CancellationToken ct)
    {
        var invalid = Validate(http, body.Name, body.Description);
        if (invalid is not null)
        {
            return invalid;
        }

        var now = clock.GetUtcNow();
        var userId = CurrentUser.Id(principal)!.Value;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var project = new Project
        {
            Id = Guid.CreateVersion7(),
            Name = body.Name.Trim(),
            Description = body.Description?.Trim() ?? "",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Projects.Add(project);
        db.Memberships.Add(new ProjectMembership
        {
            Id = Guid.CreateVersion7(),
            ProjectId = project.Id,
            UserId = userId,
            Role = ProjectRole.Owner,
            CreatedAt = now,
        });
        db.ProjectCounters.Add(new ProjectCounter { ProjectId = project.Id, NextRequirement = 0 });
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(new ProjectResponse(project.Id, project.Name, project.Description, false, project.Version, ProjectRole.Owner, project.UpdatedAt));
    }

    private static async Task<IResult> Get(ProjectGuard guard, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        return gate.Failed
            ? gate.Error!
            : Results.Ok(new ProjectResponse(gate.Project!.Id, gate.Project.Name, gate.Project.Description, gate.Project.IsArchived, gate.Project.Version, gate.Role, gate.Project.UpdatedAt));
    }

    private static async Task<IResult> Update(AppDbContext db, ProjectGuard guard, TimeProvider clock, Guid projectId, UpdateProjectRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Manage, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = Validate(http, body.Name, body.Description);
        if (invalid is not null)
        {
            return invalid;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var project = await LockProject(db, projectId, ct);
        if (project is null)
        {
            return Problems.NotFound(http);
        }

        if (project.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert.", "version_conflict", project.Version);
        }

        project.Name = body.Name.Trim();
        project.Description = body.Description?.Trim() ?? "";
        project.Version++;
        project.UpdatedAt = clock.GetUtcNow();
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(new ProjectResponse(project.Id, project.Name, project.Description, project.IsArchived, project.Version, gate.Role, project.UpdatedAt));
    }

    private static async Task<IResult> Archive(AppDbContext db, ProjectGuard guard, TimeProvider clock, Guid projectId, VersionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Owner, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (gate.Project!.IsArchived)
        {
            return Problems.Conflict(http, "Das Projekt ist bereits archiviert.", "archived");
        }

        return await SetArchived(db, clock, projectId, body.Version, true, gate.Role, http, ct);
    }

    private static async Task<IResult> Restore(AppDbContext db, ProjectGuard guard, TimeProvider clock, Guid projectId, VersionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Owner, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (!gate.Project!.IsArchived)
        {
            return Problems.Conflict(http, "Das Projekt ist bereits geöffnet.", "not_archived");
        }

        return await SetArchived(db, clock, projectId, body.Version, false, gate.Role, http, ct);
    }

    private static async Task<IResult> Delete(AppDbContext db, ProjectGuard guard, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Owner, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var project = await LockProject(db, projectId, ct);
        if (project is null)
        {
            return Problems.NotFound(http);
        }

        await db.DiagramEdges.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.ScreenNavigations.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.ArtifactLinks.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.DocumentRevisions.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.Documents.Where(item => item.ProjectId == projectId).ExecuteUpdateAsync(setters => setters.SetProperty(item => item.ParentId, (Guid?)null), ct);
        await db.Documents.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.DiagramNodes.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.FlowEntries.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.Screens.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.Components.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.Requirements.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.Diagrams.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.Artifacts.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        await db.Areas.Where(item => item.ProjectId == projectId).ExecuteUpdateAsync(setters => setters.SetProperty(item => item.ParentId, (Guid?)null), ct);
        await db.Areas.Where(item => item.ProjectId == projectId).ExecuteDeleteAsync(ct);
        db.Projects.Remove(project);
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> Members(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var items = await db.Memberships.AsNoTracking()
            .Where(item => item.ProjectId == projectId)
            .OrderBy(item => item.Role).ThenBy(item => item.User.DisplayName).ThenBy(item => item.UserId)
            .Select(item => new MemberResponse(item.UserId, item.User.Email ?? "", item.User.DisplayName, item.Role, item.CreatedAt))
            .ToListAsync(ct);
        return Results.Ok(items);
    }

    private static async Task<IResult> AddMember(ProjectGuard guard, AppDbContext db, UserManager<AppUser> users, TimeProvider clock, Guid projectId, AddMemberRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Manage, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var email = body.Email?.Trim() ?? "";
        var user = await users.FindByEmailAsync(email);
        if (user is null)
        {
            return Problems.NotFound(http, "Für diese E-Mail-Adresse gibt es kein Konto.");
        }

        if (await db.Memberships.AnyAsync(item => item.ProjectId == projectId && item.UserId == user.Id, ct))
        {
            return Problems.Conflict(http, "Die Person ist bereits Mitglied.", "already_member");
        }

        db.Memberships.Add(new ProjectMembership
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            UserId = user.Id,
            Role = body.Role,
            CreatedAt = clock.GetUtcNow(),
        });
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        return Results.Ok(new MemberResponse(user.Id, user.Email ?? email, user.DisplayName, body.Role, clock.GetUtcNow()));
    }

    private static async Task<IResult> UpdateMember(ProjectGuard guard, AppDbContext db, Guid projectId, Guid userId, UpdateMemberRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Manage, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var members = await db.Memberships.Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var member = members.FirstOrDefault(item => item.UserId == userId);
        if (member is null)
        {
            return Problems.NotFound(http);
        }

        if (MembershipRules.LastOwner(members, userId, body.Role, removing: false) is string problem)
        {
            return Problems.Conflict(http, problem, "last_owner");
        }

        member.Role = body.Role;
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.NoContent();
    }

    private static async Task<IResult> RemoveMember(ProjectGuard guard, AppDbContext db, Guid projectId, Guid userId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Manage, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var members = await db.Memberships.Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var member = members.FirstOrDefault(item => item.UserId == userId);
        if (member is null)
        {
            return Problems.NotFound(http);
        }

        if (MembershipRules.LastOwner(members, userId, null, removing: true) is string problem)
        {
            return Problems.Conflict(http, problem, "last_owner");
        }

        db.Memberships.Remove(member);
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.NoContent();
    }

    private static async Task<IResult> SetArchived(AppDbContext db, TimeProvider clock, Guid projectId, int version, bool archived, ProjectRole role, HttpContext http, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var project = await LockProject(db, projectId, ct);
        if (project is null)
        {
            return Problems.NotFound(http);
        }

        if (project.Version != version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert.", "version_conflict", project.Version);
        }

        project.IsArchived = archived;
        project.ArchivedAt = archived ? clock.GetUtcNow() : null;
        project.Version++;
        project.UpdatedAt = clock.GetUtcNow();
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(new ProjectResponse(project.Id, project.Name, project.Description, project.IsArchived, project.Version, role, project.UpdatedAt));
    }

    private static Task<Project?> LockProject(AppDbContext db, Guid projectId, CancellationToken ct) =>
        db.Projects.FromSqlInterpolated($"SELECT * FROM projects WHERE id = {projectId} FOR UPDATE").AsTracking().FirstOrDefaultAsync(ct);

    private static IResult? Validate(HttpContext http, string? name, string? description)
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
