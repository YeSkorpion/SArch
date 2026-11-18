using Npgsql;

namespace Studio.Api.Infrastructure;

public static class Problems
{
    public static IResult BadRequest(HttpContext http, params string[] errors) =>
        Status(http, StatusCodes.Status400BadRequest, "Ungültige Eingabe", errors.Length == 1 ? errors[0] : "Die Eingabe ist ungültig.", "validation", errors: errors);

    public static IResult NotFound(HttpContext http, string detail = "Die angeforderte Ressource wurde nicht gefunden.") =>
        Status(http, StatusCodes.Status404NotFound, "Nicht gefunden", detail, "not_found");

    public static IResult Forbidden(HttpContext http, string detail) =>
        Status(http, StatusCodes.Status403Forbidden, "Keine Berechtigung", detail, "forbidden");

    public static IResult Conflict(HttpContext http, string detail, string code, int? currentVersion = null) =>
        Status(http, StatusCodes.Status409Conflict, "Konflikt", detail, code, currentVersion);

    public static IResult Status(HttpContext http, int status, string title, string detail, string? code = null, int? currentVersion = null, string[]? errors = null)
    {
        var extensions = new Dictionary<string, object?>
        {
            ["correlationId"] = http.Items["CorrelationId"]?.ToString(),
        };
        if (code is not null)
        {
            extensions["code"] = code;
        }

        if (currentVersion is not null)
        {
            extensions["currentVersion"] = currentVersion;
        }

        if (errors is not null)
        {
            extensions["errors"] = errors;
        }

        return Results.Problem(title: title, detail: detail, statusCode: status, extensions: extensions);
    }
}

public static class DbSave
{
    public static async Task<IResult?> SaveAsync(AppDbContext db, HttpContext http, CancellationToken ct)
    {
        var projects = ChangedProjectIds(db);
        try
        {
            var written = await db.SaveChangesAsync(ct);
            if (written > 0)
            {
                foreach (var id in projects)
                {
                    await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE projects SET content_revision = content_revision + 1 WHERE id = {id}", ct);
                }
            }

            return null;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException postgres)
        {
            IResult? result = postgres.SqlState switch
            {
                PostgresErrorCodes.UniqueViolation => Problems.Conflict(http, "Der Eintrag existiert bereits.", "duplicate"),
                PostgresErrorCodes.ForeignKeyViolation => Problems.BadRequest(http, "Ein Verweis zeigt auf ein fehlendes oder fremdes Element."),
                PostgresErrorCodes.CheckViolation => Problems.BadRequest(http, "Die Verknüpfung ist unzulässig."),
                _ => null,
            };
            if (result is not null)
            {
                return result;
            }

            throw;
        }
    }

    private static List<Guid> ChangedProjectIds(AppDbContext db)
    {
        var ids = new HashSet<Guid>();
        foreach (var entry in db.ChangeTracker.Entries())
        {
            if (entry.State is EntityState.Unchanged or EntityState.Detached) continue;
            if (entry.Entity is Project project)
            {
                ids.Add(project.Id);
                continue;
            }

            var property = entry.Properties.FirstOrDefault(item => item.Metadata.Name == "ProjectId");
            if (property?.CurrentValue is Guid projectId && projectId != Guid.Empty) ids.Add(projectId);
        }

        return [.. ids];
    }
}

public enum Access
{
    Read,
    Write,
    Manage,
    Owner,
}

public sealed record GuardResult(IResult? Error, Guid UserId, Project? Project, ProjectRole Role)
{
    public bool Failed => Error is not null;
}

public sealed class ProjectGuard(AppDbContext db)
{
    public async Task<GuardResult> Require(ClaimsPrincipal principal, Guid projectId, Access access, CancellationToken ct)
    {
        var userId = CurrentUser.Id(principal);
        if (userId is null)
        {
            return new GuardResult(Results.Unauthorized(), Guid.Empty, null, ProjectRole.Viewer);
        }

        var project = await db.Projects.AsNoTracking().FirstOrDefaultAsync(item => item.Id == projectId, ct);
        var membership = project is null
            ? null
            : await db.Memberships.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.UserId == userId, ct);
        if (project is null || membership is null)
        {
            return new GuardResult(Results.Problem(title: "Nicht gefunden", detail: "Die angeforderte Ressource wurde nicht gefunden.", statusCode: StatusCodes.Status404NotFound), userId.Value, null, ProjectRole.Viewer);
        }

        var allowed = access switch
        {
            Access.Read => true,
            Access.Write => membership.Role is ProjectRole.Owner or ProjectRole.Editor && !project.IsArchived,
            Access.Manage => membership.Role == ProjectRole.Owner && !project.IsArchived,
            Access.Owner => membership.Role == ProjectRole.Owner,
            _ => false,
        };
        if (allowed)
        {
            return new GuardResult(null, userId.Value, project, membership.Role);
        }

