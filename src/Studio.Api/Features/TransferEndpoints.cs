using System.Text.Json;
using System.Text.RegularExpressions;

namespace Studio.Api.Features;

public static partial class TransferEndpoints
{
    public const int MaxBytes = 1_200_000;

    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/export", Export);
        group.MapPost("/projects/import/preview", Preview);
        group.MapPost("/projects/import", Import);
    }

    private static async Task<IResult> Export(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Owner, ct);
        if (gate.Failed) return gate.Error!;
        var project = await db.Projects.AsNoTracking().FirstAsync(item => item.Id == projectId, ct);
        var names = await db.Users.AsNoTracking().ToDictionaryAsync(item => item.Id, item => item.DisplayName, ct);
        var file = new TransferFile
        {
            Format = "sarch-project",
            Version = 1,
            ExportedAt = clock.GetUtcNow(),
            Project = new TransferProject { Name = project.Name, Description = project.Description },
            Areas = await db.Areas.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.SortOrder)
                .Select(item => new TransferArea { Id = item.Id, ParentId = item.ParentId, Name = item.Name, Description = item.Description, SortOrder = item.SortOrder }).ToListAsync(ct),
            Requirements = await db.Requirements.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Key)
                .Select(item => new TransferRequirement { Id = item.ArtifactId, Key = item.Key, Title = item.Title, Description = item.Description, Status = item.Status.ToString(), Priority = item.Priority.ToString(), Tags = item.Tags }).ToListAsync(ct),
            Diagrams = await db.Diagrams.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Name)
                .Select(item => new TransferDiagram { Id = item.ArtifactId, Name = item.Name, Description = item.Description, Kind = item.Kind.ToString(), AreaId = item.AreaId }).ToListAsync(ct),
            Nodes = await db.DiagramNodes.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferNode { Id = item.ArtifactId, DiagramId = item.DiagramId, NodeType = item.NodeType, Title = item.Title, X = item.PositionX, Y = item.PositionY, ComponentId = item.ComponentId, Description = item.Description, EventName = item.EventName }).ToListAsync(ct),
            Edges = await db.DiagramEdges.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferEdge { Id = item.Id, DiagramId = item.DiagramId, SourceId = item.SourceNodeId, TargetId = item.TargetNodeId, Kind = item.Kind.ToString(), Label = item.Label, Condition = item.Condition, Protocol = item.Protocol }).ToListAsync(ct),
            Components = await db.Components.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferComponent { Id = item.ArtifactId, Name = item.Name, Description = item.Description, Kind = item.Kind.ToString(), Technology = item.Technology }).ToListAsync(ct),
            Screens = await db.Screens.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferScreen { Id = item.ArtifactId, Name = item.Name, Route = item.Route, Purpose = item.Purpose, Status = item.Status.ToString(), Notes = item.Notes, WireframeJson = item.WireframeJson }).ToListAsync(ct),
            Navigations = await db.ScreenNavigations.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferNavigation { Id = item.Id, SourceScreenId = item.SourceScreenId, ElementId = item.ElementId, TargetScreenId = item.TargetScreenId }).ToListAsync(ct),
            Documents = await db.Documents.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferDocument { Id = item.ArtifactId, ParentId = item.ParentId, Title = item.Title, Kind = item.Kind.ToString(), Status = item.Status.ToString(), ContentJson = item.ContentJson, SortOrder = item.SortOrder }).ToListAsync(ct),
            Revisions = await db.DocumentRevisions.AsNoTracking().Where(item => item.ProjectId == projectId).OrderBy(item => item.Number)
                .Select(item => new TransferRevision { Id = item.Id, DocumentId = item.DocumentId, Number = item.Number, Title = item.Title, Status = item.Status.ToString(), ContentJson = item.ContentJson, AuthorName = item.AuthorName ?? "", CreatedAt = item.CreatedAt }).ToListAsync(ct),
            Links = await db.ArtifactLinks.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferLink { Id = item.Id, SourceId = item.SourceArtifactId, TargetId = item.TargetArtifactId, Relation = item.Relation.ToString(), Rationale = item.Rationale }).ToListAsync(ct),
            Views = await db.SavedViews.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferView { Id = item.Id, Name = item.Name, Scope = item.Scope, AreaId = item.AreaId, Unassigned = item.Unassigned, Query = item.Query }).ToListAsync(ct),
            Packages = await db.ChangePackages.AsNoTracking().Where(item => item.ProjectId == projectId)
                .Select(item => new TransferPackage { Id = item.Id, Title = item.Title, Goal = item.Goal, AreaId = item.AreaId, Status = item.Status.ToString(), ReviewSnapshotId = item.ReviewSnapshotId, ApprovedSnapshotId = item.ApprovedSnapshotId, OwnerName = "", ReviewerName = null }).ToListAsync(ct),
        };
        foreach (var package in file.Packages)
        {
            var source = await db.ChangePackages.AsNoTracking().FirstAsync(item => item.Id == package.Id, ct);
            package.OwnerName = names.GetValueOrDefault(source.OwnerId, "Unbekannt");
            package.ReviewerName = source.ReviewerId is Guid reviewer ? names.GetValueOrDefault(reviewer) : null;
        }

        foreach (var revision in file.Revisions.Where(item => item.AuthorName.Length == 0))
        {
            var source = await db.DocumentRevisions.AsNoTracking().FirstAsync(item => item.Id == revision.Id, ct);
            revision.AuthorName = names.GetValueOrDefault(source.AuthorId, "Unbekannt");
        }

        file.PackageItems = await db.ChangePackageItems.AsNoTracking().Where(item => item.ProjectId == projectId)
            .Select(item => new TransferPackageItem { Id = item.Id, PackageId = item.PackageId, ArtifactId = item.ArtifactId, ArtifactType = item.ArtifactType, ArtifactTitle = item.ArtifactTitle, DiagramId = item.DiagramId, Note = item.Note }).ToListAsync(ct);
        file.Comments = await db.PackageComments.AsNoTracking().Where(item => item.ProjectId == projectId)
            .Select(item => new TransferComment { Id = item.Id, PackageId = item.PackageId, SnapshotId = item.SnapshotId, ArtifactId = item.ArtifactId, TargetType = item.TargetType, TargetTitle = item.TargetTitle, DiagramId = item.DiagramId, AuthorName = item.AuthorName, Text = item.Text, Status = item.Status.ToString(), CreatedAt = item.CreatedAt }).ToListAsync(ct);
        file.Decisions = await db.PackageDecisions.AsNoTracking().Where(item => item.ProjectId == projectId)
            .Select(item => new TransferDecision { Id = item.Id, PackageId = item.PackageId, SnapshotId = item.SnapshotId, Action = item.Action, Reason = item.Reason, ActorName = item.ActorName, CreatedAt = item.CreatedAt }).ToListAsync(ct);
        file.Snapshots = await db.ProjectSnapshots.AsNoTracking().Where(item => item.ProjectId == projectId)
            .Select(item => new TransferSnapshot { Id = item.Id, PackageId = item.PackageId, Name = item.Name, Scope = item.Scope, CreatedByName = item.CreatedByName, CreatedAt = item.CreatedAt, ContentHash = item.ContentHash, PayloadJson = item.PayloadJson }).ToListAsync(ct);
        return Results.Ok(file);
    }

    private static async Task<IResult> Preview(HttpContext http, CancellationToken ct)
    {
        var read = await Read(http, ct);
        if (read.Error is not null) return read.Error;
        var errors = Validate(read.File!);
        return Results.Ok(new TransferPreview(errors.Count == 0, errors, Summary(read.File!)));
    }

    private static async Task<IResult> Import(AppDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct)
    {
        var userId = CurrentUser.Id(http.User);
        if (userId is null) return Results.Unauthorized();
        var read = await Read(http, ct);
        if (read.Error is not null) return read.Error;
        var errors = Validate(read.File!);
        if (errors.Count > 0) return Problems.BadRequest(http, errors.ToArray());
        var file = Remap(read.File!);
        var now = clock.GetUtcNow();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var project = new Project
        {
            Id = Guid.CreateVersion7(),
            Name = file.Project!.Name.Trim(),
            Description = file.Project.Description?.Trim() ?? "",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Projects.Add(project);
        db.Memberships.Add(new ProjectMembership { Id = Guid.CreateVersion7(), ProjectId = project.Id, UserId = userId.Value, Role = ProjectRole.Owner, CreatedAt = now });
        var maxKey = file.Requirements.Select(item => KeyNumber(item.Key)).DefaultIfEmpty(0).Max();
        db.ProjectCounters.Add(new ProjectCounter { ProjectId = project.Id, NextRequirement = maxKey });
        foreach (var area in file.Areas)
        {
            db.Areas.Add(new Area { Id = area.Id, ProjectId = project.Id, Name = area.Name, Description = area.Description ?? "", SortOrder = area.SortOrder, CreatedAt = now, UpdatedAt = now });
        }

        foreach (var item in file.Requirements)
        {
            db.Artifacts.Add(NewArtifact(project.Id, item.Id, ArtifactType.Requirement, now));
            db.Requirements.Add(new Requirement
            {
                ArtifactId = item.Id,
                ProjectId = project.Id,
                Key = item.Key,
                Title = item.Title,
                Description = item.Description ?? "",
                Status = Enum.Parse<RequirementStatus>(item.Status),
                Priority = Enum.Parse<RequirementPriority>(item.Priority),
                Tags = item.Tags ?? [],
                CreatedAt = now,
                UpdatedAt = now,
                SearchText = SearchText.Build(item.Key, item.Title, item.Description, string.Join(' ', item.Tags ?? [])),
            });
        }

        foreach (var item in file.Diagrams)
        {
            db.Artifacts.Add(NewArtifact(project.Id, item.Id, ArtifactType.Diagram, now));
            db.Diagrams.Add(new Diagram
            {
                ArtifactId = item.Id,
                ProjectId = project.Id,
                Name = item.Name,
                Description = item.Description ?? "",
                Kind = Enum.Parse<DiagramKind>(item.Kind),
                AreaId = item.AreaId,
                CreatedAt = now,
                UpdatedAt = now,
                SearchText = SearchText.Build(item.Name, item.Description),
            });
        }

        foreach (var item in file.Components)
        {
            db.Artifacts.Add(NewArtifact(project.Id, item.Id, ArtifactType.Component, now));
            db.Components.Add(new Component
            {
                ArtifactId = item.Id,
                ProjectId = project.Id,
                Name = item.Name,
                Description = item.Description ?? "",
                Kind = Enum.Parse<ComponentKind>(item.Kind),
                Technology = item.Technology,
                CreatedAt = now,
                UpdatedAt = now,
                SearchText = SearchText.Build(item.Name, item.Description, item.Technology),
            });
        }

        foreach (var item in file.Screens)
        {
            db.Artifacts.Add(NewArtifact(project.Id, item.Id, ArtifactType.Screen, now));
            db.Screens.Add(new Screen
            {
                ArtifactId = item.Id,
                ProjectId = project.Id,
                Name = item.Name,
                Route = item.Route,
                Purpose = item.Purpose ?? "",
                Status = Enum.Parse<ScreenStatus>(item.Status),
                Notes = item.Notes ?? "",
                WireframeJson = item.WireframeJson,
                CreatedAt = now,
                UpdatedAt = now,
                SearchText = SearchText.Build(item.Name, item.Route, item.Purpose),
            });
        }

        foreach (var item in file.Documents)
        {
            db.Artifacts.Add(NewArtifact(project.Id, item.Id, ArtifactType.Document, now));
            db.Documents.Add(new Document
            {
                ArtifactId = item.Id,
                ProjectId = project.Id,
                Title = item.Title,
                Kind = Enum.Parse<DocumentKind>(item.Kind),
                Status = Enum.Parse<DocumentStatus>(item.Status),
                ContentJson = item.ContentJson,
                SortOrder = item.SortOrder,
                CreatedAt = now,
                UpdatedAt = now,
                SearchText = SearchText.Build(item.Title, TipTapRules.PlainText(item.ContentJson)),
            });
        }

        await db.SaveChangesAsync(ct);
        foreach (var item in file.Areas.Where(entry => entry.ParentId is not null))
        {
            var area = await db.Areas.FirstAsync(entry => entry.Id == item.Id, ct);
            area.ParentId = item.ParentId;
        }

        foreach (var item in file.Nodes)
        {
            db.Artifacts.Add(NewArtifact(project.Id, item.Id, ArtifactType.DiagramNode, now));
            db.DiagramNodes.Add(new DiagramNode
            {
                ArtifactId = item.Id,
                ProjectId = project.Id,
                DiagramId = item.DiagramId,
                NodeType = item.NodeType,
                Title = item.Title ?? "",
                PositionX = item.X,
                PositionY = item.Y,
                ComponentId = item.ComponentId,
                Description = item.Description,
                EventName = item.EventName,
                CreatedAt = now,
                UpdatedAt = now,
                SearchText = SearchText.Build(item.Title, item.Description, item.EventName),
            });
        }

        await db.SaveChangesAsync(ct);
        foreach (var item in file.Edges)
        {
            db.DiagramEdges.Add(new DiagramEdge
            {
                Id = item.Id,
                ProjectId = project.Id,
                DiagramId = item.DiagramId,
                SourceNodeId = item.SourceId,
                TargetNodeId = item.TargetId,
                Kind = Enum.Parse<EdgeKind>(item.Kind),
                Label = item.Label,
                Condition = item.Condition,
                Protocol = item.Protocol,
            });
        }

        foreach (var item in file.Navigations)
        {
            db.ScreenNavigations.Add(new ScreenNavigation { Id = item.Id, ProjectId = project.Id, SourceScreenId = item.SourceScreenId, ElementId = item.ElementId, TargetScreenId = item.TargetScreenId });
        }

        foreach (var item in file.Revisions)
        {
            db.DocumentRevisions.Add(new DocumentRevision
            {
                Id = item.Id,
                DocumentId = item.DocumentId,
                ProjectId = project.Id,
                Number = item.Number,
                Title = item.Title,
                Status = Enum.Parse<DocumentStatus>(item.Status),
                ContentJson = item.ContentJson,
                AuthorId = userId.Value,
                AuthorName = string.IsNullOrWhiteSpace(item.AuthorName) ? "Unbekannt" : item.AuthorName,
                CreatedAt = item.CreatedAt == default ? now : item.CreatedAt,
            });
        }

        foreach (var item in file.Documents.Where(entry => entry.ParentId != null))
        {
            var document = await db.Documents.FirstAsync(entry => entry.ArtifactId == item.Id, ct);
            document.ParentId = item.ParentId;
        }

        foreach (var item in file.Links)
        {
            db.ArtifactLinks.Add(new ArtifactLink
            {
                Id = item.Id,
                ProjectId = project.Id,
                SourceArtifactId = item.SourceId,
                TargetArtifactId = item.TargetId,
                Relation = Enum.Parse<LinkRelation>(item.Relation),
                Rationale = item.Rationale,
                CreatedAt = now,
            });
        }

        foreach (var item in file.Views)
        {
            db.SavedViews.Add(new SavedView
            {
                Id = item.Id,
                ProjectId = project.Id,
                Name = item.Name,
                Scope = item.Scope,
                AreaId = item.AreaId,
                Unassigned = item.Unassigned,
                Query = item.Query ?? "",
                CreatedById = userId.Value,
                CreatedAt = now,
            });
        }

        foreach (var item in file.Packages)
        {
            db.ChangePackages.Add(new ChangePackage
            {
                Id = item.Id,
                ProjectId = project.Id,
                Title = item.Title,
                Goal = item.Goal,
                AreaId = item.AreaId,
                OwnerId = userId.Value,
                ReviewerId = userId.Value,
                Status = Enum.Parse<PackageStatus>(item.Status),
                ReviewSnapshotId = item.ReviewSnapshotId,
                ApprovedSnapshotId = item.ApprovedSnapshotId,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        await db.SaveChangesAsync(ct);
        foreach (var item in file.PackageItems)
        {
            db.ChangePackageItems.Add(new ChangePackageItem
            {
                Id = item.Id,
                PackageId = item.PackageId,
                ProjectId = project.Id,
                ArtifactId = item.ArtifactId,
                ArtifactType = item.ArtifactType,
                ArtifactTitle = item.ArtifactTitle,
                DiagramId = item.DiagramId,
                Note = item.Note,
                CreatedAt = now,
            });
        }

        foreach (var item in file.Comments)
        {
            db.PackageComments.Add(new PackageComment
            {
                Id = item.Id,
                PackageId = item.PackageId,
                ProjectId = project.Id,
                SnapshotId = item.SnapshotId,
                ArtifactId = item.ArtifactId,
                TargetType = item.TargetType,
                TargetTitle = item.TargetTitle,
                DiagramId = item.DiagramId,
                AuthorId = userId.Value,
                AuthorName = string.IsNullOrWhiteSpace(item.AuthorName) ? "Unbekannt" : item.AuthorName,
                Text = item.Text,
                Status = Enum.Parse<CommentStatus>(item.Status),
                CreatedAt = item.CreatedAt == default ? now : item.CreatedAt,
            });
        }

        foreach (var item in file.Decisions)
        {
            db.PackageDecisions.Add(new PackageDecision
            {
                Id = item.Id,
                PackageId = item.PackageId,
                ProjectId = project.Id,
                SnapshotId = item.SnapshotId,
                Action = item.Action,
                Reason = item.Reason ?? "",
                ActorId = userId.Value,
                ActorName = string.IsNullOrWhiteSpace(item.ActorName) ? "Unbekannt" : item.ActorName,
                CreatedAt = item.CreatedAt == default ? now : item.CreatedAt,
            });
        }

        foreach (var item in file.Snapshots)
        {
            var payload = SnapshotJson.Deserialize(item.PayloadJson);
            db.ProjectSnapshots.Add(new ProjectSnapshot
            {
                Id = item.Id,
                ProjectId = project.Id,
                PackageId = item.PackageId,
                Name = item.Name,
                Scope = item.Scope,
                CreatedById = userId.Value,
                CreatedByName = string.IsNullOrWhiteSpace(item.CreatedByName) ? "Unbekannt" : item.CreatedByName,
                CreatedAt = item.CreatedAt == default ? now : item.CreatedAt,
                ContentHash = SnapshotJson.Hash(payload),
                PayloadJson = SnapshotJson.Serialize(payload),
            });
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Created($"/api/v1/projects/{project.Id}", new { id = project.Id, name = project.Name });
    }

    private static async Task<(TransferFile? File, IResult? Error)> Read(HttpContext http, CancellationToken ct)
    {
        if (http.Request.ContentLength > MaxBytes)
        {
            return (null, Problems.BadRequest(http, "Die Datei ist zu groß."));
        }

        try
        {
            var file = await http.Request.ReadFromJsonAsync<TransferFile>(SnapshotJson.Options, ct);
            if (file is null) return (null, Problems.BadRequest(http, "Die Datei enthält kein Projekt."));
            return (file, null);
        }
        catch (JsonException)
        {
            return (null, Problems.BadRequest(http, "Die Datei ist kein gültiges JSON."));
        }
    }

    private static TransferFile Remap(TransferFile file)
    {
        var json = JsonSerializer.Serialize(file, SnapshotJson.Options);
        var map = new Dictionary<Guid, Guid>();
        foreach (Match match in GuidPattern().Matches(json))
        {
            if (Guid.TryParse(match.Value, out var id)) map.TryAdd(id, Guid.CreateVersion7());
        }

        var replaced = GuidPattern().Replace(json, match => Guid.TryParse(match.Value, out var id) && map.TryGetValue(id, out var next) ? next.ToString() : match.Value);
        return JsonSerializer.Deserialize<TransferFile>(replaced, SnapshotJson.Options)!;
    }

    private static List<string> Validate(TransferFile file)
    {
        var errors = new List<string>();
        void Add(string message)
        {
            if (errors.Count < 20) errors.Add(message);
        }

        if (file.Format != "sarch-project") Add("Das Format wird nicht erkannt.");
        if (file.Version != 1) Add("Die Formatversion wird nicht unterstützt.");
        if (string.IsNullOrWhiteSpace(file.Project?.Name) || file.Project!.Name.Trim().Length > 160) Add("Der Projektname fehlt oder ist zu lang.");
        var artifacts = new HashSet<Guid>();
        void Unique(Guid id, string label)
        {
            if (id == Guid.Empty || !artifacts.Add(id)) Add($"{label} hat eine doppelte oder leere Kennung.");
        }

        foreach (var item in file.Requirements) Unique(item.Id, "Anforderung");
        foreach (var item in file.Diagrams) Unique(item.Id, "Diagramm");
        foreach (var item in file.Nodes) Unique(item.Id, "Knoten");
        foreach (var item in file.Components) Unique(item.Id, "Komponente");
        foreach (var item in file.Screens) Unique(item.Id, "Screen");
        foreach (var item in file.Documents) Unique(item.Id, "Dokument");
        var areas = file.Areas.Select(item => item.Id).ToHashSet();
        var diagrams = file.Diagrams.Select(item => item.Id).ToHashSet();
        var nodes = file.Nodes.Select(item => item.Id).ToHashSet();
        var components = file.Components.Select(item => item.Id).ToHashSet();
        var screens = file.Screens.Select(item => item.Id).ToHashSet();
        var documents = file.Documents.Select(item => item.Id).ToHashSet();
        var packages = file.Packages.Select(item => item.Id).ToHashSet();
        var snapshots = file.Snapshots.Select(item => item.Id).ToHashSet();
        foreach (var item in file.Nodes)
        {
            if (!diagrams.Contains(item.DiagramId)) Add("Ein Knoten verweist auf ein fehlendes Diagramm.");
            if (item.ComponentId is Guid component && !components.Contains(component)) Add("Eine Platzierung verweist auf eine fehlende Komponente.");
        }

        foreach (var item in file.Edges)
        {
            if (!nodes.Contains(item.SourceId) || !nodes.Contains(item.TargetId) || !diagrams.Contains(item.DiagramId)) Add("Eine Kante verweist auf einen fehlenden Knoten.");
            if (!Enum.TryParse<EdgeKind>(item.Kind, out _)) Add("Eine Kante hat eine unbekannte Art.");
        }

        foreach (var item in file.Navigations)
        {
            if (!screens.Contains(item.SourceScreenId) || !screens.Contains(item.TargetScreenId)) Add("Eine Navigation verweist auf einen fehlenden Screen.");
        }

        var areaParents = file.Areas.ToDictionary(item => item.Id, item => item.ParentId);
        foreach (var item in file.Areas)
        {
            if (item.ParentId is Guid parent && !areas.Contains(parent)) Add("Ein Unterbereich verweist auf einen fehlenden Bereich.");
            else if (AreaRules.CreatesCycle(item.Id, item.ParentId, areaParents)) Add("Ein Bereich kann nicht unter einen seiner eigenen Unterbereiche gelegt werden.");
        }

        foreach (var item in file.Documents)
        {
            if (item.ParentId is Guid parent && !documents.Contains(parent)) Add("Eine Seite verweist auf eine fehlende übergeordnete Seite.");
            if (!Enum.TryParse<DocumentKind>(item.Kind, out _) || !Enum.TryParse<DocumentStatus>(item.Status, out _)) Add("Ein Dokument hat einen unbekannten Status.");
        }

        foreach (var item in file.Revisions)
        {
            if (!documents.Contains(item.DocumentId)) Add("Eine Revision verweist auf ein fehlendes Dokument.");
        }

        foreach (var item in file.Links)
        {
            if (!artifacts.Contains(item.SourceId) || !artifacts.Contains(item.TargetId)) Add("Eine Verknüpfung verweist auf ein fehlendes Artefakt.");
            if (!Enum.TryParse<LinkRelation>(item.Relation, out _)) Add("Eine Verknüpfung hat eine unbekannte Art.");
        }

        foreach (var item in file.Requirements)
        {
            if (!Enum.TryParse<RequirementStatus>(item.Status, out _) || !Enum.TryParse<RequirementPriority>(item.Priority, out _)) Add("Eine Anforderung hat einen unbekannten Status.");
        }

        foreach (var item in file.Diagrams)
        {
            if (!Enum.TryParse<DiagramKind>(item.Kind, out _)) Add("Ein Diagramm hat eine unbekannte Art.");
            if (item.AreaId is Guid area && !areas.Contains(area)) Add("Ein Diagramm verweist auf einen fehlenden Bereich.");
        }

        foreach (var item in file.Components)
        {
            if (!Enum.TryParse<ComponentKind>(item.Kind, out _)) Add("Eine Komponente hat eine unbekannte Art.");
        }

        foreach (var item in file.Screens)
        {
            if (!Enum.TryParse<ScreenStatus>(item.Status, out _)) Add("Ein Screen hat einen unbekannten Status.");
        }

        foreach (var item in file.Packages)
        {
            if (!Enum.TryParse<PackageStatus>(item.Status, out _)) Add("Ein Änderungspaket hat einen unbekannten Status.");
            if (item.AreaId is Guid area && !areas.Contains(area)) Add("Ein Änderungspaket verweist auf einen fehlenden Bereich.");
            if (item.ReviewSnapshotId is Guid review && !snapshots.Contains(review)) Add("Ein Prüfstand fehlt in der Datei.");
            if (item.ApprovedSnapshotId is Guid approved && !snapshots.Contains(approved)) Add("Ein freigegebener Stand fehlt in der Datei.");
        }

        foreach (var item in file.PackageItems)
        {
            if (!packages.Contains(item.PackageId) || !artifacts.Contains(item.ArtifactId)) Add("Ein Paketeintrag verweist auf ein fehlendes Ziel.");
        }

        foreach (var item in file.Comments)
        {
            if (!packages.Contains(item.PackageId) || !Enum.TryParse<CommentStatus>(item.Status, out _)) Add("Ein Kommentar ist unvollständig.");
        }

        foreach (var item in file.Decisions)
        {
            if (!packages.Contains(item.PackageId) || !snapshots.Contains(item.SnapshotId)) Add("Eine Entscheidung verweist auf einen fehlenden Stand.");
        }

        foreach (var item in file.Snapshots)
        {
            if (item.PackageId is Guid package && !packages.Contains(package)) Add("Ein Stand verweist auf ein fehlendes Paket.");
            try
            {
                _ = SnapshotJson.Deserialize(item.PayloadJson);
            }
            catch (JsonException)
            {
                Add("Ein Stand enthält keinen lesbaren Inhalt.");
            }
        }

        return errors;
    }

    private static TransferSummary Summary(TransferFile file) => new(
        file.Areas.Count,
        file.Requirements.Count,
        file.Diagrams.Count,
        file.Nodes.Count,
        file.Screens.Count,
        file.Components.Count,
        file.Documents.Count,
        file.Revisions.Count,
        file.Links.Count,
        file.Packages.Count,
        file.Snapshots.Count);

    private static Artifact NewArtifact(Guid projectId, Guid id, ArtifactType type, DateTimeOffset now) => new()
    {
        Id = id,
        ProjectId = projectId,
        Type = type,
        CreatedAt = now,
        UpdatedAt = now,
    };

    private static int KeyNumber(string key)
    {
        var parts = key.Split('-');
        return parts.Length == 2 && int.TryParse(parts[1], out var number) ? number : 0;
    }

    [GeneratedRegex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", RegexOptions.CultureInvariant)]
    private static partial Regex GuidPattern();
}
