namespace Studio.Api.Features;

public static class PlanEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/coverage", Coverage);
        group.MapGet("/projects/{projectId:guid}/requirements/{requirementId:guid}/criteria", ListCriteria);
        group.MapPut("/projects/{projectId:guid}/requirements/{requirementId:guid}/criteria", SaveCriteria);
        group.MapGet("/projects/{projectId:guid}/open-points", ListPoints);
        group.MapPost("/projects/{projectId:guid}/open-points", CreatePoint);
        group.MapPatch("/projects/{projectId:guid}/open-points/{pointId:guid}", UpdatePoint);
        group.MapDelete("/projects/{projectId:guid}/open-points/{pointId:guid}", DeletePoint);
        group.MapGet("/projects/{projectId:guid}/data-model", ListEntities);
        group.MapPost("/projects/{projectId:guid}/data-model", CreateEntity);
        group.MapPatch("/projects/{projectId:guid}/data-model/{entityId:guid}", UpdateEntity);
        group.MapDelete("/projects/{projectId:guid}/data-model/{entityId:guid}", DeleteEntity);
        group.MapPost("/projects/{projectId:guid}/data-model/{entityId:guid}/fields", CreateField);
        group.MapDelete("/projects/{projectId:guid}/data-model/{entityId:guid}/fields/{fieldId:guid}", DeleteField);
        group.MapPost("/projects/{projectId:guid}/data-model/{entityId:guid}/uses", CreateUse);
        group.MapDelete("/projects/{projectId:guid}/data-model/{entityId:guid}/uses/{useId:guid}", DeleteUse);
        group.MapGet("/projects/{projectId:guid}/contracts", ListContracts);
        group.MapPost("/projects/{projectId:guid}/contracts", CreateContract);
        group.MapPatch("/projects/{projectId:guid}/contracts/{contractId:guid}", UpdateContract);
        group.MapDelete("/projects/{projectId:guid}/contracts/{contractId:guid}", DeleteContract);
        group.MapGet("/projects/{projectId:guid}/delivery", Delivery);
        group.MapPut("/projects/{projectId:guid}/delivery", OrderDelivery);
    }

    private static async Task<IResult> Coverage(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var requirements = await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Key).ToListAsync(ct);
        var criteria = await db.RequirementCriteria.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var links = await db.ArtifactLinks.AsNoTracking()
            .Where(item => item.ProjectId == projectId && (item.Relation == LinkRelation.Satisfies || item.Relation == LinkRelation.Documents))
            .ToListAsync(ct);
        var sourceIds = links.Select(item => item.SourceArtifactId).Distinct().ToList();
        var nodes = await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId && sourceIds.Contains(item.ArtifactId)).ToListAsync(ct);
        var screens = await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId && sourceIds.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        var components = await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId && sourceIds.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        var decisions = await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId && item.Kind == DocumentKind.Decision && sourceIds.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Title, ct);
        var nodeById = nodes.ToDictionary(item => item.ArtifactId);
        var rows = requirements.Select(requirement =>
        {
            var incoming = links.Where(item => item.TargetArtifactId == requirement.ArtifactId).ToList();
            var own = criteria.Where(item => item.RequirementId == requirement.ArtifactId).ToList();
            return new CoverageRow(
                requirement.ArtifactId,
                requirement.Key,
                requirement.Title,
                requirement.Status,
                own.Count,
                own.Count(item => !item.Done),
                Distinct(incoming.Where(item => item.Relation == LinkRelation.Satisfies && nodeById.ContainsKey(item.SourceArtifactId)).Select(item =>
                {
                    var node = nodeById[item.SourceArtifactId];
                    return new CoverageLink(node.ArtifactId, node.Title, node.DiagramId);
                })),
                Distinct(incoming.Where(item => item.Relation == LinkRelation.Satisfies && screens.ContainsKey(item.SourceArtifactId)).Select(item => new CoverageLink(item.SourceArtifactId, screens[item.SourceArtifactId], null))),
                Distinct(incoming.Where(item => item.Relation == LinkRelation.Satisfies && components.ContainsKey(item.SourceArtifactId)).Select(item => new CoverageLink(item.SourceArtifactId, components[item.SourceArtifactId], null))),
                Distinct(incoming.Where(item => item.Relation == LinkRelation.Documents && decisions.ContainsKey(item.SourceArtifactId)).Select(item => new CoverageLink(item.SourceArtifactId, decisions[item.SourceArtifactId], null))));
        }).ToList();
        return Results.Ok(rows);
    }

    private static async Task<IResult> ListCriteria(ProjectGuard guard, AppDbContext db, Guid projectId, Guid requirementId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        if (!await db.Requirements.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == requirementId, ct)) return Problems.NotFound(http);
        return Results.Ok(await Criteria(db, projectId, requirementId, ct));
    }

    private static async Task<IResult> SaveCriteria(ProjectGuard guard, AppDbContext db, Guid projectId, Guid requirementId, SaveCriteriaRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        if (!await db.Requirements.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == requirementId, ct)) return Problems.NotFound(http);
        var items = body.Items ?? [];
        if (items.Count > 30) return Problems.BadRequest(http, "Eine Anforderung kann höchstens 30 Abnahmekriterien haben.");
        var existing = await db.RequirementCriteria.Where(item => item.ProjectId == projectId && item.RequirementId == requirementId).ToListAsync(ct);
        var keep = new HashSet<Guid>();
        var position = 0;
        foreach (var item in items)
        {
            var text = item.Text.Trim();
            if (text.Length is < 1 or > 400) return Problems.BadRequest(http, "Jedes Kriterium braucht 1 bis 400 Zeichen.");
            position++;
            if (item.Id is Guid id)
            {
                var row = existing.FirstOrDefault(candidate => candidate.Id == id);
                if (row is null) return Problems.BadRequest(http, "Ein Kriterium gehört nicht zu dieser Anforderung.");
                row.Text = text;
                row.Done = item.Done;
                row.Position = position;
                keep.Add(id);
            }
            else
            {
                db.RequirementCriteria.Add(new RequirementCriterion
                {
                    Id = Guid.CreateVersion7(),
                    ProjectId = projectId,
                    RequirementId = requirementId,
                    Position = position,
                    Text = text,
                    Done = item.Done,
                });
            }
        }

        db.RequirementCriteria.RemoveRange(existing.Where(item => !keep.Contains(item.Id)));
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Criteria(db, projectId, requirementId, ct));
    }

    private static async Task<IResult> ListPoints(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var points = await db.OpenPoints.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Status).ThenBy(item => item.Title).ToListAsync(ct);
        var titles = await ArtifactTitles(db, projectId, points.Select(item => item.ArtifactId).Where(item => item.HasValue).Select(item => item!.Value), ct);
        return Results.Ok(points.Select(item => MapPoint(item, titles)).ToList());
    }

    private static async Task<IResult> CreatePoint(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, OpenPointRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var error = await ValidatePoint(db, http, projectId, body.Kind, body.Title, body.Detail, body.ArtifactId, ct);
        if (error is not null) return error;
        var now = clock.GetUtcNow();
        var point = new OpenPoint
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Kind = body.Kind,
            Title = body.Title.Trim(),
            Detail = body.Detail.Trim(),
            ArtifactId = body.ArtifactId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.OpenPoints.Add(point);
        var saved = await DbSave.SaveAsync(db, http, ct);
        var titles = await ArtifactTitles(db, projectId, point.ArtifactId is Guid id ? [id] : [], ct);
        return saved ?? Results.Created($"/api/v1/projects/{projectId}/open-points/{point.Id}", MapPoint(point, titles));
    }

    private static async Task<IResult> UpdatePoint(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid pointId, OpenPointUpdate body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var point = await db.OpenPoints.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == pointId, ct);
        if (point is null) return Problems.NotFound(http);
        var error = await ValidatePoint(db, http, projectId, body.Kind, body.Title, body.Detail, body.ArtifactId, ct);
        if (error is not null) return error;
        point.Kind = body.Kind;
        point.Title = body.Title.Trim();
        point.Detail = body.Detail.Trim();
        point.Status = body.Status;
        point.ArtifactId = body.ArtifactId;
        point.UpdatedAt = clock.GetUtcNow();
        var saved = await DbSave.SaveAsync(db, http, ct);
        var titles = await ArtifactTitles(db, projectId, point.ArtifactId is Guid id ? [id] : [], ct);
        return saved ?? Results.Ok(MapPoint(point, titles));
    }

    private static async Task<IResult> DeletePoint(ProjectGuard guard, AppDbContext db, Guid projectId, Guid pointId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var point = await db.OpenPoints.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == pointId, ct);
        if (point is null) return Problems.NotFound(http);
        db.OpenPoints.Remove(point);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.NoContent();
    }

    private static async Task<IResult> ListEntities(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        return Results.Ok(await Entities(db, projectId, ct));
    }

    private static async Task<IResult> CreateEntity(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, DataEntityRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var error = await ValidateEntity(db, http, projectId, null, body.Name, body.Description, ct);
        if (error is not null) return error;
        var entity = new DataEntity
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Name = body.Name.Trim(),
            Description = body.Description.Trim(),
            UpdatedAt = clock.GetUtcNow(),
        };
        db.DataEntities.Add(entity);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Created($"/api/v1/projects/{projectId}/data-model/{entity.Id}", await OneEntity(db, projectId, entity.Id, ct));
    }

    private static async Task<IResult> UpdateEntity(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid entityId, DataEntityRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var entity = await db.DataEntities.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == entityId, ct);
        if (entity is null) return Problems.NotFound(http);
        var error = await ValidateEntity(db, http, projectId, entityId, body.Name, body.Description, ct);
        if (error is not null) return error;
        entity.Name = body.Name.Trim();
        entity.Description = body.Description.Trim();
        entity.UpdatedAt = clock.GetUtcNow();
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await OneEntity(db, projectId, entityId, ct));
    }

    private static async Task<IResult> DeleteEntity(ProjectGuard guard, AppDbContext db, Guid projectId, Guid entityId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var entity = await db.DataEntities.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == entityId, ct);
        if (entity is null) return Problems.NotFound(http);
        db.DataEntities.Remove(entity);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.NoContent();
    }

    private static async Task<IResult> CreateField(ProjectGuard guard, AppDbContext db, Guid projectId, Guid entityId, DataFieldRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        if (!await db.DataEntities.AnyAsync(item => item.ProjectId == projectId && item.Id == entityId, ct)) return Problems.NotFound(http);
        var name = body.Name.Trim();
        var type = body.FieldType.Trim();
        var notes = body.Notes.Trim();
        if (name.Length is < 1 or > 80 || type.Length is < 1 or > 40 || notes.Length > 500) return Problems.BadRequest(http, "Feldname und Typ sind erforderlich.");
        var position = await db.DataFields.Where(item => item.EntityId == entityId).Select(item => (int?)item.Position).MaxAsync(ct) ?? 0;
        db.DataFields.Add(new DataField
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            EntityId = entityId,
            Position = position + 1,
            Name = name,
            FieldType = type,
            Required = body.Required,
            Notes = notes,
        });
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await OneEntity(db, projectId, entityId, ct));
    }

    private static async Task<IResult> DeleteField(ProjectGuard guard, AppDbContext db, Guid projectId, Guid entityId, Guid fieldId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var field = await db.DataFields.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.EntityId == entityId && item.Id == fieldId, ct);
        if (field is null) return Problems.NotFound(http);
        db.DataFields.Remove(field);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await OneEntity(db, projectId, entityId, ct));
    }

    private static async Task<IResult> CreateUse(ProjectGuard guard, AppDbContext db, Guid projectId, Guid entityId, DataUseRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        if (!await db.DataEntities.AnyAsync(item => item.ProjectId == projectId && item.Id == entityId, ct)) return Problems.NotFound(http);
        var artifact = await db.Artifacts.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == body.ArtifactId, ct);
        if (artifact is null || artifact.Type is not ArtifactType.Component and not ArtifactType.Screen) return Problems.BadRequest(http, "Ein Objekt lässt sich mit einer Komponente oder einem Screen verknüpfen.");
        if (!Enum.IsDefined(body.Role)) return Problems.BadRequest(http, "Die Verwendung ist ungültig.");
        if (await db.DataUses.AnyAsync(item => item.EntityId == entityId && item.ArtifactId == body.ArtifactId && item.Role == body.Role, ct)) return Problems.BadRequest(http, "Diese Verwendung gibt es schon.");
        db.DataUses.Add(new DataUse
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            EntityId = entityId,
            ArtifactId = body.ArtifactId,
            Role = body.Role,
        });
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await OneEntity(db, projectId, entityId, ct));
    }

    private static async Task<IResult> DeleteUse(ProjectGuard guard, AppDbContext db, Guid projectId, Guid entityId, Guid useId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var use = await db.DataUses.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.EntityId == entityId && item.Id == useId, ct);
        if (use is null) return Problems.NotFound(http);
        db.DataUses.Remove(use);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await OneEntity(db, projectId, entityId, ct));
    }

    private static async Task<IResult> ListContracts(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        return Results.Ok(await Contracts(db, projectId, ct));
    }

    private static async Task<IResult> CreateContract(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, ContractRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var error = await ValidateContract(db, http, projectId, null, body, ct);
        if (error is not null) return error;
        var contract = new ServiceContract { Id = Guid.CreateVersion7(), ProjectId = projectId, UpdatedAt = clock.GetUtcNow() };
        Apply(contract, body);
        db.ServiceContracts.Add(contract);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Created($"/api/v1/projects/{projectId}/contracts/{contract.Id}", (await Contracts(db, projectId, ct)).First(item => item.Id == contract.Id));
    }

    private static async Task<IResult> UpdateContract(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid contractId, ContractRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var contract = await db.ServiceContracts.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == contractId, ct);
        if (contract is null) return Problems.NotFound(http);
        var error = await ValidateContract(db, http, projectId, contractId, body, ct);
        if (error is not null) return error;
        Apply(contract, body);
        contract.UpdatedAt = clock.GetUtcNow();
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok((await Contracts(db, projectId, ct)).First(item => item.Id == contractId));
    }

    private static async Task<IResult> DeleteContract(ProjectGuard guard, AppDbContext db, Guid projectId, Guid contractId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var contract = await db.ServiceContracts.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == contractId, ct);
        if (contract is null) return Problems.NotFound(http);
        db.ServiceContracts.Remove(contract);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.NoContent();
    }

    private static async Task<IResult> Delivery(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var packages = await db.ChangePackages.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.SortOrder).ThenBy(item => item.CreatedAt).ToListAsync(ct);
        var items = await db.ChangePackageItems.AsNoTracking().Where(item => item.ProjectId == projectId && item.ArtifactType == nameof(ArtifactType.Requirement)).ToListAsync(ct);
        var requirements = await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var byId = requirements.ToDictionary(item => item.ArtifactId);
        var assigned = items.Select(item => item.ArtifactId).ToHashSet();
        var slices = packages.Select(package => new DeliverySlice(
            package.Id,
            package.Title,
            package.Status,
            package.SortOrder,
            items.Where(item => item.PackageId == package.Id && byId.ContainsKey(item.ArtifactId))
                .Select(item => MapRequirement(byId[item.ArtifactId]))
                .OrderBy(item => item.Key)
                .ToList())).ToList();
        var open = requirements.Where(item => !assigned.Contains(item.ArtifactId)).OrderBy(item => item.Key).Select(MapRequirement).ToList();
        return Results.Ok(new DeliveryResponse(slices, open));
    }

    private static async Task<IResult> OrderDelivery(ProjectGuard guard, AppDbContext db, Guid projectId, DeliveryOrderRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var ids = body.Ids ?? [];
        if (ids.Distinct().Count() != ids.Count) return Problems.BadRequest(http, "Ein Paket darf nur einmal in der Reihenfolge stehen.");
        var packages = await db.ChangePackages.Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var known = packages.Select(item => item.Id).ToHashSet();
        if (ids.Any(id => !known.Contains(id))) return Problems.BadRequest(http, "Die Reihenfolge enthält ein unbekanntes Paket.");
        var rank = ids.Select((id, index) => (id, index)).ToDictionary(item => item.id, item => item.index);
        var next = 1;
        foreach (var id in ids)
        {
            packages.First(item => item.Id == id).SortOrder = next++;
        }

        foreach (var package in packages.Where(item => !rank.ContainsKey(item.Id)).OrderBy(item => item.SortOrder).ThenBy(item => item.CreatedAt))
        {
            package.SortOrder = next++;
        }

        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? await Delivery(guard, db, projectId, http, ct);
    }

    private static List<CoverageLink> Distinct(IEnumerable<CoverageLink> links) =>
        links.GroupBy(item => item.Id).Select(group => group.First()).OrderBy(item => item.Title).ToList();

    private static async Task<List<CriterionResponse>> Criteria(AppDbContext db, Guid projectId, Guid requirementId, CancellationToken ct) =>
        await db.RequirementCriteria.AsNoTracking()
            .Where(item => item.ProjectId == projectId && item.RequirementId == requirementId)
            .OrderBy(item => item.Position)
            .Select(item => new CriterionResponse(item.Id, item.Text, item.Done, item.Position))
            .ToListAsync(ct);

    private static OpenPointResponse MapPoint(OpenPoint point, IReadOnlyDictionary<Guid, string> titles) =>
        new(point.Id, point.Kind, point.Title, point.Detail, point.Status, point.ArtifactId, point.ArtifactId is Guid id ? titles.GetValueOrDefault(id) : null, point.UpdatedAt);

    private static async Task<IResult?> ValidatePoint(AppDbContext db, HttpContext http, Guid projectId, OpenPointKind kind, string title, string detail, Guid? artifactId, CancellationToken ct)
    {
        if (!Enum.IsDefined(kind)) return Problems.BadRequest(http, "Die Art ist ungültig.");
        var name = title.Trim();
        var text = detail.Trim();
        if (name.Length is < 1 or > 160) return Problems.BadRequest(http, "Der Titel braucht 1 bis 160 Zeichen.");
        if (text.Length > 2000) return Problems.BadRequest(http, "Die Beschreibung darf höchstens 2000 Zeichen haben.");
        if (artifactId is Guid id && !await db.Artifacts.AnyAsync(item => item.ProjectId == projectId && item.Id == id, ct)) return Problems.BadRequest(http, "Der Bezug existiert in diesem Projekt nicht.");
        return null;
    }

    private static async Task<Dictionary<Guid, string>> ArtifactTitles(AppDbContext db, Guid projectId, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var wanted = ids.Distinct().ToList();
        if (wanted.Count == 0) return [];
        var requirements = await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId && wanted.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => $"{item.Key} {item.Title}", ct);
        var screens = await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId && wanted.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        var components = await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId && wanted.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        var documents = await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId && wanted.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Title, ct);
        var nodes = await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId && wanted.Contains(item.ArtifactId)).ToDictionaryAsync(item => item.ArtifactId, item => item.Title, ct);
        var titles = new Dictionary<Guid, string>();
        foreach (var id in wanted)
        {
            if (requirements.TryGetValue(id, out var requirement)) titles[id] = requirement;
            else if (screens.TryGetValue(id, out var screen)) titles[id] = screen;
            else if (components.TryGetValue(id, out var component)) titles[id] = component;
            else if (documents.TryGetValue(id, out var document)) titles[id] = document;
            else if (nodes.TryGetValue(id, out var node)) titles[id] = node;
        }

        return titles;
    }

    private static async Task<IResult?> ValidateEntity(AppDbContext db, HttpContext http, Guid projectId, Guid? entityId, string name, string description, CancellationToken ct)
    {
        var title = name.Trim();
        var text = description.Trim();
        if (title.Length is < 1 or > 160) return Problems.BadRequest(http, "Der Name braucht 1 bis 160 Zeichen.");
        if (text.Length > 2000) return Problems.BadRequest(http, "Die Beschreibung darf höchstens 2000 Zeichen haben.");
        var taken = await db.DataEntities.AnyAsync(item => item.ProjectId == projectId && item.Id != entityId && item.Name.ToLower() == title.ToLower(), ct);
        return taken ? Problems.BadRequest(http, "Diesen Namen gibt es schon.") : null;
    }

    private static async Task<List<DataEntityResponse>> Entities(AppDbContext db, Guid projectId, CancellationToken ct)
    {
        var entities = await db.DataEntities.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Name).ToListAsync(ct);
        var fields = await db.DataFields.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Position).ToListAsync(ct);
        var uses = await db.DataUses.AsNoTracking().Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var titles = await ArtifactTitles(db, projectId, uses.Select(item => item.ArtifactId), ct);
        var types = await db.Artifacts.AsNoTracking().Where(item => item.ProjectId == projectId && uses.Select(use => use.ArtifactId).Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Type.ToString(), ct);
        return entities.Select(entity => new DataEntityResponse(
            entity.Id,
            entity.Name,
            entity.Description,
            fields.Where(item => item.EntityId == entity.Id).Select(item => new DataFieldResponse(item.Id, item.Name, item.FieldType, item.Required, item.Notes, item.Position)).ToList(),
            uses.Where(item => item.EntityId == entity.Id).Select(item => new DataUseResponse(item.Id, item.ArtifactId, types.GetValueOrDefault(item.ArtifactId, ""), titles.GetValueOrDefault(item.ArtifactId, "Unbekannt"), item.Role)).OrderBy(item => item.ArtifactTitle).ToList())).ToList();
    }

    private static async Task<DataEntityResponse?> OneEntity(AppDbContext db, Guid projectId, Guid entityId, CancellationToken ct) =>
        (await Entities(db, projectId, ct)).FirstOrDefault(item => item.Id == entityId);

    private static async Task<IResult?> ValidateContract(AppDbContext db, HttpContext http, Guid projectId, Guid? contractId, ContractRequest body, CancellationToken ct)
    {
        var name = body.Name.Trim();
        var operation = body.Operation.Trim();
        if (name.Length is < 1 or > 160) return Problems.BadRequest(http, "Der Name braucht 1 bis 160 Zeichen.");
        if (operation.Length is < 1 or > 160) return Problems.BadRequest(http, "Der Aufruf braucht 1 bis 160 Zeichen.");
        if (body.Input.Trim().Length > 2000 || body.Output.Trim().Length > 2000 || body.Errors.Trim().Length > 2000) return Problems.BadRequest(http, "Eingabe, Ausgabe und Fehler dürfen höchstens 2000 Zeichen haben.");
        if (body.ConsumerId == body.ProviderId) return Problems.BadRequest(http, "Anbieter und Aufrufer sind zwei verschiedene Komponenten.");
        if (!await db.Components.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == body.ProviderId, ct)) return Problems.BadRequest(http, "Der Anbieter muss eine Komponente dieses Projekts sein.");
        if (body.ConsumerId is Guid consumer && !await db.Components.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == consumer, ct)) return Problems.BadRequest(http, "Der Aufrufer muss eine Komponente dieses Projekts sein.");
        var taken = await db.ServiceContracts.AnyAsync(item => item.ProjectId == projectId && item.Id != contractId && item.Name.ToLower() == name.ToLower(), ct);
        return taken ? Problems.BadRequest(http, "Diesen Namen gibt es schon.") : null;
    }

    private static void Apply(ServiceContract contract, ContractRequest body)
    {
        contract.Name = body.Name.Trim();
        contract.ProviderId = body.ProviderId;
        contract.ConsumerId = body.ConsumerId;
        contract.Operation = body.Operation.Trim();
        contract.Input = body.Input.Trim();
        contract.Output = body.Output.Trim();
        contract.Errors = body.Errors.Trim();
    }

    private static async Task<List<ContractResponse>> Contracts(AppDbContext db, Guid projectId, CancellationToken ct)
    {
        var contracts = await db.ServiceContracts.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Name).ToListAsync(ct);
        var names = await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.ArtifactId, item => item.Name, ct);
        return contracts.Select(item => new ContractResponse(
            item.Id,
            item.Name,
            item.ProviderId,
            names.GetValueOrDefault(item.ProviderId, "Unbekannt"),
            item.ConsumerId,
            item.ConsumerId is Guid consumer ? names.GetValueOrDefault(consumer) : null,
            item.Operation,
            item.Input,
            item.Output,
            item.Errors)).ToList();
    }

    private static DeliveryRequirement MapRequirement(Requirement requirement) =>
        new(requirement.ArtifactId, requirement.Key, requirement.Title, requirement.Status);
}
