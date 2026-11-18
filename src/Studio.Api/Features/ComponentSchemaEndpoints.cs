namespace Studio.Api.Features;

public static class ComponentSchemaEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/components/{componentId:guid}/sections", List);
        group.MapPost("/projects/{projectId:guid}/components/{componentId:guid}/sections", CreateSection);
        group.MapPatch("/projects/{projectId:guid}/components/{componentId:guid}/sections/{sectionId:guid}", UpdateSection);
        group.MapDelete("/projects/{projectId:guid}/components/{componentId:guid}/sections/{sectionId:guid}", DeleteSection);
        group.MapPost("/projects/{projectId:guid}/components/{componentId:guid}/sections/{sectionId:guid}/columns", CreateColumn);
        group.MapPatch("/projects/{projectId:guid}/components/{componentId:guid}/sections/{sectionId:guid}/columns/{columnId:guid}", UpdateColumn);
        group.MapDelete("/projects/{projectId:guid}/components/{componentId:guid}/sections/{sectionId:guid}/columns/{columnId:guid}", DeleteColumn);
    }

    public static ComponentSectionKind SectionKindFor(ComponentKind kind) => kind switch
    {
        ComponentKind.Database => ComponentSectionKind.Table,
        ComponentKind.Api => ComponentSectionKind.Endpoint,
        ComponentKind.Service => ComponentSectionKind.Operation,
        ComponentKind.Queue => ComponentSectionKind.Message,
        ComponentKind.Client => ComponentSectionKind.View,
        _ => ComponentSectionKind.Integration,
    };

    private static async Task<IResult> List(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        if (!await Exists(db, projectId, componentId, ct)) return Problems.NotFound(http);
        return Results.Ok(await Tree(db, projectId, componentId, ct));
    }

    private static async Task<IResult> CreateSection(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, SchemaSectionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        if (!await Exists(db, projectId, componentId, ct)) return Problems.NotFound(http);
        var error = await ValidateSection(db, http, componentId, null, body, ct);
        if (error is not null) return error;
        var count = await db.ComponentSections.CountAsync(item => item.ComponentId == componentId, ct);
        if (count >= 100) return Problems.BadRequest(http, "Eine Komponente kann höchstens 100 Einträge dieser Art haben.");
        var position = await db.ComponentSections.Where(item => item.ComponentId == componentId).Select(item => (int?)item.Position).MaxAsync(ct) ?? 0;
        db.ComponentSections.Add(new ComponentSection
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            ComponentId = componentId,
            Kind = body.Kind,
            Position = position + 1,
            Title = body.Title.Trim(),
            Subtitle = body.Subtitle.Trim(),
            Description = body.Description.Trim(),
        });
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Tree(db, projectId, componentId, ct));
    }

    private static async Task<IResult> UpdateSection(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, Guid sectionId, SchemaSectionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var section = await db.ComponentSections.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ComponentId == componentId && item.Id == sectionId, ct);
        if (section is null) return Problems.NotFound(http);
        var error = await ValidateSection(db, http, componentId, sectionId, body, ct);
        if (error is not null) return error;
        section.Kind = body.Kind;
        section.Title = body.Title.Trim();
        section.Subtitle = body.Subtitle.Trim();
        section.Description = body.Description.Trim();
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Tree(db, projectId, componentId, ct));
    }

    private static async Task<IResult> DeleteSection(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, Guid sectionId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var section = await db.ComponentSections.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ComponentId == componentId && item.Id == sectionId, ct);
        if (section is null) return Problems.NotFound(http);
        db.ComponentSections.Remove(section);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Tree(db, projectId, componentId, ct));
    }

    private static async Task<IResult> CreateColumn(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, Guid sectionId, SchemaColumnRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var section = await db.ComponentSections.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ComponentId == componentId && item.Id == sectionId, ct);
        if (section is null) return Problems.NotFound(http);
        var error = await ValidateColumn(db, http, section, null, body, ct);
        if (error is not null) return error;
        var count = await db.ComponentColumns.CountAsync(item => item.SectionId == sectionId, ct);
        if (count >= 200) return Problems.BadRequest(http, "Ein Eintrag kann höchstens 200 Felder haben.");
        var position = await db.ComponentColumns.Where(item => item.SectionId == sectionId).Select(item => (int?)item.Position).MaxAsync(ct) ?? 0;
        db.ComponentColumns.Add(Apply(new ComponentColumn
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            SectionId = sectionId,
            Position = position + 1,
        }, body));
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Tree(db, projectId, componentId, ct));
    }

    private static async Task<IResult> UpdateColumn(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, Guid sectionId, Guid columnId, SchemaColumnRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var section = await db.ComponentSections.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ComponentId == componentId && item.Id == sectionId, ct);
        if (section is null) return Problems.NotFound(http);
        var column = await db.ComponentColumns.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.SectionId == sectionId && item.Id == columnId, ct);
        if (column is null) return Problems.NotFound(http);
        var error = await ValidateColumn(db, http, section, columnId, body, ct);
        if (error is not null) return error;
        Apply(column, body);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Tree(db, projectId, componentId, ct));
    }

    private static async Task<IResult> DeleteColumn(ProjectGuard guard, AppDbContext db, Guid projectId, Guid componentId, Guid sectionId, Guid columnId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var column = await db.ComponentColumns.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.SectionId == sectionId && item.Id == columnId, ct);
        if (column is null || !await db.ComponentSections.AnyAsync(item => item.Id == sectionId && item.ComponentId == componentId, ct)) return Problems.NotFound(http);
        db.ComponentColumns.Remove(column);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Tree(db, projectId, componentId, ct));
    }

    private static async Task<bool> Exists(AppDbContext db, Guid projectId, Guid componentId, CancellationToken ct) =>
        await db.Components.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == componentId, ct);

    private static async Task<List<SchemaSectionResponse>> Tree(AppDbContext db, Guid projectId, Guid componentId, CancellationToken ct)
    {
        var sections = await db.ComponentSections.AsNoTracking().Where(item => item.ProjectId == projectId && item.ComponentId == componentId).OrderBy(item => item.Position).ToListAsync(ct);
        var ids = sections.Select(item => item.Id).ToList();
        var columns = await db.ComponentColumns.AsNoTracking().Where(item => ids.Contains(item.SectionId)).OrderBy(item => item.Position).ToListAsync(ct);
        return sections.Select(section => new SchemaSectionResponse(
            section.Id,
            section.Kind,
            section.Title,
            section.Subtitle,
            section.Description,
            section.Position,
            columns.Where(item => item.SectionId == section.Id).Select(item => new SchemaColumnResponse(item.Id, item.Name, item.DataType, item.Required, item.IsKey, item.Role, item.Notes, item.Position)).ToList())).ToList();
    }

    private static async Task<IResult?> ValidateSection(AppDbContext db, HttpContext http, Guid componentId, Guid? sectionId, SchemaSectionRequest body, CancellationToken ct)
    {
        if (!Enum.IsDefined(body.Kind)) return Problems.BadRequest(http, "Die Art des Eintrags ist ungültig.");
        var title = body.Title.Trim();
        var subtitle = body.Subtitle.Trim();
        var description = body.Description.Trim();
        if (title.Length is < 1 or > 160) return Problems.BadRequest(http, "Der Name braucht 1 bis 160 Zeichen.");
        if (subtitle.Length > 160 || description.Length > 2000) return Problems.BadRequest(http, "Zusatz und Beschreibung sind zu lang.");
        if (body.Kind == ComponentSectionKind.Endpoint && subtitle is not ("GET" or "POST" or "PUT" or "PATCH" or "DELETE")) return Problems.BadRequest(http, "Die Methode muss GET, POST, PUT, PATCH oder DELETE sein.");
        var taken = await db.ComponentSections.AnyAsync(item => item.ComponentId == componentId && item.Id != sectionId && item.Kind == body.Kind && item.Title.ToLower() == title.ToLower() && item.Subtitle.ToLower() == subtitle.ToLower(), ct);
        return taken ? Problems.BadRequest(http, "Diesen Eintrag gibt es schon.") : null;
    }

    private static async Task<IResult?> ValidateColumn(AppDbContext db, HttpContext http, ComponentSection section, Guid? columnId, SchemaColumnRequest body, CancellationToken ct)
    {
        var name = body.Name.Trim();
        var type = body.DataType.Trim();
        var role = body.Role.Trim();
        var notes = body.Notes.Trim();
        if (name.Length is < 1 or > 80) return Problems.BadRequest(http, "Der Feldname braucht 1 bis 80 Zeichen.");
        if (type.Length > 40 || role.Length > 32 || notes.Length > 500) return Problems.BadRequest(http, "Typ, Rolle oder Notiz sind zu lang.");
        var roles = Roles(section.Kind);
        if (roles.Length == 0 && role.Length > 0) return Problems.BadRequest(http, "Dieses Feld hat keine Rolle.");
        if (roles.Length > 0 && !roles.Contains(role)) return Problems.BadRequest(http, "Die Rolle ist ungültig.");
        var taken = await db.ComponentColumns.AnyAsync(item => item.SectionId == section.Id && item.Id != columnId && item.Name.ToLower() == name.ToLower(), ct);
        return taken ? Problems.BadRequest(http, "Diesen Feldnamen gibt es in dem Eintrag schon.") : null;
    }

    private static string[] Roles(ComponentSectionKind kind) => kind switch
    {
        ComponentSectionKind.Endpoint => ["Pfad", "Query", "Header", "Body"],
        ComponentSectionKind.Operation or ComponentSectionKind.Integration => ["Eingabe", "Ausgabe"],
        _ => [],
    };

    private static ComponentColumn Apply(ComponentColumn column, SchemaColumnRequest body)
    {
        column.Name = body.Name.Trim();
        column.DataType = body.DataType.Trim();
        column.Required = body.Required;
        column.IsKey = body.IsKey;
        column.Role = body.Role.Trim();
        column.Notes = body.Notes.Trim();
        return column;
    }
}
