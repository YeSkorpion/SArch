using System.Text.Json;

namespace Studio.Api.Features;

public static class ProjectWorkEndpoints
{
    private static readonly ArtifactType[] SourceTypes =
    [
        ArtifactType.Requirement,
        ArtifactType.Diagram,
        ArtifactType.DiagramNode,
        ArtifactType.Screen,
        ArtifactType.Component,
        ArtifactType.Document,
    ];

    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/artifacts/{artifactId:guid}/sources", ListSources);
        group.MapPost("/projects/{projectId:guid}/artifacts/{artifactId:guid}/sources", CreateSource);
        group.MapPatch("/projects/{projectId:guid}/sources/{sourceId:guid}", UpdateSource);
        group.MapPost("/projects/{projectId:guid}/sources/{sourceId:guid}/check", CheckSource);
        group.MapDelete("/projects/{projectId:guid}/sources/{sourceId:guid}", DeleteSource);
        group.MapGet("/projects/{projectId:guid}/diagrams/{diagramId:guid}/flow", Flow);
        group.MapPut("/projects/{projectId:guid}/diagrams/{diagramId:guid}/flow", SaveFlow);
        group.MapGet("/projects/{projectId:guid}/catalog", ListCatalog);
        group.MapPost("/projects/{projectId:guid}/catalog", CreateCatalog);
        group.MapPatch("/projects/{projectId:guid}/catalog/{tableId:guid}", UpdateCatalog);
        group.MapDelete("/projects/{projectId:guid}/catalog/{tableId:guid}", DeleteCatalog);
        group.MapPost("/projects/{projectId:guid}/catalog/{tableId:guid}/columns", CreateColumn);
        group.MapDelete("/projects/{projectId:guid}/catalog/{tableId:guid}/columns/{columnId:guid}", DeleteColumn);
        group.MapGet("/projects/{projectId:guid}/work", Work);
    }

    private static async Task<IResult> ListSources(ProjectGuard guard, AppDbContext db, Guid projectId, Guid artifactId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        if (!await KnownArtifact(db, projectId, artifactId, ct)) return Problems.NotFound(http);
        var rows = await db.ArtifactSources.AsNoTracking().Where(item => item.ProjectId == projectId && item.ArtifactId == artifactId).OrderBy(item => item.Title).ToListAsync(ct);
        return Results.Ok(rows.Select(MapSource).ToList());
    }

    private static async Task<IResult> CreateSource(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid artifactId, SourceRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        if (!await KnownArtifact(db, projectId, artifactId, ct)) return Problems.NotFound(http);
        var error = ValidateSource(http, body.Title, body.Target);
        if (error is not null) return error;
        var now = clock.GetUtcNow();
        var row = new ArtifactSource
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            ArtifactId = artifactId,
            Kind = body.Kind,
            Title = body.Title.Trim(),
            Target = body.Target.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.ArtifactSources.Add(row);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Created($"/api/v1/projects/{projectId}/sources/{row.Id}", MapSource(row));
    }

    private static async Task<IResult> UpdateSource(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid sourceId, SourceRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var row = await db.ArtifactSources.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == sourceId, ct);
        if (row is null) return Problems.NotFound(http);
        var error = ValidateSource(http, body.Title, body.Target);
        if (error is not null) return error;
        row.Kind = body.Kind;
        row.Title = body.Title.Trim();
        row.Target = body.Target.Trim();
        row.UpdatedAt = clock.GetUtcNow();
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(MapSource(row));
    }

    private static async Task<IResult> CheckSource(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid sourceId, SourceCheckRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var row = await db.ArtifactSources.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == sourceId, ct);
        if (row is null) return Problems.NotFound(http);
        var reference = body.Reference?.Trim() ?? "";
        if (reference.Length > 200) return Problems.BadRequest(http, "Die Referenz darf höchstens 200 Zeichen haben.");
        var author = await db.Users.AsNoTracking().FirstAsync(item => item.Id == gate.UserId, ct);
        row.CheckedAt = clock.GetUtcNow();
        row.CheckedById = gate.UserId;
        row.CheckedByName = author.DisplayName;
        row.CheckedReference = reference.Length == 0 ? null : reference;
        row.CheckedTarget = row.Target;
        row.UpdatedAt = row.CheckedAt.Value;
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(MapSource(row));
    }

    private static async Task<IResult> DeleteSource(ProjectGuard guard, AppDbContext db, Guid projectId, Guid sourceId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var row = await db.ArtifactSources.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == sourceId, ct);
        if (row is null) return Problems.NotFound(http);
        db.ArtifactSources.Remove(row);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.NoContent();
    }

    private static async Task<IResult> Flow(ProjectGuard guard, AppDbContext db, Guid projectId, Guid diagramId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var diagram = await db.Diagrams.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == diagramId && item.Kind == DiagramKind.Process, ct);
        if (diagram is null) return Problems.NotFound(http);
        var choices = await Choices(db, projectId, diagramId, ct);
        var entry = await db.FlowEntries.AsNoTracking().FirstOrDefaultAsync(item => item.DiagramId == diagramId, ct);
        var chosen = entry is null ? null : choices.FirstOrDefault(item => item.NodeId == entry.NodeId && item.ScreenId == entry.ScreenId);
        var screens = await WalkScreens(db, projectId, choices.Select(item => item.ScreenId), ct);
        return Results.Ok(new FlowResponse(choices.Count > 0, chosen?.NodeId, chosen?.ScreenId, chosen?.Title, choices, screens));
    }

    private static async Task<IResult> SaveFlow(ProjectGuard guard, AppDbContext db, Guid projectId, Guid diagramId, FlowEntryRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        if (!await db.Diagrams.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == diagramId && item.Kind == DiagramKind.Process, ct)) return Problems.NotFound(http);
        var choices = await Choices(db, projectId, diagramId, ct);
        if (!choices.Any(item => item.NodeId == body.NodeId && item.ScreenId == body.ScreenId))
        {
            return Problems.BadRequest(http, "Der Einstieg muss ein Prozessschritt mit zugeordnetem Screen sein.");
        }

        var entry = await db.FlowEntries.FirstOrDefaultAsync(item => item.DiagramId == diagramId, ct);
        if (entry is null)
        {
            db.FlowEntries.Add(new FlowEntry { DiagramId = diagramId, ProjectId = projectId, NodeId = body.NodeId, ScreenId = body.ScreenId });
        }
        else
        {
            entry.NodeId = body.NodeId;
            entry.ScreenId = body.ScreenId;
        }

        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.NoContent();
    }

    private static async Task<IResult> ListCatalog(ProjectGuard guard, AppDbContext db, Guid projectId, string? q, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var tables = await Catalog(db, projectId, ct);
        var term = q?.Trim() ?? "";
        if (term.Length > 0)
        {
            tables = tables.Where(item =>
                item.Name.Contains(term, StringComparison.OrdinalIgnoreCase)
                || item.Purpose.Contains(term, StringComparison.OrdinalIgnoreCase)
                || item.Columns.Any(column => column.Name.Contains(term, StringComparison.OrdinalIgnoreCase))).ToList();
        }

        return Results.Ok(tables);
    }

    private static async Task<IResult> CreateCatalog(ProjectGuard guard, AppDbContext db, Guid projectId, CatalogTableRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var error = await ValidateTable(db, http, projectId, body, ct);
        if (error is not null) return error;
        var row = new CatalogTable
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Name = body.Name.Trim(),
            Purpose = body.Purpose?.Trim() ?? "",
            SourceName = body.SourceName?.Trim() ?? "",
            AreaId = body.AreaId,
            DocumentId = body.DocumentId,
        };
        db.CatalogTables.Add(row);
        var saved = await DbSave.SaveAsync(db, http, ct);
        if (saved is not null) return saved;
        var created = (await Catalog(db, projectId, ct)).First(item => item.Id == row.Id);
        return Results.Created($"/api/v1/projects/{projectId}/catalog/{row.Id}", created);
    }

    private static async Task<IResult> UpdateCatalog(ProjectGuard guard, AppDbContext db, Guid projectId, Guid tableId, CatalogTableRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var row = await db.CatalogTables.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == tableId, ct);
        if (row is null) return Problems.NotFound(http);
        var error = await ValidateTable(db, http, projectId, body, ct);
        if (error is not null) return error;
        row.Name = body.Name.Trim();
        row.Purpose = body.Purpose?.Trim() ?? "";
        row.SourceName = body.SourceName?.Trim() ?? "";
        row.AreaId = body.AreaId;
        row.DocumentId = body.DocumentId;
        var saved = await DbSave.SaveAsync(db, http, ct);
        if (saved is not null) return saved;
        return Results.Ok((await Catalog(db, projectId, ct)).First(item => item.Id == tableId));
    }

    private static async Task<IResult> DeleteCatalog(ProjectGuard guard, AppDbContext db, Guid projectId, Guid tableId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var row = await db.CatalogTables.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == tableId, ct);
        if (row is null) return Problems.NotFound(http);
        db.CatalogTables.Remove(row);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.NoContent();
    }

    private static async Task<IResult> CreateColumn(ProjectGuard guard, AppDbContext db, Guid projectId, Guid tableId, CatalogColumnRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var table = await db.CatalogTables.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == tableId, ct);
        if (table is null) return Problems.NotFound(http);
        var name = body.Name?.Trim() ?? "";
        if (name.Length is < 1 or > 80) return Problems.BadRequest(http, "Der Spaltenname braucht 1 bis 80 Zeichen.");
        if (await db.CatalogColumns.AnyAsync(item => item.TableId == tableId && item.Name == name, ct)) return Problems.BadRequest(http, "Diese Spalte gibt es in der Tabelle schon.");
        if (body.ForeignTableId is Guid foreign && !await db.CatalogTables.AnyAsync(item => item.ProjectId == projectId && item.Id == foreign, ct))
        {
            return Problems.BadRequest(http, "Die referenzierte Tabelle gehört nicht zu diesem Projekt.");
        }

        var notes = body.Notes?.Trim() ?? "";
        if (notes.Length > 500) return Problems.BadRequest(http, "Die Notiz darf höchstens 500 Zeichen haben.");
        var position = await db.CatalogColumns.Where(item => item.TableId == tableId).Select(item => (int?)item.Position).MaxAsync(ct) ?? 0;
        db.CatalogColumns.Add(new CatalogColumn
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            TableId = tableId,
            Position = position + 1,
            Name = name,
            IsPrimaryKey = body.IsPrimaryKey,
            ForeignTableId = body.ForeignTableId,
            Notes = notes,
        });
        var saved = await DbSave.SaveAsync(db, http, ct);
        if (saved is not null) return saved;
        return Results.Ok((await Catalog(db, projectId, ct)).First(item => item.Id == tableId));
    }

    private static async Task<IResult> DeleteColumn(ProjectGuard guard, AppDbContext db, Guid projectId, Guid tableId, Guid columnId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var row = await db.CatalogColumns.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.TableId == tableId && item.Id == columnId, ct);
        if (row is null) return Problems.NotFound(http);
        db.CatalogColumns.Remove(row);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.NoContent();
    }

    private static async Task<IResult> Work(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var packages = await db.ChangePackages.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var comments = await db.PackageComments.AsNoTracking().Where(item => item.ProjectId == projectId && item.Status == CommentStatus.Offen).ToListAsync(ct);
        var review = packages
            .Where(item => item.Status == PackageStatus.InPruefung && item.ReviewerId == gate.UserId)
            .OrderByDescending(item => item.UpdatedAt)
            .Select(item => new WorkRow(item.Id, item.Title, "In Prüfung", "Prüfung öffnen", $"/projekte/{projectId}/aenderungen/{item.Id}", item.UpdatedAt))
            .ToList();
        var reviewIds = review.Select(item => item.Id).ToHashSet();
        var commentRows = comments
            .Where(item => item.AssigneeId == gate.UserId || (item.AssigneeId is null && packages.Any(package => package.Id == item.PackageId && package.OwnerId == gate.UserId)))
            .OrderByDescending(item => item.CreatedAt)
            .Select(item => new WorkRow(item.Id, item.Text, "Offen", "Kommentar bearbeiten", $"/projekte/{projectId}/aenderungen/{item.PackageId}#kommentar-{item.Id}", item.CreatedAt))
            .ToList();
        var own = packages
            .Where(item => item.OwnerId == gate.UserId && item.Status != PackageStatus.Freigegeben && !reviewIds.Contains(item.Id))
            .OrderByDescending(item => item.UpdatedAt)
            .Select(item => new WorkRow(
                item.Id,
                item.Title,
                item.Status == PackageStatus.InPruefung ? "In Prüfung" : "Entwurf",
                item.Status == PackageStatus.Entwurf ? "Einreichen" : "Prüfung ansehen",
                $"/projekte/{projectId}/aenderungen/{item.Id}",
                item.UpdatedAt))
            .ToList();
        return Results.Ok(new WorkResponse(review, commentRows, own));
    }

    private static async Task<List<FlowChoice>> Choices(AppDbContext db, Guid projectId, Guid diagramId, CancellationToken ct)
    {
        var nodes = await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId && item.DiagramId == diagramId).ToListAsync(ct);
        var steps = nodes.Where(item => DiagramRules.IsProcessStep(item.NodeType)).ToDictionary(item => item.ArtifactId);
        var stepIds = steps.Keys.ToList();
        var screenIds = await db.ArtifactLinks.AsNoTracking()
            .Where(item => item.ProjectId == projectId && item.Relation == LinkRelation.Uses && stepIds.Contains(item.SourceArtifactId))
            .Select(item => new { item.SourceArtifactId, item.TargetArtifactId })
            .ToListAsync(ct);
        var screens = await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        return screenIds
            .Where(item => screens.ContainsKey(item.TargetArtifactId))
            .Select(item => new FlowChoice(item.SourceArtifactId, steps[item.SourceArtifactId].Title, item.TargetArtifactId, screens[item.TargetArtifactId]))
            .GroupBy(item => new { item.NodeId, item.ScreenId })
            .Select(group => group.First())
            .OrderBy(item => item.Title)
            .ToList();
    }

    private static async Task<List<FlowScreen>> WalkScreens(AppDbContext db, Guid projectId, IEnumerable<Guid> seeds, CancellationToken ct)
    {
        var pending = new Queue<Guid>(seeds);
        var seen = new HashSet<Guid>();
        var screens = await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.ArtifactId, ct);
        var result = new List<FlowScreen>();
        while (pending.Count > 0 && result.Count < 40)
        {
            var id = pending.Dequeue();
            if (!seen.Add(id) || !screens.TryGetValue(id, out var screen)) continue;
            result.Add(new FlowScreen(screen.ArtifactId, screen.Name, screen.WireframeJson));
            foreach (var target in Targets(screen.WireframeJson))
            {
                if (!seen.Contains(target)) pending.Enqueue(target);
            }
        }

        return result;
    }

    private static IEnumerable<Guid> Targets(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return Walk(document.RootElement).ToList();
        }
        catch (JsonException)
        {
            return [];
        }

        static IEnumerable<Guid> Walk(JsonElement node)
        {
            if (node.ValueKind == JsonValueKind.Object)
            {
                if (node.TryGetProperty("targetScreenId", out var target) && target.ValueKind == JsonValueKind.String && Guid.TryParse(target.GetString(), out var id))
                {
                    yield return id;
                }

                foreach (var property in node.EnumerateObject())
                {
                    foreach (var child in Walk(property.Value)) yield return child;
                }
            }
            else if (node.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in node.EnumerateArray())
                {
                    foreach (var child in Walk(item)) yield return child;
                }
            }
        }
    }

    private static async Task<List<CatalogTableResponse>> Catalog(AppDbContext db, Guid projectId, CancellationToken ct)
    {
        var tables = await db.CatalogTables.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Name).ToListAsync(ct);
        var columns = await db.CatalogColumns.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Position).ToListAsync(ct);
        var areas = await db.Areas.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.Id, item => item.Name, ct);
        var documentIds = tables.Where(item => item.DocumentId != null).Select(item => item.DocumentId!.Value).ToList();
        var documents = await db.Documents.AsNoTracking().Where(item => documentIds.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Title, ct);
        var names = tables.ToDictionary(item => item.Id, item => item.Name);
        return tables.Select(table => new CatalogTableResponse(
            table.Id,
            table.Name,
            table.Purpose,
            table.SourceName,
            table.AreaId,
            table.AreaId is Guid area ? areas.GetValueOrDefault(area) : null,
            table.DocumentId,
            table.DocumentId is Guid document ? documents.GetValueOrDefault(document) : null,
            columns.Where(item => item.TableId == table.Id).Select(item => new CatalogColumnResponse(
                item.Id,
                item.Name,
                item.IsPrimaryKey,
                item.ForeignTableId,
                item.ForeignTableId is Guid foreign ? names.GetValueOrDefault(foreign) : null,
                item.Notes,
                item.Position)).ToList())).ToList();
    }

    private static async Task<IResult?> ValidateTable(AppDbContext db, HttpContext http, Guid projectId, CatalogTableRequest body, CancellationToken ct)
    {
        var name = body.Name?.Trim() ?? "";
        if (name.Length is < 1 or > 160) return Problems.BadRequest(http, "Der Tabellenname braucht 1 bis 160 Zeichen.");
        if ((body.Purpose?.Length ?? 0) > 2000 || (body.SourceName?.Length ?? 0) > 160) return Problems.BadRequest(http, "Zweck oder Datenquelle sind zu lang.");
        if (body.AreaId is Guid area && !await db.Areas.AnyAsync(item => item.ProjectId == projectId && item.Id == area, ct))
        {
            return Problems.BadRequest(http, "Der Fachbereich gehört nicht zu diesem Projekt.");
        }

        if (body.DocumentId is Guid document && !await db.Documents.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == document && item.Kind == DocumentKind.Page, ct))
        {
            return Problems.BadRequest(http, "Die Dokumentationsseite gehört nicht zu diesem Projekt.");
        }

        return null;
    }

    private static IResult? ValidateSource(HttpContext http, string? title, string? target)
    {
        var name = title?.Trim() ?? "";
        if (name.Length is < 1 or > 160) return Problems.BadRequest(http, "Der Titel braucht 1 bis 160 Zeichen.");
        if (!SourceRules.IsSafeTarget(target)) return Problems.BadRequest(http, "Das Ziel muss ein http- oder https-Link oder ein Pfad im Repository sein.");
        return null;
    }

    private static SourceResponse MapSource(ArtifactSource row) => new(
        row.Id,
        row.Kind,
        row.Title,
        row.Target,
        SourceRules.Destination(row.Target),
        SourceRules.State(row.CheckedAt, row.CheckedTarget, row.Target),
        row.CheckedByName,
        row.CheckedAt,
        row.CheckedReference);

    private static Task<bool> KnownArtifact(AppDbContext db, Guid projectId, Guid artifactId, CancellationToken ct) =>
        db.Artifacts.AnyAsync(item => item.ProjectId == projectId && item.Id == artifactId && SourceTypes.Contains(item.Type), ct);
}
