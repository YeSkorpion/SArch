namespace Studio.Api.Features;

public static class DocumentEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/documents", List);
        group.MapPost("/projects/{projectId:guid}/documents", Create);
        group.MapGet("/projects/{projectId:guid}/documents/{documentId:guid}", Get);
        group.MapPut("/projects/{projectId:guid}/documents/{documentId:guid}", Update);
        group.MapPost("/projects/{projectId:guid}/documents/{documentId:guid}/move", Move);
        group.MapGet("/projects/{projectId:guid}/documents/{documentId:guid}/revisions", Revisions);
        group.MapGet("/projects/{projectId:guid}/documents/{documentId:guid}/revisions/{number:int}", GetRevision);
        group.MapPost("/projects/{projectId:guid}/documents/{documentId:guid}/revisions/{number:int}/restore", Restore);
    }

    private static async Task<IResult> List(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var items = await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId)
            .OrderBy(item => item.SortOrder).ThenBy(item => item.Title).ThenBy(item => item.ArtifactId)
            .Select(item => new DocumentListItem(item.ArtifactId, item.ParentId, item.Title, item.Kind, item.Status, item.SortOrder, item.Version, item.UpdatedAt))
            .ToListAsync(ct);
        return Results.Ok(items);
    }

    private static async Task<IResult> Create(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateDocumentRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (TextInput.Required(body.Title, "Titel", 200) is string titleError)
        {
            return Problems.BadRequest(http, titleError);
        }

        if (body.ParentId is Guid parentId)
        {
            var parent = await db.Documents.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == parentId, ct);
            if (parent is null)
            {
                return Problems.NotFound(http, "Die übergeordnete Seite wurde nicht gefunden.");
            }

            if (parent.Kind != DocumentKind.Page)
            {
                return Problems.BadRequest(http, "Nur Seiten können untergeordnete Seiten enthalten.");
            }
        }

        var now = clock.GetUtcNow();
        var kind = body.Kind;
        var status = kind == DocumentKind.Decision ? DocumentStatus.Vorgeschlagen : DocumentStatus.Entwurf;
        var content = kind == DocumentKind.Decision ? DocumentRules.DecisionTemplate : DocumentRules.EmptyContent;
        var artifact = Artifacts.Create(projectId, ArtifactType.Document, now);
        var sort = await db.Documents.Where(item => item.ProjectId == projectId && item.ParentId == body.ParentId).Select(item => (int?)item.SortOrder).MaxAsync(ct) ?? 0;
        var document = new Document
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            ParentId = body.ParentId,
            Title = body.Title.Trim(),
            Kind = kind,
            Status = status,
            ContentJson = content,
            SortOrder = sort + 1,
            CreatedAt = now,
            UpdatedAt = now,
            SearchText = SearchText.Build(body.Title, TipTapRules.PlainText(content)),
        };
        db.Artifacts.Add(artifact);
        db.Documents.Add(document);
        db.DocumentRevisions.Add(NewRevision(document, 1, gate.UserId, now));
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        return Results.Created($"/api/v1/projects/{projectId}/documents/{document.ArtifactId}", await Detail(db, document, ct));
    }

    private static async Task<IResult> Get(ProjectGuard guard, AppDbContext db, Guid projectId, Guid documentId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var document = await db.Documents.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.ArtifactId == documentId, ct);
        return document is null ? Problems.NotFound(http) : Results.Ok(await Detail(db, document, ct));
    }

    private static async Task<IResult> Update(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid documentId, UpdateDocumentRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (TextInput.Required(body.Title, "Titel", 200) is string titleError)
        {
            return Problems.BadRequest(http, titleError);
        }

        var content = body.ContentJson ?? "";
        var contentErrors = TipTapRules.Validate(content);
        if (contentErrors.Count > 0)
        {
            return Problems.BadRequest(http, [.. contentErrors]);
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var document = await db.Documents.FromSqlInterpolated($"SELECT * FROM documents WHERE artifact_id = {documentId} AND project_id = {projectId} FOR UPDATE").AsTracking().FirstOrDefaultAsync(ct);
        if (document is null)
        {
            return Problems.NotFound(http);
        }

        if (document.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", document.Version);
        }

        if (!DocumentRules.StatusMatchesKind(document.Kind, body.Status))
        {
            return Problems.BadRequest(http, "Der Status passt nicht zum Dokumenttyp.");
        }

        var now = clock.GetUtcNow();
        var changed = document.Title != body.Title.Trim() || document.Status != body.Status || document.ContentJson != content;
        document.Title = body.Title.Trim();
        document.Status = body.Status;
        document.ContentJson = content;
        document.SearchText = SearchText.Build(document.Title, TipTapRules.PlainText(document.ContentJson));
        document.Version++;
        document.UpdatedAt = now;
        var artifact = await db.Artifacts.FirstAsync(item => item.Id == documentId, ct);
        artifact.UpdatedAt = now;
        await SyncLinks(db, projectId, document, now, ct);
        if (changed)
        {
            var number = await db.DocumentRevisions.Where(item => item.DocumentId == documentId).Select(item => (int?)item.Number).MaxAsync(ct) ?? 0;
            db.DocumentRevisions.Add(NewRevision(document, number + 1, gate.UserId, now));
        }

        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(await Detail(db, document, ct));
    }

    private static async Task<IResult> Move(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid documentId, MoveDocumentRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var documents = await db.Documents.Where(item => item.ProjectId == projectId).ToListAsync(ct);
        var document = documents.FirstOrDefault(item => item.ArtifactId == documentId);
        if (document is null)
        {
            return Problems.NotFound(http);
        }

        if (document.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", document.Version);
        }

        if (body.ParentId is Guid parentId)
        {
            var parent = documents.FirstOrDefault(item => item.ArtifactId == parentId);
            if (parent is null)
            {
                return Problems.NotFound(http, "Die übergeordnete Seite wurde nicht gefunden.");
            }

            if (parent.Kind != DocumentKind.Page)
            {
                return Problems.BadRequest(http, "Nur Seiten können untergeordnete Seiten enthalten.");
            }
        }

        var parents = documents.ToDictionary(item => item.ArtifactId, item => item.ParentId);
        if (DocumentRules.CreatesCycle(documentId, body.ParentId, parents))
        {
            return Problems.BadRequest(http, "Die Seite kann nicht in ihre eigene Unterstruktur verschoben werden.");
        }

        document.ParentId = body.ParentId;
        document.SortOrder = body.SortOrder;
        document.Version++;
        document.UpdatedAt = clock.GetUtcNow();
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(await Detail(db, document, ct));
    }

    private static async Task<IResult> Revisions(ProjectGuard guard, AppDbContext db, Guid projectId, Guid documentId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        if (!await db.Documents.AnyAsync(item => item.ProjectId == projectId && item.ArtifactId == documentId, ct))
        {
            return Problems.NotFound(http);
        }

        var revisions = await db.DocumentRevisions.AsNoTracking().Where(item => item.ProjectId == projectId && item.DocumentId == documentId)
            .OrderByDescending(item => item.Number).ToListAsync(ct);
        var authors = await AuthorNames(db, revisions.Select(item => item.AuthorId), ct);
        var embeds = await EmbedsFor(db, projectId, revisions.SelectMany(item => TipTapRules.ArtifactIds(item.ContentJson)), ct);
        return Results.Ok(revisions.Select(item => MapRevision(item, authors, embeds)).ToList());
    }

    private static async Task<IResult> GetRevision(ProjectGuard guard, AppDbContext db, Guid projectId, Guid documentId, int number, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        var revision = await db.DocumentRevisions.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.DocumentId == documentId && item.Number == number, ct);
        if (revision is null)
        {
            return Problems.NotFound(http);
        }

        var authors = await AuthorNames(db, [revision.AuthorId], ct);
        var embeds = await EmbedsFor(db, projectId, TipTapRules.ArtifactIds(revision.ContentJson), ct);
        return Results.Ok(MapRevision(revision, authors, embeds));
    }

    private static async Task<IResult> Restore(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid documentId, int number, RestoreRevisionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed)
        {
            return gate.Error!;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var document = await db.Documents.FromSqlInterpolated($"SELECT * FROM documents WHERE artifact_id = {documentId} AND project_id = {projectId} FOR UPDATE").AsTracking().FirstOrDefaultAsync(ct);
        var revision = await db.DocumentRevisions.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.DocumentId == documentId && item.Number == number, ct);
        if (document is null || revision is null)
        {
            return Problems.NotFound(http);
        }

        if (document.Version != body.Version)
        {
            return Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", document.Version);
        }

        var now = clock.GetUtcNow();
        document.Title = revision.Title;
        document.Status = revision.Status;
        document.ContentJson = revision.ContentJson;
        document.SearchText = SearchText.Build(document.Title, TipTapRules.PlainText(document.ContentJson));
        document.Version++;
        document.UpdatedAt = now;
        var artifact = await db.Artifacts.FirstAsync(item => item.Id == documentId, ct);
        artifact.UpdatedAt = now;
        await SyncLinks(db, projectId, document, now, ct);
        var next = await db.DocumentRevisions.Where(item => item.DocumentId == documentId).MaxAsync(item => item.Number, ct);
        db.DocumentRevisions.Add(NewRevision(document, next + 1, gate.UserId, now));
        var error = await DbSave.SaveAsync(db, http, ct);
        if (error is not null)
        {
            return error;
        }

        await tx.CommitAsync(ct);
        return Results.Ok(await Detail(db, document, ct));
    }

    private static async Task SyncLinks(AppDbContext db, Guid projectId, Document document, DateTimeOffset now, CancellationToken ct)
    {
        var referenced = TipTapRules.ArtifactIds(document.ContentJson).Where(id => id != document.ArtifactId).Distinct().ToArray();
        var valid = await db.Artifacts.Where(item => item.ProjectId == projectId && referenced.Contains(item.Id)).Select(item => item.Id).ToListAsync(ct);
        var existing = await db.ArtifactLinks.Where(item => item.ProjectId == projectId && item.SourceArtifactId == document.ArtifactId && item.Relation == LinkRelation.Documents).ToListAsync(ct);
        db.ArtifactLinks.RemoveRange(existing.Where(item => !valid.Contains(item.TargetArtifactId)));
        var present = existing.Select(item => item.TargetArtifactId).ToHashSet();
        foreach (var target in valid.Where(id => !present.Contains(id)))
        {
            db.ArtifactLinks.Add(new ArtifactLink
            {
                Id = Guid.CreateVersion7(),
                ProjectId = projectId,
                SourceArtifactId = document.ArtifactId,
                TargetArtifactId = target,
                Relation = LinkRelation.Documents,
                CreatedAt = now,
            });
        }
    }

    private static DocumentRevision NewRevision(Document document, int number, Guid authorId, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(),
        DocumentId = document.ArtifactId,
        ProjectId = document.ProjectId,
        Number = number,
        Title = document.Title,
        Status = document.Status,
        ContentJson = document.ContentJson,
        AuthorId = authorId,
        CreatedAt = now,
    };

    private static async Task<DocumentResponse> Detail(AppDbContext db, Document document, CancellationToken ct)
    {
        var embeds = await EmbedsFor(db, document.ProjectId, TipTapRules.ArtifactIds(document.ContentJson), ct);
        return new DocumentResponse(document.ArtifactId, document.ParentId, document.Title, document.Kind, document.Status, document.ContentJson, document.Version, document.SortOrder, document.UpdatedAt, embeds);
    }

    public static async Task<IReadOnlyList<EmbeddedArtifact>> EmbedsFor(AppDbContext db, Guid projectId, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToArray();
        var labels = await ArtifactCatalog.Labels(db, projectId, list, ct);
        return list.Select(id => labels.TryGetValue(id, out var label)
            ? new EmbeddedArtifact(id, label.Title, label.Type.ToString(), false)
            : new EmbeddedArtifact(id, "Gelöschtes Artefakt", "deleted", true)).ToList();
    }

    private static async Task<Dictionary<Guid, string>> AuthorNames(AppDbContext db, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToArray();
        return await db.Users.AsNoTracking().Where(item => list.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.DisplayName, ct);
    }

    private static RevisionResponse MapRevision(DocumentRevision revision, Dictionary<Guid, string> authors, IReadOnlyList<EmbeddedArtifact> allEmbeds)
    {
        var ids = TipTapRules.ArtifactIds(revision.ContentJson).ToHashSet();
        return new RevisionResponse(
            revision.Id,
            revision.Number,
            revision.Title,
            revision.Status,
            revision.ContentJson,
            revision.AuthorId,
            string.IsNullOrWhiteSpace(revision.AuthorName) ? authors.GetValueOrDefault(revision.AuthorId, "Unbekannt") : revision.AuthorName,
            revision.CreatedAt,
            allEmbeds.Where(item => ids.Contains(item.Id)).ToList());
    }
}
