namespace Studio.Api.Infrastructure;

public static class DemoSeed
{
    public const string ProjectName = "Kundenportal";

    public static async Task ApplyAsync(IServiceProvider services, IHostEnvironment environment, ILogger logger, CancellationToken ct = default)
    {
        var config = services.GetRequiredService<IConfiguration>();
        if (!config.GetValue<bool>("Studio:SeedDemo"))
        {
            return;
        }

        if (!environment.IsDevelopment())
        {
            logger.LogWarning("Demo-Daten werden außerhalb der Entwicklung nicht angelegt.");
            return;
        }

        var password = config["Studio:DemoPassword"];
        var ownerEmail = config["Studio:DemoOwnerEmail"];
        var editorEmail = config["Studio:DemoEditorEmail"];
        var viewerEmail = config["Studio:DemoViewerEmail"];
        if (string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(ownerEmail) || string.IsNullOrWhiteSpace(editorEmail) || string.IsNullOrWhiteSpace(viewerEmail))
        {
            throw new InvalidOperationException("Demo-Daten sind aktiv, aber E-Mail-Adressen oder Passwort fehlen. Setze Studio__DemoPassword und die Demo-E-Mail-Adressen außerhalb des Repositorys.");
        }

        var users = services.GetRequiredService<UserManager<AppUser>>();
        var db = services.GetRequiredService<AppDbContext>();
        var clock = services.GetRequiredService<TimeProvider>();
        var owner = await EnsureUser(users, ownerEmail, "Nora Eigentümer", password);
        var editor = await EnsureUser(users, editorEmail, "Emil Editor", password);
        var viewer = await EnsureUser(users, viewerEmail, "Vera Ansicht", password);
        if (await db.Projects.AnyAsync(project => project.Name == ProjectName && db.Memberships.Any(member => member.ProjectId == project.Id && member.UserId == owner.Id), ct))
        {
            return;
        }

        var now = clock.GetUtcNow();
        var project = new Project { Id = Guid.CreateVersion7(), Name = ProjectName, Description = "Beispielprojekt für den Weg von der Anforderung bis zur Architektur.", CreatedAt = now, UpdatedAt = now };
        db.Projects.Add(project);
        db.ProjectCounters.Add(new ProjectCounter { ProjectId = project.Id, NextRequirement = 3 });
        db.Memberships.AddRange(
            Member(project.Id, owner.Id, ProjectRole.Owner, now),
            Member(project.Id, editor.Id, ProjectRole.Editor, now),
            Member(project.Id, viewer.Id, ProjectRole.Viewer, now));

        var req1 = Requirement(project.Id, "REQ-001", "Bestellung aufgeben", "Ein angemeldeter Kunde kann eine Bestellung aus dem Warenkorb absenden.", RequirementStatus.Offen, RequirementPriority.Hoch, now);
        var req2 = Requirement(project.Id, "REQ-002", "Bestellung freigeben", "Eine Mitarbeiterin prüft die Bestellung und gibt sie frei oder lehnt sie ab.", RequirementStatus.InBearbeitung, RequirementPriority.Hoch, now);
        var req3 = Requirement(project.Id, "REQ-003", "Zahlung bestätigen", "Die Zahlung wird nach der Freigabe bestätigt.", RequirementStatus.Zurueckgestellt, RequirementPriority.Mittel, now);
        db.Artifacts.AddRange(req1.Artifact, req2.Artifact, req3.Artifact);
        db.Requirements.AddRange(req1.Item, req2.Item, req3.Item);

        var review = Diagram(project.Id, DiagramKind.Process, "Bestellprüfung", "Prüfung einer eingegangenen Bestellung.", now);
        var notify = Diagram(project.Id, DiagramKind.Process, "Benachrichtigung", "Reaktion auf das Ereignis der Freigabe.", now);
        var context = Diagram(project.Id, DiagramKind.System, "Systemkontext", "Außenansicht des Kundenportals.", now);
        var container = Diagram(project.Id, DiagramKind.System, "Container", "Interne Aufteilung der Bestellbearbeitung.", now);
        db.Artifacts.AddRange(review.Artifact, notify.Artifact, context.Artifact, container.Artifact);
        db.Diagrams.AddRange(review.Item, notify.Item, context.Item, container.Item);

        var start = Node(project.Id, review.Item.ArtifactId, "start", "Eingang", 80, 180, now);
        var decision = Node(project.Id, review.Item.ArtifactId, "decision", "Freigabe?", 340, 150, now);
        var accept = Node(project.Id, review.Item.ArtifactId, "action", "Bestellung annehmen", 640, 40, now, "Die Bestellung wird angenommen und löst ein Ereignis aus.", "Bestellung eingegangen");
        var reject = Node(project.Id, review.Item.ArtifactId, "action", "Bestellung ablehnen", 640, 300, now);
        var done = Node(project.Id, review.Item.ArtifactId, "end", "Abgeschlossen", 940, 40, now);
        var stopped = Node(project.Id, review.Item.ArtifactId, "end", "Beendet", 940, 300, now);
        var eventStart = Node(project.Id, notify.Item.ArtifactId, "start", "Beginn", 80, 160, now);
        var received = Node(project.Id, notify.Item.ArtifactId, "event", "Bestellung eingegangen", 340, 150, now, eventName: "Bestellung eingegangen");
        var mail = Node(project.Id, notify.Item.ArtifactId, "action", "E-Mail senden", 640, 150, now);
        var eventEnd = Node(project.Id, notify.Item.ArtifactId, "end", "Versendet", 920, 150, now);

        var api = Component(project.Id, "Bestell-API", "Nimmt Bestellungen an und speichert die Freigabe.", ComponentKind.Api, "ASP.NET Core", now);
        var database = Component(project.Id, "Bestelldatenbank", "Speichert Bestellungen und Freigaben.", ComponentKind.Database, "PostgreSQL", now);
        db.Artifacts.AddRange(api.Artifact, database.Artifact);
        db.Components.AddRange(api.Item, database.Item);
        var apiContext = Placement(project.Id, context.Item.ArtifactId, api.Item, 180, 160, now);
        var dbContext = Placement(project.Id, context.Item.ArtifactId, database.Item, 520, 160, now);
        var apiContainer = Placement(project.Id, container.Item.ArtifactId, api.Item, 160, 80, now);
        var dbContainer = Placement(project.Id, container.Item.ArtifactId, database.Item, 520, 220, now);
        var nodes = new[] { start, decision, accept, reject, done, stopped, eventStart, received, mail, eventEnd, apiContext, dbContext, apiContainer, dbContainer };
        db.Artifacts.AddRange(nodes.Select(item => item.Artifact));
        db.DiagramNodes.AddRange(nodes.Select(item => item.Item));
        db.DiagramEdges.AddRange(
            Edge(project.Id, review.Item.ArtifactId, start.Item.ArtifactId, decision.Item.ArtifactId, now),
            Edge(project.Id, review.Item.ArtifactId, decision.Item.ArtifactId, accept.Item.ArtifactId, now, "Freigegeben"),
            Edge(project.Id, review.Item.ArtifactId, decision.Item.ArtifactId, reject.Item.ArtifactId, now, "Abgelehnt"),
            Edge(project.Id, review.Item.ArtifactId, accept.Item.ArtifactId, done.Item.ArtifactId, now),
            Edge(project.Id, review.Item.ArtifactId, reject.Item.ArtifactId, stopped.Item.ArtifactId, now),
            Edge(project.Id, notify.Item.ArtifactId, eventStart.Item.ArtifactId, received.Item.ArtifactId, now),
            Edge(project.Id, notify.Item.ArtifactId, received.Item.ArtifactId, mail.Item.ArtifactId, now),
            Edge(project.Id, notify.Item.ArtifactId, mail.Item.ArtifactId, eventEnd.Item.ArtifactId, now),
            Edge(project.Id, context.Item.ArtifactId, apiContext.Item.ArtifactId, dbContext.Item.ArtifactId, now, kind: EdgeKind.DataFlow, protocol: "SQL"),
            Edge(project.Id, container.Item.ArtifactId, apiContainer.Item.ArtifactId, dbContainer.Item.ArtifactId, now, kind: EdgeKind.Dependency, protocol: "SQL"));

        var overview = Screen(project.Id, "Bestellübersicht", "/bestellungen", "Liste der offenen Bestellungen.", now);
        var detail = Screen(project.Id, "Bestellung prüfen", "/bestellungen/:id", "Prüfung und Freigabe einer Bestellung.", now);
        var buttonId = Guid.CreateVersion7();
        detail.Item.WireframeJson = WireframeRules.Serialize(new WireframeRules.DocumentModel(1,
            new WireframeRules.Frame([
                new WireframeRules.Element(Guid.CreateVersion7().ToString(), "text", 32, 24, 420, 48, "Bestellung prüfen", null),
                new WireframeRules.Element(buttonId.ToString(), "button", 32, 96, 220, 44, "Zur Übersicht", overview.Item.ArtifactId),
            ]),
            new WireframeRules.Frame([
                new WireframeRules.Element(Guid.CreateVersion7().ToString(), "text", 16, 16, 320, 40, "Bestellung prüfen", null),
                new WireframeRules.Element(Guid.CreateVersion7().ToString(), "button", 16, 72, 200, 44, "Zur Übersicht", overview.Item.ArtifactId),
            ])));
        db.Artifacts.AddRange(overview.Artifact, detail.Artifact);
        db.Screens.AddRange(overview.Item, detail.Item);
        db.ScreenNavigations.Add(new ScreenNavigation { Id = Guid.CreateVersion7(), ProjectId = project.Id, SourceScreenId = detail.Item.ArtifactId, ElementId = buttonId.ToString(), TargetScreenId = overview.Item.ArtifactId });

        var parent = Document(project.Id, null, "Fachkonzept", DocumentKind.Page, DocumentStatus.Entwurf, DocumentRules.EmptyContent, 1, now);
        var child = Document(project.Id, parent.Item.ArtifactId, "Bestellablauf", DocumentKind.Page, DocumentStatus.Entwurf, DocumentRules.EmptyContent, 1, now);
        var decisionContent = "{\"type\":\"doc\",\"content\":["
            + "{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"Kontext\"}]},"
            + "{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Die Freigabe betrifft \"},{\"type\":\"artifactLink\",\"attrs\":{\"artifactId\":\"" + req2.Item.ArtifactId + "\",\"label\":\"REQ-002 Bestellung freigeben\"}}]},"
            + "{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"Entscheidung\"}]},"
            + "{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Die Prüfung bleibt ein eigener Prozessschritt.\"}]},"
            + "{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"Alternativen\"}]},"
            + "{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Automatische Freigabe ohne Sichtprüfung.\"}]},"
            + "{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"Konsequenzen\"}]},"
            + "{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Es braucht einen Screen und die Bestell-API.\"}]}]}";
        var adr = Document(project.Id, parent.Item.ArtifactId, "ADR-001 Freigabe im Kundenportal", DocumentKind.Decision, DocumentStatus.Vorgeschlagen, decisionContent, 2, now);
        db.Artifacts.AddRange(parent.Artifact, child.Artifact, adr.Artifact);
        db.Documents.AddRange(parent.Item, child.Item, adr.Item);
        db.DocumentRevisions.AddRange(
            new DocumentRevision { Id = Guid.CreateVersion7(), DocumentId = parent.Item.ArtifactId, ProjectId = project.Id, Number = 1, Title = parent.Item.Title, Status = parent.Item.Status, ContentJson = parent.Item.ContentJson, AuthorId = owner.Id, CreatedAt = now },
            new DocumentRevision { Id = Guid.CreateVersion7(), DocumentId = child.Item.ArtifactId, ProjectId = project.Id, Number = 1, Title = child.Item.Title, Status = child.Item.Status, ContentJson = child.Item.ContentJson, AuthorId = owner.Id, CreatedAt = now },
            new DocumentRevision { Id = Guid.CreateVersion7(), DocumentId = adr.Item.ArtifactId, ProjectId = project.Id, Number = 1, Title = adr.Item.Title, Status = adr.Item.Status, ContentJson = adr.Item.ContentJson, AuthorId = owner.Id, CreatedAt = now });

        db.ArtifactLinks.AddRange(
            Link(project.Id, accept.Item.ArtifactId, req2.Item.ArtifactId, LinkRelation.Satisfies, now),
            Link(project.Id, detail.Item.ArtifactId, req2.Item.ArtifactId, LinkRelation.Satisfies, now),
            Link(project.Id, api.Item.ArtifactId, req2.Item.ArtifactId, LinkRelation.Satisfies, now),
            Link(project.Id, accept.Item.ArtifactId, detail.Item.ArtifactId, LinkRelation.Uses, now),
            Link(project.Id, accept.Item.ArtifactId, api.Item.ArtifactId, LinkRelation.Uses, now),
            Link(project.Id, accept.Item.ArtifactId, received.Item.ArtifactId, LinkRelation.Triggers, now),
            Link(project.Id, adr.Item.ArtifactId, req2.Item.ArtifactId, LinkRelation.Documents, now));
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Demo-Projekt {Project} wurde angelegt.", project.Id);
    }