        var detail = project.IsArchived && membership.Role is ProjectRole.Owner or ProjectRole.Editor
            ? "Das Projekt ist archiviert und kann nur gelesen werden."
            : "Dafür fehlt die erforderliche Projektrolle.";
        return new GuardResult(Results.Problem(title: "Keine Berechtigung", detail: detail, statusCode: StatusCodes.Status403Forbidden), userId.Value, project, membership.Role);
    }
}

public static class CurrentUser
{
    public static Guid? Id(ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }
}

public static class Paging
{
    public static (int Page, int PageSize) Normalize(int page, int pageSize)
    {
        var normalizedPage = page < 1 ? 1 : page;
        var normalizedSize = pageSize is < 1 or > 100 ? 30 : pageSize;
        return (normalizedPage, normalizedSize);
    }
}

public static class Artifacts
{
    public static Artifact Create(Guid projectId, ArtifactType type, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(),
        ProjectId = projectId,
        Type = type,
        CreatedAt = now,
        UpdatedAt = now,
    };
}

public sealed record ArtifactLabel(Guid Id, ArtifactType Type, string Title, string? NodeType, Guid? DiagramId);

public static class ArtifactCatalog
{
    public static async Task<Dictionary<Guid, ArtifactLabel>> Labels(AppDbContext db, Guid projectId, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToArray();
        if (list.Length == 0)
        {
            return [];
        }

        var artifacts = await db.Artifacts.AsNoTracking().Where(item => item.ProjectId == projectId && list.Contains(item.Id)).ToListAsync(ct);
        var map = new Dictionary<Guid, ArtifactLabel>();
        var requirementIds = artifacts.Where(item => item.Type == ArtifactType.Requirement).Select(item => item.Id).ToArray();
        var diagramIds = artifacts.Where(item => item.Type == ArtifactType.Diagram).Select(item => item.Id).ToArray();
        var nodeIds = artifacts.Where(item => item.Type == ArtifactType.DiagramNode).Select(item => item.Id).ToArray();
        var screenIds = artifacts.Where(item => item.Type == ArtifactType.Screen).Select(item => item.Id).ToArray();
        var componentIds = artifacts.Where(item => item.Type == ArtifactType.Component).Select(item => item.Id).ToArray();
        var documentIds = artifacts.Where(item => item.Type == ArtifactType.Document).Select(item => item.Id).ToArray();

        foreach (var item in await db.Requirements.AsNoTracking().Where(item => requirementIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.Key, item.Title }).ToListAsync(ct))
        {
            map[item.ArtifactId] = new ArtifactLabel(item.ArtifactId, ArtifactType.Requirement, $"{item.Key} {item.Title}", null, null);
        }

        foreach (var item in await db.Diagrams.AsNoTracking().Where(item => diagramIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.Name, item.Kind }).ToListAsync(ct))
        {
            map[item.ArtifactId] = new ArtifactLabel(item.ArtifactId, ArtifactType.Diagram, item.Name, item.Kind.ToString(), null);
        }

        foreach (var item in await db.DiagramNodes.AsNoTracking().Where(item => nodeIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.Title, item.NodeType, item.DiagramId }).ToListAsync(ct))
        {
            map[item.ArtifactId] = new ArtifactLabel(item.ArtifactId, ArtifactType.DiagramNode, item.Title, item.NodeType, item.DiagramId);
        }

        foreach (var item in await db.Screens.AsNoTracking().Where(item => screenIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.Name }).ToListAsync(ct))
        {
            map[item.ArtifactId] = new ArtifactLabel(item.ArtifactId, ArtifactType.Screen, item.Name, null, null);
        }

        foreach (var item in await db.Components.AsNoTracking().Where(item => componentIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.Name }).ToListAsync(ct))
        {
            map[item.ArtifactId] = new ArtifactLabel(item.ArtifactId, ArtifactType.Component, item.Name, null, null);
        }

        foreach (var item in await db.Documents.AsNoTracking().Where(item => documentIds.Contains(item.ArtifactId)).Select(item => new { item.ArtifactId, item.Title }).ToListAsync(ct))
        {
            map[item.ArtifactId] = new ArtifactLabel(item.ArtifactId, ArtifactType.Document, item.Title, null, null);
        }

        return map;
    }
}

public static class MembershipRules
{
    public static string? LastOwner(IReadOnlyList<ProjectMembership> members, Guid userId, ProjectRole? newRole, bool removing)
    {
        var owners = members.Where(member => member.Role == ProjectRole.Owner).ToList();
        if (owners.Count != 1 || owners[0].UserId != userId)
        {
            return null;
        }

        if (removing || newRole != ProjectRole.Owner)
        {
            return "Das Projekt braucht mindestens eine Eigentümerin oder einen Eigentümer.";
        }

        return null;
    }
}
