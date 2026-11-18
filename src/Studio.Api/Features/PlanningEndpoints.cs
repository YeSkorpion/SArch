using System.Text.RegularExpressions;

namespace Studio.Api.Features;

public static partial class PlanningEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        ComponentSchemaEndpoints.Map(group);
        group.MapGet("/projects/{projectId:guid}/components", ListComponents);
        group.MapPost("/projects/{projectId:guid}/components", CreateComponent);
        group.MapGet("/projects/{projectId:guid}/components/{componentId:guid}", GetComponent);
        group.MapPatch("/projects/{projectId:guid}/components/{componentId:guid}", UpdateComponent);
        group.MapGet("/projects/{projectId:guid}/screens", ListScreens);
        group.MapPost("/projects/{projectId:guid}/screens", CreateScreen);
        group.MapGet("/projects/{projectId:guid}/screens/{screenId:guid}", GetScreen);
        group.MapPut("/projects/{projectId:guid}/screens/{screenId:guid}", UpdateScreen);
    }

    private static async Task<IResult> ListComponents(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var items = await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Name).ThenBy(item => item.ArtifactId).ToListAsync(ct);
        var counts = await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId && item.ComponentId != null)
            .GroupBy(item => item.ComponentId).Select(group => new { Id = group.Key, Count = group.Count() }).ToListAsync(ct);
        var countMap = counts.ToDictionary(item => item.Id!.Value, item => item.Count);
        var sections = await db.ComponentSections.AsNoTracking().Where(item => item.ProjectId == projectId).Select(item => new { item.ComponentId, item.Kind }).ToListAsync(ct);
        return Results.Ok(items.Select(item => Map(item, countMap.GetValueOrDefault(item.ArtifactId), sections.Count(section => section.ComponentId == item.ArtifactId && section.Kind == ComponentSchemaEndpoints.SectionKindFor(item.Kind)))).ToList());
    }

    private static async Task<IResult> CreateComponent(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateComponentRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateComponent(http, body.Name, body.Description, body.Technology);
        if (invalid is not null)
        {
            return invalid;
        }

        var now = clock.GetUtcNow();
        var artifact = Artifacts.Create(projectId, ArtifactType.Component, now);
        var component = new Component
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            Name = body.Name.Trim(),
            Description = body.Description?.Trim() ?? "",
            Kind = body.Kind,
            Technology = NullIfEmpty(body.Technology),
            CreatedAt = now,
            UpdatedAt = now,
        };
        component.SearchText = SearchText.Build(component.Name, component.Description, component.Technology);
        db.Artifacts.Add(artifact);
        db.Components.Add(component);
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.Created($"/api/v1/projects/{projectId}/components/{component.ArtifactId}", Map(component, 0));
    }

    private static async Task<IResult> GetComponent(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var component = await db.Components.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == componentId, ct);
        if (component is null)
        {
            return Problems.NotFound(http);
        }

        var count = await db.DiagramNodes.CountAsync(item => item.ComponentId == componentId, ct);
        var details = await DetailCount(db, projectId, componentId, component.Kind, ct);
        return Results.Ok(Map(component, count, details));
    }

    private static async Task<IResult> UpdateComponent(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid componentId, UpdateComponentRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateComponent(http, body.Name, body.Description, body.Technology);
        if (invalid is not null)
        {
            return invalid;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var component = await db.Components.FromSqlInterpolated($"SELECT * FROM components WHERE artifact_id = {componentId} AND project_id = {projectId} FOR UPDATE").AsTracking().FirstOrDefaultAsync(ct);
        if (component is null)
        {
            return Problems.NotFound(http);
        }

        if (component.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", component.Version);
        }

        var now = clock.GetUtcNow();
        component.Name = body.Name.Trim();
        component.Description = body.Description?.Trim() ?? "";
        component.Kind = body.Kind;
        component.Technology = NullIfEmpty(body.Technology);
        component.SearchText = SearchText.Build(component.Name, component.Description, component.Technology);
        component.Version++;
        component.UpdatedAt = now;
        var placements = await db.DiagramNodes.Where(item => item.ComponentId == componentId).ToListAsync(ct);
        foreach (var placement in placements)
        {
            placement.Title = component.Name;
            placement.SearchText = SearchText.Build(component.Name, placement.Description, component.Technology);
            placement.UpdatedAt = now;
        }

        var artifact = await db.Artifacts.FirstAsync(item => item.Id == componentId, ct);
        artifact.UpdatedAt = now;
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(Map(component, placements.Count, await DetailCount(db, projectId, componentId, component.Kind, ct)));
    }

    private static async Task<IResult> ListScreens(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var items = await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Name).ThenBy(item => item.ArtifactId).ToListAsync(ct);
        return Results.Ok(items.Select(Map).ToList());
    }

    private static async Task<IResult> CreateScreen(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateScreenRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateScreen(http, body.Name, body.Route, body.Purpose, null);
        if (invalid is not null)
        {
            return invalid;
        }

        var now = clock.GetUtcNow();
        var artifact = Artifacts.Create(projectId, ArtifactType.Screen, now);
        var screen = new Screen
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            Name = body.Name.Trim(),
            Route = body.Route.Trim(),
            Purpose = body.Purpose?.Trim() ?? "",
            Notes = "",
            WireframeJson = WireframeRules.Serialize(WireframeRules.Empty()),
            CreatedAt = now,
            UpdatedAt = now,
        };
        screen.SearchText = SearchText.Build(screen.Name, screen.Route, screen.Purpose);
        db.Artifacts.Add(artifact);
        db.Screens.Add(screen);
        var error = await DbSave.SaveAsync(db, http, ct);
        return error ?? Results.Created($"/api/v1/projects/{projectId}/screens/{screen.ArtifactId}", Map(screen));
    }

    private static async Task<IResult> GetScreen(ProjectGuard guard, AppDbContext db, Guid projectId, Guid screenId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var screen = await db.Screens.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == screenId, ct);
        return screen is null ? Problems.NotFound(http) : Results.Ok(Map(screen));
    }

    private static async Task<IResult> UpdateScreen(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid screenId, UpdateScreenRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var invalid = ValidateScreen(http, body.Name, body.Route, body.Purpose, body.Notes);
        if (invalid is not null)
        {
            return invalid;
        }

        var parsed = WireframeRules.Parse(body.WireframeJson ?? "");
        if (parsed.Errors.Count > 0 || parsed.Model is null)
        {
            return Problems.BadRequest(http, [.. parsed.Errors]);
        }

        var targets = parsed.Model.Desktop.Elements.Concat(parsed.Model.Mobile.Elements)
            .Where(item => item.TargetScreenId is not null).Select(item => item.TargetScreenId!.Value).Distinct().ToArray();
        if (targets.Contains(screenId))
        {
            return Problems.BadRequest(http, "Eine Schaltfläche kann nicht auf denselben Screen zeigen.");
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var screen = await db.Screens.FromSqlInterpolated($"SELECT * FROM screens WHERE artifact_id = {screenId} AND project_id = {projectId} FOR UPDATE").AsTracking().FirstOrDefaultAsync(ct);
        if (screen is null)
        {
            return Problems.NotFound(http);
        }

        if (screen.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", screen.Version);
        }

        var knownTargets = await db.Screens.Where(item => item.ProjectId == projectId && targets.Contains(item.ArtifactId)).Select(item => item.ArtifactId).ToListAsync(ct);
        if (knownTargets.Count != targets.Length)
        {
            return Problems.BadRequest(http, "Ein Navigationsziel gehört nicht zu diesem Projekt.");
        }

        var now = clock.GetUtcNow();
        screen.Name = body.Name.Trim();
        screen.Route = body.Route.Trim();
        screen.Purpose = body.Purpose?.Trim() ?? "";
        screen.Status = body.Status;
        screen.Notes = body.Notes?.Trim() ?? "";
        screen.WireframeJson = WireframeRules.Serialize(parsed.Model);
        screen.SearchText = SearchText.Build(screen.Name, screen.Route, screen.Purpose, screen.Notes);
        screen.Version++;
        screen.UpdatedAt = now;
        var artifact = await db.Artifacts.FirstAsync(item => item.Id == screenId, ct);
        artifact.UpdatedAt = now;

        var existing = await db.ScreenNavigations.Where(item => item.SourceScreenId == screenId).ToListAsync(ct);
        db.ScreenNavigations.RemoveRange(existing);
        foreach (var element in parsed.Model.Desktop.Elements.Concat(parsed.Model.Mobile.Elements).Where(item => item.TargetScreenId is not null))
        {
            db.ScreenNavigations.Add(new ScreenNavigation
            {
                Id = Guid.CreateVersion7(),
                ProjectId = projectId,
                SourceScreenId = screenId,
                ElementId = element.Id,
                TargetScreenId = element.TargetScreenId!.Value,
            });
        }

        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(Map(screen));
    }

    private static ComponentResponse Map(Component item, int placements, int details = 0) =>
        new(item.ArtifactId, item.Name, item.Description, item.Kind, item.Technology, item.Version, placements, details, item.UpdatedAt);

    private static async Task<int> DetailCount(AppDbContext db, Guid projectId, Guid componentId, ComponentKind kind, CancellationToken ct)
    {
        var sectionKind = ComponentSchemaEndpoints.SectionKindFor(kind);
        return await db.ComponentSections.CountAsync(item => item.ProjectId == projectId && item.ComponentId == componentId && item.Kind == sectionKind, ct);
    }

    private static ScreenResponse Map(Screen item) =>
        new(item.ArtifactId, item.Name, item.Route, item.Purpose, item.Status, item.Notes, item.WireframeJson, item.Version, item.UpdatedAt);

    private static IResult? ValidateComponent(HttpContext http, string? name, string? description, string? technology)
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

        if (TextInput.Optional(technology, "Technologie", 80) is string technologyError)
        {
            errors.Add(technologyError);
        }

        return errors.Count == 0 ? null : Problems.BadRequest(http, [.. errors]);
    }

    private static IResult? ValidateScreen(HttpContext http, string? name, string? route, string? purpose, string? notes)
    {
        var errors = new List<string>();
        if (TextInput.Required(name, "Name", 160) is string nameError)
        {
            errors.Add(nameError);
        }

        if (string.IsNullOrWhiteSpace(route) || !RoutePattern().IsMatch(route.Trim()))
        {
            errors.Add("Die Route beginnt mit / und enthält nur Buchstaben, Ziffern und die Zeichen / - _ . : ~.");
        }

        if (TextInput.Optional(purpose, "Ziel", 2000) is string purposeError)
        {
            errors.Add(purposeError);
        }

        if (TextInput.Optional(notes, "Notizen", 8000) is string notesError)
        {
            errors.Add(notesError);
        }

        return errors.Count == 0 ? null : Problems.BadRequest(http, [.. errors]);
    }

    private static string? NullIfEmpty(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    [GeneratedRegex("^/[A-Za-z0-9_\\-./:~]*$")]
    private static partial Regex RoutePattern();
}
