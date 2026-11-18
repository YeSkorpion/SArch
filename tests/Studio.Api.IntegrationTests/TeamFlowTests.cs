using System.Net;
using System.Text.Json;

namespace Studio.Api.IntegrationTests;

[Collection("db")]
public sealed class TeamFlowTests(PostgresFixture fixture) : IAsyncLifetime
{
    private ApiClient _api = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _api = new ApiClient(fixture.Factory);
        await _api.Boot();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Usage_finds_shared_component_paths_and_stops_cycles()
    {
        var owner = await Person("usage-owner@example.com");
        var projectId = await Project("Gastportal");
        var area = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/areas", new { name = "Zugang" });
        var other = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/areas", new { name = "Versand" });
        var areaId = area.GetProperty("id").GetGuid();
        var component = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/components", new { name = "Berechtigungsdienst", kind = "Service" });
        var componentId = component.GetProperty("id").GetGuid();
        var screen = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/screens", new { name = "Annahmeseite", route = "/einladung" });
        var screenId = screen.GetProperty("id").GetGuid();
        var accept = await Process(projectId, areaId, "Einladung annehmen", "Annehmen");
        var review = await Process(projectId, areaId, "Einladung prüfen", "Prüfen");
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = accept.NodeId, targetId = componentId, relation = "Uses" })).Status);
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = review.NodeId, targetId = componentId, relation = "Uses" })).Status);
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = accept.NodeId, targetId = screenId, relation = "Uses" })).Status);
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = review.NodeId, targetId = screenId, relation = "Uses" })).Status);
        var decision = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "Gast bleibt Gast", kind = "Decision" });
        var decisionId = decision.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = decisionId, targetId = componentId, relation = "Documents" })).Status);

        var usage = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{componentId}/usage");
        var usedBy = usage.GetProperty("usedBy").EnumerateArray().Select(item => item.GetProperty("artifactId").GetGuid()).ToArray();
        Assert.Contains(accept.NodeId, usedBy);
        Assert.Contains(review.NodeId, usedBy);
        Assert.Contains(decisionId, usedBy);
        Assert.Equal(usedBy.Length, usedBy.Distinct().Count());
        var expanded = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{accept.NodeId}/usage?via={componentId}");
        Assert.Contains(expanded.GetProperty("uses").EnumerateArray(), item => item.GetProperty("artifactId").GetGuid() == screenId && item.GetProperty("relationLabel").GetString() == "verwendet");
        var screenUsage = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{screenId}/usage");
        Assert.Equal(2, screenUsage.GetProperty("usedBy").GetArrayLength());
        var filtered = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{componentId}/usage?type=node&area={areaId}");
        Assert.Equal(2, filtered.GetProperty("usedBy").GetArrayLength());
        var otherArea = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{componentId}/usage?area={other.GetProperty("id").GetGuid()}");
        Assert.Equal(0, otherArea.GetProperty("usedBy").GetArrayLength());

        var left = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "Seite A", kind = "Page" });
        var right = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "Seite B", kind = "Page" });
        var leftId = left.GetProperty("id").GetGuid();
        var rightId = right.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = leftId, targetId = rightId, relation = "Documents" })).Status);
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = rightId, targetId = leftId, relation = "Documents" })).Status);
        var cycled = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{rightId}/usage?via={leftId}");
        Assert.Contains(cycled.GetProperty("usedBy").EnumerateArray().Concat(cycled.GetProperty("uses").EnumerateArray()), item => item.GetProperty("artifactId").GetGuid() == leftId && item.GetProperty("cycle").GetBoolean());

        var stranger = await Person("usage-stranger@example.com");
        var hidden = await stranger.Client.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{componentId}/usage");
        Assert.Equal(HttpStatusCode.NotFound, hidden.Status);
        _ = owner;
    }

    [Fact]
    public async Task Package_review_keeps_comments_and_rejects_stale_or_viewer_approval()
    {
        var owner = await Person("package-owner@example.com");
        var reviewer = await Person("package-reviewer@example.com");
        var viewer = await Person("package-viewer@example.com");
        _api = owner.Client;
        var projectId = await Project("Gastzugriff");
        Assert.Equal(HttpStatusCode.OK, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/members", new { email = "package-reviewer@example.com", role = "Editor" })).Status);
        Assert.Equal(HttpStatusCode.OK, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/members", new { email = "package-viewer@example.com", role = "Viewer" })).Status);
        var requirement = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Gast kann eingeladen werden", description = "Die Einladung ist einmalig gültig." });
        var requirementId = requirement.GetProperty("id").GetGuid();
        var screen = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/screens", new { name = "Annahmeseite", route = "/einladung" });
        var decision = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "Gast bleibt Gast", kind = "Decision" });
        var step = await Process(projectId, null, "Einladung annehmen", "Annehmen");
        var package = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages", new { title = "Gastzugriff einführen", goal = "Gäste nehmen eine Einladung an.", ownerId = owner.Id, reviewerId = reviewer.Id });
        var packageId = package.GetProperty("id").GetGuid();
        var version = package.GetProperty("version").GetInt32();
        version = (await Add(projectId, packageId, version, requirementId, "Entscheidung prüfen")).GetProperty("version").GetInt32();
        version = (await Add(projectId, packageId, version, step.NodeId, "Ablauf anpassen")).GetProperty("version").GetInt32();
        version = (await Add(projectId, packageId, version, screen.GetProperty("id").GetGuid(), "Screen ergänzen")).GetProperty("version").GetInt32();
        version = (await Add(projectId, packageId, version, decision.GetProperty("id").GetGuid(), "Entscheidung prüfen")).GetProperty("version").GetInt32();
        var conflict = await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/items", new { version = 1, artifactId = requirementId, note = "erneut" });
        Assert.Equal(HttpStatusCode.Conflict, conflict.Status);
        Assert.Equal("version_conflict", conflict.Body.GetProperty("code").GetString());

        var submitted = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/submit", new { version });
        Assert.Equal("InPruefung", submitted.GetProperty("status").GetString());
        var reviewId = submitted.GetProperty("reviewSnapshotId").GetGuid();
        var viewerAttempt = await viewer.Client.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/approve", new { version = submitted.GetProperty("version").GetInt32() });
        Assert.Equal(HttpStatusCode.Forbidden, viewerAttempt.Status);
        var commented = await reviewer.Client.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/comments", new { version = submitted.GetProperty("version").GetInt32(), text = "Der Schritt braucht die Ablehnung.", artifactId = step.NodeId });
        Assert.Equal(HttpStatusCode.OK, commented.Status);
        var requested = await reviewer.Client.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/request-changes", new { version = commented.Body.GetProperty("version").GetInt32(), reason = "Ablehnung fehlt." });
        Assert.Equal(HttpStatusCode.OK, requested.Status);
        Assert.Equal("Entwurf", requested.Body.GetProperty("status").GetString());
        var removed = await CallRaw(HttpMethod.Put, $"/api/v1/projects/{projectId}/diagrams/{step.DiagramId}", new
        {
            version = step.Version,
            name = step.Name,
            nodes = new[]
            {
                new { id = step.StartId, nodeType = "start", title = "Start", x = 0, y = 0, description = "", eventName = "" },
                new { id = step.EndId, nodeType = "end", title = "Ende", x = 40, y = 40, description = "", eventName = "" },
            },
            edges = new[]
            {
                new { id = Guid.NewGuid(), kind = "Sequence", sourceId = step.StartId, targetId = step.EndId, label = "", condition = "", protocol = "" },
            },
        });
        Assert.Equal(HttpStatusCode.OK, removed.Status);
        var afterDelete = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/packages/{packageId}");
        Assert.Contains(afterDelete.GetProperty("comments").EnumerateArray(), item => item.GetProperty("text").GetString() == "Der Schritt braucht die Ablehnung." && item.GetProperty("missing").GetBoolean());

        var edited = await Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/requirements/{requirementId}", new { version = requirement.GetProperty("version").GetInt32(), title = "Gast kann eingeladen werden", description = "Die Einladung läuft nach einem Tag ab.", status = "Offen", priority = "Mittel" });
        var resubmitted = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/submit", new { version = afterDelete.GetProperty("version").GetInt32() });
        Assert.NotEqual(reviewId, resubmitted.GetProperty("reviewSnapshotId").GetGuid());
        var changedAgain = await Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/requirements/{requirementId}", new { version = edited.GetProperty("version").GetInt32(), title = "Gast kann eingeladen werden", description = "Die Einladung läuft nach zwei Tagen ab.", status = "Offen", priority = "Mittel" });
        var stale = await reviewer.Client.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/approve", new { version = resubmitted.GetProperty("version").GetInt32() });
        Assert.Equal(HttpStatusCode.Conflict, stale.Status);
        Assert.Equal("stale_review", stale.Body.GetProperty("code").GetString());
        var current = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/packages/{packageId}");
        var again = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/submit", new { version = current.GetProperty("version").GetInt32() });
        var approved = await reviewer.Client.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/approve", new { version = again.GetProperty("version").GetInt32() });
        Assert.Equal(HttpStatusCode.OK, approved.Status);
        Assert.Equal("Freigegeben", approved.Body.GetProperty("status").GetString());
        var handover = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/packages/{packageId}/handover");
        var markdown = handover.GetProperty("markdown").GetString() ?? "";
        Assert.Contains("Gast kann eingeladen werden", markdown, StringComparison.Ordinal);
        Assert.Contains("Gast bleibt Gast", markdown, StringComparison.Ordinal);
        Assert.Contains("Fassung", markdown, StringComparison.Ordinal);
        await Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/requirements/{requirementId}", new { version = changedAgain.GetProperty("version").GetInt32(), title = "Geändert nach Freigabe", description = "Später", status = "Offen", priority = "Mittel" });
        var stable = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/packages/{packageId}/handover");
        Assert.Equal(markdown, stable.GetProperty("markdown").GetString());
        var historic = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/snapshots/{approved.Body.GetProperty("approvedSnapshotId").GetGuid()}");
        Assert.Contains(historic.GetProperty("document").GetProperty("artifacts").EnumerateArray(), item => (item.GetProperty("title").GetString() ?? "").Contains("Gast kann eingeladen werden", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Snapshot_compare_shows_added_changed_removed_and_position()
    {
        await Person("snapshot-owner@example.com");
        var projectId = await Project("Vergleich");
        var screen = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/screens", new { name = "Start", route = "/" });
        var screenId = screen.GetProperty("id").GetGuid();
        var requirement = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Bestehend" });
        var diagram = await Process(projectId, null, "Ablauf", "Schritt");
        var link = await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = diagram.NodeId, targetId = screenId, relation = "Uses" });
        var linkId = link.Body.GetProperty("id").GetGuid();
        var before = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/snapshots", new { name = "Vorher" });
        await Call(HttpMethod.Put, $"/api/v1/projects/{projectId}/screens/{screenId}", new { version = screen.GetProperty("version").GetInt32(), name = "Start neu", route = "/", purpose = "", status = "Entwurf", notes = "", wireframeJson = screen.GetProperty("wireframeJson").GetString() });
        Assert.Equal(HttpStatusCode.NoContent, (await CallRaw(HttpMethod.Delete, $"/api/v1/projects/{projectId}/links/{linkId}")).Status);
        await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Neu" });
        await Save(diagram, projectId, 80, 20);
        var after = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/snapshots", new { name = "Nachher" });
        var compare = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/snapshot-compare?left={before.GetProperty("id").GetGuid()}&right={after.GetProperty("id").GetGuid()}");
        var changes = compare.GetProperty("changes").EnumerateArray().ToArray();
        Assert.Contains(changes, item => item.GetProperty("change").GetString() == "added" && (item.GetProperty("title").GetString() ?? "").Contains("Neu", StringComparison.Ordinal));
        Assert.Contains(changes, item => item.GetProperty("change").GetString() == "changed" && item.GetProperty("id").GetGuid() == screenId && item.GetProperty("fields").EnumerateArray().Any(field => field.GetString() == "Titel"));
        Assert.Contains(changes, item => item.GetProperty("change").GetString() == "removed" && item.GetProperty("type").GetString() == "link" && item.GetProperty("id").GetGuid() == linkId);
        Assert.Contains(changes, item => item.GetProperty("change").GetString() == "position" && item.GetProperty("id").GetGuid() == diagram.NodeId);
        var old = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/snapshots/{before.GetProperty("id").GetGuid()}");
        Assert.Contains(old.GetProperty("document").GetProperty("artifacts").EnumerateArray(), item => item.GetProperty("id").GetGuid() == screenId && item.GetProperty("title").GetString() == "Start");
        var stranger = await Person("snapshot-stranger@example.com");
        var hidden = await stranger.Client.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/snapshots/{before.GetProperty("id").GetGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, hidden.Status);
        _ = requirement;
    }

    [Fact]
    public async Task Export_import_copies_the_project_and_rejects_invalid_files()
    {
        await Person("transfer-owner@example.com");
        var projectId = await Project("Transfer");
        var requirement = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Übernommen" });
        var screen = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/screens", new { name = "Seite", route = "/seite" });
        var diagram = await Process(projectId, null, "Übernahme", "Schritt");
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = diagram.NodeId, targetId = screen.GetProperty("id").GetGuid(), relation = "Uses" })).Status);
        var document = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "Konzept", kind = "Page" });
        await Call(HttpMethod.Put, $"/api/v1/projects/{projectId}/documents/{document.GetProperty("id").GetGuid()}", new { version = document.GetProperty("version").GetInt32(), title = "Konzept", status = "Entwurf", contentJson = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Stand\"}]}]}" });
        var package = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages", new { title = "Übernahme", goal = "Daten mitnehmen.", ownerId = (await Call(HttpMethod.Get, "/api/v1/auth/me")).GetProperty("id").GetGuid(), reviewerId = (Guid?)null });
        var withItem = await Add(projectId, package.GetProperty("id").GetGuid(), package.GetProperty("version").GetInt32(), requirement.GetProperty("id").GetGuid(), "Entscheidung prüfen");
        await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{package.GetProperty("id").GetGuid()}/submit", new { version = withItem.GetProperty("version").GetInt32() });
        await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/snapshots", new { name = "Ausgang" });
        var exported = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/export");
        var before = await Call(HttpMethod.Get, "/api/v1/projects");
        var invalid = await CallRaw(HttpMethod.Post, "/api/v1/projects/import", new { format = "anders", version = 1, project = new { name = "Kaputt" } });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.Status);
        var afterInvalid = await Call(HttpMethod.Get, "/api/v1/projects");
        Assert.Equal(before.GetArrayLength(), afterInvalid.GetArrayLength());
        var imported = await Call(HttpMethod.Post, "/api/v1/projects/import", exported);
        var importedId = imported.GetProperty("id").GetGuid();
        Assert.NotEqual(projectId, importedId);
        var diagrams = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/diagrams");
        var diagramId = diagrams.EnumerateArray().Single(item => item.GetProperty("name").GetString() == "Übernahme").GetProperty("id").GetGuid();
        var opened = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/diagrams/{diagramId}");
        Assert.Contains(opened.GetProperty("nodes").EnumerateArray(), item => item.GetProperty("title").GetString() == "Schritt");
        var documents = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/documents");
        var documentId = documents.EnumerateArray().Single(item => item.GetProperty("title").GetString() == "Konzept").GetProperty("id").GetGuid();
        var revisions = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/documents/{documentId}/revisions");
        Assert.True(revisions.GetArrayLength() > 0);
        var packages = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/packages");
        var packageId = packages.EnumerateArray().Single().GetProperty("id").GetGuid();
        var detail = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/packages/{packageId}");
        var snapshotId = detail.GetProperty("reviewSnapshotId").GetGuid();
        var snapshot = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/snapshots/{snapshotId}");
        Assert.Contains(snapshot.GetProperty("document").GetProperty("artifacts").EnumerateArray(), item => (item.GetProperty("title").GetString() ?? "").Contains("Übernommen", StringComparison.Ordinal));
        var nodeId = opened.GetProperty("nodes").EnumerateArray().First(item => item.GetProperty("title").GetString() == "Schritt").GetProperty("id").GetGuid();
        var links = await Call(HttpMethod.Get, $"/api/v1/projects/{importedId}/artifacts/{nodeId}/links");
        Assert.Contains(links.EnumerateArray(), item => item.GetProperty("direction").GetString() == "outgoing" && item.GetProperty("relation").GetString() == "Uses");
    }

    private async Task<(ApiClient Client, Guid Id)> Person(string email)
    {
        var client = new ApiClient(fixture.Factory);
        await client.Boot();
        var registered = await client.Call(HttpMethod.Post, "/api/v1/auth/register", new { displayName = "Testperson", email, password = "Planung-Test-1" });
        Assert.Equal(HttpStatusCode.OK, registered.Status);
        client.Token = registered.Body.GetProperty("token").GetString() ?? client.Token;
        var loggedIn = await client.Call(HttpMethod.Post, "/api/v1/auth/login", new { email, password = "Planung-Test-1" });
        Assert.Equal(HttpStatusCode.OK, loggedIn.Status);
        client.Token = loggedIn.Body.GetProperty("token").GetString() ?? client.Token;
        _api = client;
        return (client, loggedIn.Body.GetProperty("id").GetGuid());
    }

    private async Task<Guid> Project(string name)
    {
        var response = await Call(HttpMethod.Post, "/api/v1/projects", new { name });
        return response.GetProperty("id").GetGuid();
    }

    private async Task<JsonElement> Call(HttpMethod method, string url, object? body = null)
    {
        var response = await CallRaw(method, url, body);
        Assert.True(response.Status is HttpStatusCode.OK or HttpStatusCode.Created, response.Body.ToString());
        return response.Body;
    }

    private Task<(HttpStatusCode Status, JsonElement Body)> CallRaw(HttpMethod method, string url, object? body = null) =>
        _api.Call(method, url, body);

    private async Task<JsonElement> Add(Guid projectId, Guid packageId, int version, Guid artifactId, string note)
    {
        var response = await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{packageId}/items", new { version, artifactId, note });
        Assert.Equal(HttpStatusCode.OK, response.Status);
        return response.Body;
    }

    private async Task<Flow> Process(Guid projectId, Guid? areaId, string name, string title)
    {
        var diagram = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name, kind = "Process", areaId });
        var flow = new Flow(diagram.GetProperty("id").GetGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), diagram.GetProperty("version").GetInt32(), name, title, areaId);
        var saved = await Save(flow, projectId, 10, 20);
        return flow with { Version = saved };
    }

    private async Task<int> Save(Flow diagram, Guid projectId, int x, int y)
    {
        var saved = await CallRaw(HttpMethod.Put, $"/api/v1/projects/{projectId}/diagrams/{diagram.DiagramId}", new
        {
            version = diagram.Version,
            name = diagram.Name,
            areaId = diagram.AreaId,
            nodes = new[]
            {
                new { id = diagram.StartId, nodeType = "start", title = "Start", x = 0, y = 0, description = "", eventName = "" },
                new { id = diagram.NodeId, nodeType = "action", title = diagram.StepTitle, x, y, description = "", eventName = "" },
                new { id = diagram.EndId, nodeType = "end", title = "Ende", x = 40, y = 40, description = "", eventName = "" },
            },
            edges = new[]
            {
                new { id = diagram.EdgeA, kind = "Sequence", sourceId = diagram.StartId, targetId = diagram.NodeId, label = "", condition = "", protocol = "" },
                new { id = diagram.EdgeB, kind = "Sequence", sourceId = diagram.NodeId, targetId = diagram.EndId, label = "", condition = "", protocol = "" },
            },
        });
        Assert.Equal(HttpStatusCode.OK, saved.Status);
        return saved.Body.GetProperty("version").GetInt32();
    }

    private sealed record Flow(Guid DiagramId, Guid NodeId, Guid StartId, Guid EndId, Guid EdgeA, Guid EdgeB, int Version, string Name, string StepTitle, Guid? AreaId);
}
