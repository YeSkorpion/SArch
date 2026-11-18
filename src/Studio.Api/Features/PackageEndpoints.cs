namespace Studio.Api.Features;

public static class PackageEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/packages", List);
        group.MapPost("/projects/{projectId:guid}/packages", Create);
        group.MapGet("/projects/{projectId:guid}/packages/{packageId:guid}", Detail);
        group.MapPatch("/projects/{projectId:guid}/packages/{packageId:guid}", Update);
        group.MapPost("/projects/{projectId:guid}/packages/{packageId:guid}/items", AddItem);
        group.MapDelete("/projects/{projectId:guid}/packages/{packageId:guid}/items/{itemId:guid}", RemoveItem);
        group.MapPost("/projects/{projectId:guid}/packages/{packageId:guid}/comments", AddComment);
        group.MapPost("/projects/{projectId:guid}/packages/{packageId:guid}/comments/{commentId:guid}/status", SetCommentStatus);
        group.MapPost("/projects/{projectId:guid}/packages/{packageId:guid}/submit", Submit);
        group.MapPost("/projects/{projectId:guid}/packages/{packageId:guid}/request-changes", RequestChanges);
        group.MapPost("/projects/{projectId:guid}/packages/{packageId:guid}/approve", Approve);
        group.MapGet("/projects/{projectId:guid}/packages/{packageId:guid}/handover", Handover);
        group.MapGet("/projects/{projectId:guid}/artifacts/{artifactId:guid}/review-comments", ReviewComments);
    }

    private static async Task<IResult> List(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var packages = await db.ChangePackages.AsNoTracking().Where(item => item.ProjectId == projectId).OrderByDescending(item => item.UpdatedAt).ToListAsync(ct);
        return Results.Ok(await Summaries(db, projectId, packages, ct));
    }

    private static async Task<IResult> Create(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreatePackageRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var error = await ValidateMeta(db, http, projectId, body.Title, body.Goal, body.AreaId, body.OwnerId, body.ReviewerId, ct);
        if (error is not null) return error;
        var now = clock.GetUtcNow();
        var sort = await db.ChangePackages.Where(item => item.ProjectId == projectId).Select(item => (int?)item.SortOrder).MaxAsync(ct) ?? 0;
        var package = new ChangePackage
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            SortOrder = sort + 1,
            Title = body.Title.Trim(),
            Goal = body.Goal.Trim(),
            AreaId = body.AreaId,
            OwnerId = body.OwnerId,
            ReviewerId = body.ReviewerId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.ChangePackages.Add(package);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Created($"/api/v1/projects/{projectId}/packages/{package.Id}", await Map(db, package, ct));
    }

    private static async Task<IResult> Detail(ProjectGuard guard, AppDbContext db, Guid projectId, Guid packageId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        return package is null ? Problems.NotFound(http) : Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> Update(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, UpdatePackageRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        if (package.Status != PackageStatus.Entwurf) return Problems.Conflict(http, "Metadaten lassen sich nur im Entwurf ändern.", "package_locked");
        var version = Version(http, package, body.Version);
        if (version is not null) return version;
        var error = await ValidateMeta(db, http, projectId, body.Title, body.Goal, body.AreaId, body.OwnerId, body.ReviewerId, ct);
        if (error is not null) return error;
        package.Title = body.Title.Trim();
        package.Goal = body.Goal.Trim();
        package.AreaId = body.AreaId;
        package.OwnerId = body.OwnerId;
        package.ReviewerId = body.ReviewerId;
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> AddItem(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, AddPackageItemRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        if (package.Status == PackageStatus.Freigegeben) return Problems.Conflict(http, "Ein freigegebenes Paket nimmt keine weiteren Artefakte auf.", "package_locked");
        var version = Version(http, package, body.Version);
        if (version is not null) return version;
        var note = body.Note?.Trim() ?? "";
        if (TextInput.Required(note, "Notiz", 80) is string noteError) return Problems.BadRequest(http, noteError);
        var labels = await ArtifactCatalog.Labels(db, projectId, [body.ArtifactId], ct);
        if (!labels.TryGetValue(body.ArtifactId, out var label)) return Problems.NotFound(http, "Das Artefakt wurde nicht gefunden.");
        if (await db.ChangePackageItems.AnyAsync(item => item.PackageId == packageId && item.ArtifactId == body.ArtifactId, ct))
        {
            return Problems.Conflict(http, "Das Artefakt ist in diesem Paket bereits enthalten.", "duplicate");
        }

        db.ChangePackageItems.Add(new ChangePackageItem
        {
            Id = Guid.CreateVersion7(),
            PackageId = packageId,
            ProjectId = projectId,
            ArtifactId = body.ArtifactId,
            ArtifactType = await PublicType(db, label, ct),
            ArtifactTitle = label.Title,
            DiagramId = label.DiagramId,
            Note = note,
            CreatedAt = clock.GetUtcNow(),
        });
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> RemoveItem(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, Guid itemId, int version, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        if (package.Status != PackageStatus.Entwurf) return Problems.Conflict(http, "Artefakte lassen sich nur im Entwurf entfernen.", "package_locked");
        var mismatch = Version(http, package, version);
        if (mismatch is not null) return mismatch;
        var item = await db.ChangePackageItems.FirstOrDefaultAsync(entry => entry.PackageId == packageId && entry.Id == itemId, ct);
        if (item is null) return Problems.NotFound(http);
        db.ChangePackageItems.Remove(item);
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> AddComment(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, PackageCommentRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        var mismatch = Version(http, package, body.Version);
        if (mismatch is not null) return mismatch;
        if (TextInput.Required(body.Text, "Kommentar", 4000) is string textError) return Problems.BadRequest(http, textError);
        var targetType = "";
        var targetTitle = package.Title;
        Guid? diagramId = null;
        if (body.ArtifactId is Guid artifactId)
        {
            var item = await db.ChangePackageItems.AsNoTracking().FirstOrDefaultAsync(entry => entry.PackageId == packageId && entry.ArtifactId == artifactId, ct);
            if (item is null) return Problems.BadRequest(http, "Kommentare an Artefakten gehören zu einem Eintrag des Pakets.");
            targetType = item.ArtifactType;
            targetTitle = item.ArtifactTitle;
            diagramId = item.DiagramId;
        }

        if (body.AssigneeId is Guid assignee && !await db.Memberships.AnyAsync(item => item.ProjectId == projectId && item.UserId == assignee, ct))
        {
            return Problems.BadRequest(http, "Die zugewiesene Person gehört nicht zum Projekt.");
        }

        var author = await db.Users.AsNoTracking().FirstAsync(item => item.Id == gate.UserId, ct);
        db.PackageComments.Add(new PackageComment
        {
            Id = Guid.CreateVersion7(),
            PackageId = packageId,
            ProjectId = projectId,
            SnapshotId = package.ReviewSnapshotId,
            ArtifactId = body.ArtifactId,
            TargetType = targetType,
            TargetTitle = targetTitle,
            DiagramId = diagramId,
            AuthorId = gate.UserId,
            AuthorName = author.DisplayName,
            AssigneeId = body.AssigneeId,
            Text = body.Text.Trim(),
            CreatedAt = clock.GetUtcNow(),
        });
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> SetCommentStatus(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, Guid commentId, CommentStatusRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        var mismatch = Version(http, package, body.Version);
        if (mismatch is not null) return mismatch;
        var comment = await db.PackageComments.FirstOrDefaultAsync(item => item.PackageId == packageId && item.Id == commentId, ct);
        if (comment is null) return Problems.NotFound(http);
        comment.Status = body.Status;
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> Submit(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, VersionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        var mismatch = Version(http, package, body.Version);
        if (mismatch is not null) return mismatch;
        var stale = await IsStale(db, package, ct);
        var allowed = package.Status == PackageStatus.Entwurf || (package.Status == PackageStatus.InPruefung && stale);
        if (!allowed) return Problems.Conflict(http, "Diese Fassung kann gerade nicht eingereicht werden.", "invalid_transition");
        var ids = await db.ChangePackageItems.AsNoTracking().Where(item => item.PackageId == packageId).Select(item => item.ArtifactId).ToListAsync(ct);
        if (ids.Count == 0) return Problems.BadRequest(http, "Das Änderungspaket enthält noch keine Artefakte.");
        var document = await SnapshotCapture.Package(db, projectId, ids, ct);
        var author = await db.Users.AsNoTracking().FirstAsync(item => item.Id == gate.UserId, ct);
        var now = clock.GetUtcNow();
        var number = await db.ProjectSnapshots.CountAsync(item => item.PackageId == packageId, ct) + 1;
        var snapshot = new ProjectSnapshot
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            PackageId = packageId,
            Name = $"Fassung {number}",
            Scope = "package",
            CreatedById = gate.UserId,
            CreatedByName = author.DisplayName,
            CreatedAt = now,
            ContentHash = SnapshotJson.Hash(document),
            PayloadJson = SnapshotJson.Serialize(document),
        };
        db.ProjectSnapshots.Add(snapshot);
        db.PackageDecisions.Add(Decision(package, snapshot.Id, "eingereicht", "", gate.UserId, author.DisplayName, now));
        package.Status = PackageStatus.InPruefung;
        package.ReviewSnapshotId = snapshot.Id;
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> RequestChanges(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, ReviewActionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        if (!CanReview(gate, package)) return Problems.Forbidden(http, "Nur die zugewiesene Prüfperson mit Schreibrecht oder eine Eigentümerin bzw. ein Eigentümer kann Änderungen anfordern.");
        if (package.Status != PackageStatus.InPruefung) return Problems.Conflict(http, "Änderungen lassen sich nur während der Prüfung anfordern.", "invalid_transition");
        var mismatch = Version(http, package, body.Version);
        if (mismatch is not null) return mismatch;
        if (TextInput.Required(body.Reason, "Begründung", 2000) is string reasonError) return Problems.BadRequest(http, reasonError);
        if (package.ReviewSnapshotId is null) return Problems.Conflict(http, "Es liegt kein Prüfstand vor.", "invalid_transition");
        var author = await db.Users.AsNoTracking().FirstAsync(item => item.Id == gate.UserId, ct);
        var now = clock.GetUtcNow();
        db.PackageDecisions.Add(Decision(package, package.ReviewSnapshotId.Value, "aenderungen", body.Reason!.Trim(), gate.UserId, author.DisplayName, now));
        package.Status = PackageStatus.Entwurf;
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> Approve(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, Guid packageId, VersionRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        if (!CanReview(gate, package)) return Problems.Forbidden(http, "Nur die zugewiesene Prüfperson mit Schreibrecht oder eine Eigentümerin bzw. ein Eigentümer kann freigeben.");
        if (package.Status != PackageStatus.InPruefung || package.ReviewSnapshotId is null) return Problems.Conflict(http, "Freigeben ist nur für einen eingereichten Stand möglich.", "invalid_transition");
        var mismatch = Version(http, package, body.Version);
        if (mismatch is not null) return mismatch;
        if (await IsStale(db, package, ct)) return Problems.Conflict(http, "Der Prüfstand ist überholt. Reiche die Fassung erneut ein.", "stale_review");
        var author = await db.Users.AsNoTracking().FirstAsync(item => item.Id == gate.UserId, ct);
        var now = clock.GetUtcNow();
        db.PackageDecisions.Add(Decision(package, package.ReviewSnapshotId.Value, "freigegeben", "", gate.UserId, author.DisplayName, now));
        package.ApprovedSnapshotId = package.ReviewSnapshotId;
        package.Status = PackageStatus.Freigegeben;
        Touch(package, clock);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Ok(await Map(db, package, ct));
    }

    private static async Task<IResult> Handover(ProjectGuard guard, AppDbContext db, Guid projectId, Guid packageId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var package = await Find(db, projectId, packageId, ct);
        if (package is null) return Problems.NotFound(http);
        if (package.Status != PackageStatus.Freigegeben || package.ApprovedSnapshotId is null)
        {
            return Problems.Conflict(http, "Die Übergabe verwendet die freigegebene Fassung.", "not_approved");
        }

        var snapshot = await db.ProjectSnapshots.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == package.ApprovedSnapshotId, ct);
        if (snapshot is null) return Problems.NotFound(http);
        var document = SnapshotJson.Deserialize(snapshot.PayloadJson);
        var live = await LiveIds(db, projectId, document, ct);
        var markdown = HandoverText(projectId, package, snapshot, document, live);
        return Results.Ok(new HandoverResponse(markdown));
    }

    private static async Task<IResult> ReviewComments(ProjectGuard guard, AppDbContext db, Guid projectId, Guid artifactId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var rows = await (
            from comment in db.PackageComments.AsNoTracking()
            join package in db.ChangePackages.AsNoTracking() on comment.PackageId equals package.Id
            where comment.ProjectId == projectId && comment.ArtifactId == artifactId && comment.Status == CommentStatus.Offen
            orderby comment.CreatedAt
            select new ArtifactReviewComment(comment.Id, package.Id, package.Title, comment.Text, comment.AuthorName, comment.CreatedAt)).ToListAsync(ct);
        return Results.Ok(rows);
    }

    private static async Task<IResult?> ValidateMeta(AppDbContext db, HttpContext http, Guid projectId, string title, string goal, Guid? areaId, Guid ownerId, Guid? reviewerId, CancellationToken ct)
    {
        var errors = new List<string>();
        if (TextInput.Required(title, "Titel", 160) is string titleError) errors.Add(titleError);
        if (TextInput.Required(goal, "Ziel", 4000) is string goalError) errors.Add(goalError);
        if (areaId is Guid area && !await db.Areas.AnyAsync(item => item.ProjectId == projectId && item.Id == area, ct))
        {
            errors.Add("Der Fachbereich gehört nicht zu diesem Projekt.");
        }

        var memberIds = await db.Memberships.AsNoTracking().Where(item => item.ProjectId == projectId).Select(item => item.UserId).ToListAsync(ct);
        if (!memberIds.Contains(ownerId)) errors.Add("Die verantwortliche Person muss Mitglied des Projekts sein.");
        if (reviewerId is Guid reviewer && !memberIds.Contains(reviewer)) errors.Add("Die Prüfperson muss Mitglied des Projekts sein.");
        return errors.Count == 0 ? null : Problems.BadRequest(http, errors.ToArray());
    }

    private static async Task<ChangePackage?> Find(AppDbContext db, Guid projectId, Guid packageId, CancellationToken ct) =>
        await db.ChangePackages.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == packageId, ct);

    private static IResult? Version(HttpContext http, ChangePackage package, int version) =>
        package.Version == version ? null : Problems.Conflict(http, "Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.", "version_conflict", package.Version);

    private static void Touch(ChangePackage package, TimeProvider clock)
    {
        package.Version++;
        package.UpdatedAt = clock.GetUtcNow();
    }

    private static bool CanReview(GuardResult gate, ChangePackage package) =>
        gate.Role == ProjectRole.Owner || (gate.Role == ProjectRole.Editor && package.ReviewerId == gate.UserId);

    private static PackageDecision Decision(ChangePackage package, Guid snapshotId, string action, string reason, Guid actorId, string actorName, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(),
        PackageId = package.Id,
        ProjectId = package.ProjectId,
        SnapshotId = snapshotId,
        Action = action,
        Reason = reason,
        ActorId = actorId,
        ActorName = actorName,
        CreatedAt = now,
    };

    private static async Task<bool> IsStale(AppDbContext db, ChangePackage package, CancellationToken ct)
    {
        if (package.Status != PackageStatus.InPruefung || package.ReviewSnapshotId is null)
        {
            return false;
        }

        var snapshot = await db.ProjectSnapshots.AsNoTracking().FirstOrDefaultAsync(item => item.Id == package.ReviewSnapshotId && item.ProjectId == package.ProjectId, ct);
        if (snapshot is null)
        {
            return true;
        }

        var ids = await db.ChangePackageItems.AsNoTracking().Where(item => item.PackageId == package.Id).Select(item => item.ArtifactId).ToListAsync(ct);
        var current = await SnapshotCapture.Package(db, package.ProjectId, ids, ct);
        return SnapshotJson.Hash(current) != snapshot.ContentHash;
    }

    private static async Task<List<PackageSummary>> Summaries(AppDbContext db, Guid projectId, List<ChangePackage> packages, CancellationToken ct)
    {
        var names = await Names(db, packages.SelectMany(item => new[] { item.OwnerId, item.ReviewerId ?? Guid.Empty }), ct);
        var areas = await AreaNames(db, projectId, ct);
        var result = new List<PackageSummary>();
        foreach (var package in packages)
        {
            result.Add(new PackageSummary(package.Id, package.Title, package.Goal, package.AreaId, package.AreaId is Guid area ? areas.GetValueOrDefault(area) : null, package.OwnerId, names.GetValueOrDefault(package.OwnerId, "Unbekannt"), package.ReviewerId, package.ReviewerId is Guid reviewer ? names.GetValueOrDefault(reviewer) : null, package.Status, package.Version, await IsStale(db, package, ct), package.UpdatedAt));
        }

        return result;
    }

    private static async Task<PackageDetailResponse> Map(AppDbContext db, ChangePackage package, CancellationToken ct)
    {
        var areas = await AreaNames(db, package.ProjectId, ct);
        var items = await db.ChangePackageItems.AsNoTracking().Where(item => item.PackageId == package.Id).OrderBy(item => item.CreatedAt).ToListAsync(ct);
        var comments = await db.PackageComments.AsNoTracking().Where(item => item.PackageId == package.Id).OrderBy(item => item.CreatedAt).ToListAsync(ct);
        var names = await Names(db, comments.Select(item => item.AssigneeId ?? Guid.Empty).Append(package.OwnerId).Append(package.ReviewerId ?? Guid.Empty), ct);
        var present = await ArtifactCatalog.Labels(db, package.ProjectId, items.Select(item => item.ArtifactId), ct);
        var commentArtifacts = await ArtifactCatalog.Labels(db, package.ProjectId, comments.Where(item => item.ArtifactId != null).Select(item => item.ArtifactId!.Value), ct);
        var decisions = await db.PackageDecisions.AsNoTracking().Where(item => item.PackageId == package.Id).OrderBy(item => item.CreatedAt).ToListAsync(ct);
        var decisionIds = await DecisionIds(db, present.Values, ct);
        return new PackageDetailResponse(
            package.Id,
            package.Title,
            package.Goal,
            package.AreaId,
            package.AreaId is Guid area ? areas.GetValueOrDefault(area) : null,
            package.OwnerId,
            names.GetValueOrDefault(package.OwnerId, "Unbekannt"),
            package.ReviewerId,
            package.ReviewerId is Guid reviewer ? names.GetValueOrDefault(reviewer) : null,
            package.Status,
            package.Version,
            await IsStale(db, package, ct),
            package.ReviewSnapshotId,
            package.ApprovedSnapshotId,
            items.Select(item => new PackageItemResponse(item.Id, item.ArtifactId, present.TryGetValue(item.ArtifactId, out var label) ? ItemType(label, decisionIds) : item.ArtifactType, present.TryGetValue(item.ArtifactId, out label) ? label.Title : item.ArtifactTitle, item.DiagramId, item.Note, !present.ContainsKey(item.ArtifactId))).ToList(),
            comments.Select(item => new PackageCommentResponse(item.Id, item.ArtifactId, item.TargetType, item.ArtifactId is Guid id && commentArtifacts.TryGetValue(id, out var label) ? label.Title : item.TargetTitle, item.DiagramId, item.AuthorName, item.Text, item.Status, item.CreatedAt, item.ArtifactId is Guid artifact && !commentArtifacts.ContainsKey(artifact), item.AssigneeId, item.AssigneeId is Guid person ? names.GetValueOrDefault(person) : null)).ToList(),
            decisions.Select(item => new PackageDecisionResponse(item.Id, item.SnapshotId, item.Action, item.Reason, item.ActorName, item.CreatedAt)).ToList());
    }

    private static async Task<Dictionary<Guid, string>> Names(AppDbContext db, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Where(item => item != Guid.Empty).Distinct().ToArray();
        return await db.Users.AsNoTracking().Where(item => list.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.DisplayName, ct);
    }

    private static Task<Dictionary<Guid, string>> AreaNames(AppDbContext db, Guid projectId, CancellationToken ct) =>
        db.Areas.AsNoTracking().Where(item => item.ProjectId == projectId).ToDictionaryAsync(item => item.Id, item => item.Name, ct);

    private static async Task<string> PublicType(AppDbContext db, ArtifactLabel label, CancellationToken ct)
    {
        if (label.Type != ArtifactType.Document)
        {
            return ItemType(label, new HashSet<Guid>());
        }

        var kind = await db.Documents.AsNoTracking().Where(item => item.ArtifactId == label.Id).Select(item => item.Kind).FirstOrDefaultAsync(ct);
        return kind == DocumentKind.Decision ? "decision" : "document";
    }

    private static async Task<HashSet<Guid>> DecisionIds(AppDbContext db, IEnumerable<ArtifactLabel> labels, CancellationToken ct)
    {
        var ids = labels.Where(item => item.Type == ArtifactType.Document).Select(item => item.Id).ToArray();
        if (ids.Length == 0)
        {
            return [];
        }

        return (await db.Documents.AsNoTracking().Where(item => ids.Contains(item.ArtifactId) && item.Kind == DocumentKind.Decision).Select(item => item.ArtifactId).ToListAsync(ct)).ToHashSet();
    }

    private static string ItemType(ArtifactLabel label, HashSet<Guid> decisionIds) => label.Type switch
    {
        ArtifactType.Requirement => "requirement",
        ArtifactType.DiagramNode => "node",
        ArtifactType.Screen => "screen",
        ArtifactType.Component => "component",
        ArtifactType.Diagram => label.NodeType == nameof(DiagramKind.Process) ? "process" : "system",
        ArtifactType.Document => decisionIds.Contains(label.Id) ? "decision" : "document",
        _ => "document",
    };

    private static async Task<HashSet<Guid>> LiveIds(AppDbContext db, Guid projectId, SnapshotDocument document, CancellationToken ct)
    {
        var ids = document.Artifacts.Where(item => item.Type != "edge").Select(item => item.Id).ToArray();
        var labels = await ArtifactCatalog.Labels(db, projectId, ids, ct);
        return labels.Keys.ToHashSet();
    }

    public static string HandoverText(Guid projectId, ChangePackage package, ProjectSnapshot snapshot, SnapshotDocument document, IReadOnlySet<Guid> live)
    {
        var lines = new List<string>
        {
            $"# {package.Title}",
            "",
            package.Goal,
            "",
            $"Freigegebener Stand: {snapshot.Name}",
            $"Zeitpunkt: {snapshot.CreatedAt:yyyy-MM-dd HH:mm} UTC",
            $"Erstellt von: {snapshot.CreatedByName}",
            "",
            "## Anforderungen und Akzeptanzkriterien",
        };
        foreach (var requirement in document.Artifacts.Where(item => item.Type == "requirement"))
        {
            lines.Add("");
            lines.Add($"### {requirement.Title}");
            if (!string.IsNullOrWhiteSpace(requirement.Content)) lines.Add(requirement.Content);
            lines.AddRange(Links(projectId, snapshot.Id, requirement, live));
        }

        lines.Add("");
        lines.Add("## Entscheidungen");
        foreach (var decision in document.Artifacts.Where(item => item.Type == "decision"))
        {
            lines.Add("");
            lines.Add($"### {decision.Title}");
            if (!string.IsNullOrWhiteSpace(decision.Status)) lines.Add($"Status: {decision.Status}");
            lines.AddRange(Links(projectId, snapshot.Id, decision, live));
        }

        lines.Add("");
        lines.Add("## Weitere Artefakte");
        foreach (var artifact in document.Artifacts.Where(item => item.Type is not "requirement" and not "decision" and not "edge"))
        {
            lines.Add("");
            lines.Add($"- {TypeLabel(artifact.Type)}: {artifact.Title}");
            lines.AddRange(Links(projectId, snapshot.Id, artifact, live).Select(item => $"  {item}"));
        }

        return string.Join('\n', lines).TrimEnd() + "\n";
    }

    private static IEnumerable<string> Links(Guid projectId, Guid snapshotId, SnapshotArtifact artifact, IReadOnlySet<Guid> live)
    {
        yield return $"Fassung: /projekte/{projectId}/staende/{snapshotId}?artefakt={artifact.Id}";
        if (live.Contains(artifact.Id))
        {
            yield return $"Aktuell: {LiveHref(projectId, artifact)}";
        }
    }

    private static string LiveHref(Guid projectId, SnapshotArtifact artifact) => artifact.Type switch
    {
        "requirement" => $"/projekte/{projectId}/anforderungen/{artifact.Id}",
        "node" => $"/projekte/{projectId}/diagramme/{artifact.DiagramId}?node={artifact.Id}",
        "screen" => $"/projekte/{projectId}/ui/{artifact.Id}",
        "component" => $"/projekte/{projectId}/system/komponenten/{artifact.Id}",
        "diagram" => $"/projekte/{projectId}/diagramme/{artifact.Id}",
        _ => $"/projekte/{projectId}/dokumente/{artifact.Id}",
    };

    private static string TypeLabel(string type) => type switch
    {
        "node" => "Prozessknoten",
        "screen" => "Screen",
        "component" => "Komponente",
        "diagram" => "Diagramm",
        "document" => "Dokument",
        _ => type,
    };
}