    private static async Task<AppUser> EnsureUser(UserManager<AppUser> users, string email, string name, string password)
    {
        var existing = await users.FindByEmailAsync(email.Trim());
        if (existing is not null)
        {
            return existing;
        }

        var user = new AppUser { Id = Guid.CreateVersion7(), UserName = email.Trim(), Email = email.Trim(), DisplayName = name, EmailConfirmed = true };
        var result = await users.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException("Das Demo-Konto konnte nicht angelegt werden.");
        }

        return user;
    }

    private static ProjectMembership Member(Guid projectId, Guid userId, ProjectRole role, DateTimeOffset now) =>
        new() { Id = Guid.CreateVersion7(), ProjectId = projectId, UserId = userId, Role = role, CreatedAt = now };

    private static (Artifact Artifact, Requirement Item) Requirement(Guid projectId, string key, string title, string description, RequirementStatus status, RequirementPriority priority, DateTimeOffset now)
    {
        var artifact = Artifacts.Create(projectId, ArtifactType.Requirement, now);
        var item = new Requirement
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            Key = key,
            Title = title,
            Description = description,
            Status = status,
            Priority = priority,
            CreatedAt = now,
            UpdatedAt = now,
            SearchText = SearchText.Build(key, title, description),
        };
        return (artifact, item);
    }

    private static (Artifact Artifact, Diagram Item) Diagram(Guid projectId, DiagramKind kind, string name, string description, DateTimeOffset now)
    {
        var artifact = Artifacts.Create(projectId, ArtifactType.Diagram, now);
        return (artifact, new Diagram { ArtifactId = artifact.Id, ProjectId = projectId, Kind = kind, Name = name, Description = description, CreatedAt = now, UpdatedAt = now, SearchText = SearchText.Build(name, description) });
    }

    private static (Artifact Artifact, DiagramNode Item) Node(Guid projectId, Guid diagramId, string type, string title, double x, double y, DateTimeOffset now, string? description = null, string? eventName = null)
    {
        var artifact = Artifacts.Create(projectId, ArtifactType.DiagramNode, now);
        return (artifact, new DiagramNode
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            DiagramId = diagramId,
            NodeType = type,
            Title = title,
            PositionX = x,
            PositionY = y,
            Description = description,
            EventName = eventName,
            CreatedAt = now,
            UpdatedAt = now,
            SearchText = SearchText.Build(title, description, eventName),
        });
    }

    private static (Artifact Artifact, Component Item) Component(Guid projectId, string name, string description, ComponentKind kind, string technology, DateTimeOffset now)
    {
        var artifact = Artifacts.Create(projectId, ArtifactType.Component, now);
        return (artifact, new Component { ArtifactId = artifact.Id, ProjectId = projectId, Name = name, Description = description, Kind = kind, Technology = technology, CreatedAt = now, UpdatedAt = now, SearchText = SearchText.Build(name, description, technology) });
    }

    private static (Artifact Artifact, DiagramNode Item) Placement(Guid projectId, Guid diagramId, Component component, double x, double y, DateTimeOffset now)
    {
        var artifact = Artifacts.Create(projectId, ArtifactType.DiagramNode, now);
        return (artifact, new DiagramNode
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            DiagramId = diagramId,
            NodeType = "placement",
            Title = component.Name,
            PositionX = x,
            PositionY = y,
            ComponentId = component.ArtifactId,
            CreatedAt = now,
            UpdatedAt = now,
            SearchText = SearchText.Build(component.Name, component.Technology),
        });
    }

    private static DiagramEdge Edge(Guid projectId, Guid diagramId, Guid source, Guid target, DateTimeOffset now, string? condition = null, EdgeKind kind = EdgeKind.Sequence, string? protocol = null) =>
        new() { Id = Guid.CreateVersion7(), ProjectId = projectId, DiagramId = diagramId, SourceNodeId = source, TargetNodeId = target, Kind = kind, Condition = condition, Label = condition, Protocol = protocol };

    private static (Artifact Artifact, Document Item) Document(Guid projectId, Guid? parentId, string title, DocumentKind kind, DocumentStatus status, string content, int sort, DateTimeOffset now)
    {
        var artifact = Artifacts.Create(projectId, ArtifactType.Document, now);
        return (artifact, new Document
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            ParentId = parentId,
            Title = title,
            Kind = kind,
            Status = status,
            ContentJson = content,
            SortOrder = sort,
            CreatedAt = now,
            UpdatedAt = now,
            SearchText = SearchText.Build(title, TipTapRules.PlainText(content)),
        });
    }

    private static (Artifact Artifact, Screen Item) Screen(Guid projectId, string name, string route, string purpose, DateTimeOffset now)
    {
        var artifact = Artifacts.Create(projectId, ArtifactType.Screen, now);
        return (artifact, new Screen
        {
            ArtifactId = artifact.Id,
            ProjectId = projectId,
            Name = name,
            Route = route,
            Purpose = purpose,
            WireframeJson = WireframeRules.Serialize(WireframeRules.Empty()),
            CreatedAt = now,
            UpdatedAt = now,
            SearchText = SearchText.Build(name, route, purpose),
        });
    }

    private static ArtifactLink Link(Guid projectId, Guid source, Guid target, LinkRelation relation, DateTimeOffset now) =>
        new() { Id = Guid.CreateVersion7(), ProjectId = projectId, SourceArtifactId = source, TargetArtifactId = target, Relation = relation, CreatedAt = now };
}
