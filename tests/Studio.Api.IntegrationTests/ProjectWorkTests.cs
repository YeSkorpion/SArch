using System.Net;
using System.Text.Json;

namespace Studio.Api.IntegrationTests;

[Collection("db")]
public sealed class ProjectWorkTests(PostgresFixture fixture) : IAsyncLifetime
{
    private ApiClient _api = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _api = new ApiClient(fixture.Factory);
        await _api.Boot();
    }

    public Task DisposeAsync()
    {
        _api.Http.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Coverage_keeps_a_missing_screen_and_ignores_an_indirect_path()
    {
        var owner = await Person("coverage-owner@example.com");
        var projectId = await Project("Auftragsplanung");
        var area = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/areas", new { name = "Aufträge" });
        var areaId = area.GetProperty("id").GetGuid();
        var visible = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Auftrag anzeigen", areaId });
        var hidden = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Auftrag speichern", areaId });
        var visibleId = visible.GetProperty("id").GetGuid();
        var hiddenId = hidden.GetProperty("id").GetGuid();
        var step = await Process(projectId, areaId, "Auftrag bis zum Archiv", "Auftrag öffnen");
        var component = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/components", new { name = "Auftragsdienst", kind = "Service" });
        var screen = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/screens", new { name = "Nebenbei", route = "/nebenbei" });
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = step.NodeId, targetId = visibleId, relation = "Satisfies" })).Status);
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = component.GetProperty("id").GetGuid(), targetId = visibleId, relation = "Satisfies" })).Status);
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = step.NodeId, targetId = screen.GetProperty("id").GetGuid(), relation = "Uses" })).Status);
        Assert.Equal(HttpStatusCode.NoContent, (await CallRaw(HttpMethod.Put, $"/api/v1/projects/{projectId}/requirements/{hiddenId}/coverage/screen", new { reason = "Reiner Backend-Ablauf" })).Status);

        var filtered = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/coverage?bereich={areaId}&fehlt=screen");
        var items = filtered.GetProperty("items").EnumerateArray().ToArray();
        Assert.Single(items);
        Assert.Equal(visibleId, items[0].GetProperty("id").GetGuid());
        Assert.Equal("Fehlt", items[0].GetProperty("screen").GetProperty("state").GetString());
        Assert.Equal("Zugeordnet", items[0].GetProperty("process").GetProperty("state").GetString());
        Assert.Equal(step.NodeId, items[0].GetProperty("process").GetProperty("direct")[0].GetProperty("id").GetGuid());
        Assert.Equal(step.DiagramId, items[0].GetProperty("process").GetProperty("direct")[0].GetProperty("diagramId").GetGuid());
        Assert.Contains(items[0].GetProperty("screen").GetProperty("indirect").EnumerateArray(), item => item.GetProperty("path").GetString() == "Anforderung → Prozessschritt → Screen");
        var all = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/coverage?bereich={areaId}");
        var backend = all.GetProperty("items").EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == hiddenId);
        Assert.Equal("NichtErforderlich", backend.GetProperty("screen").GetProperty("state").GetString());
        Assert.False(backend.GetProperty("screen").GetProperty("waiver").GetProperty("superseded").GetBoolean());
        _ = owner;
    }

    [Fact]
    public async Task Changed_source_returns_to_review_and_strangers_cannot_read_the_flow()
    {
        await Person("source-owner@example.com");
        var projectId = await Project("Quellen");
        var step = await Process(projectId, null, "Auftrag bis zum Archiv", "Archivieren");
        var created = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/artifacts/{step.DiagramId}/sources", new { kind = "Code", title = "Archivpfad", target = "src/orders/archive.ts" });
        var sourceId = created.GetProperty("id").GetGuid();
        var ticket = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/artifacts/{step.DiagramId}/sources", new { kind = "Ticket", title = "ARCH-4", target = "https://tickets.example/ARCH-4" });
        Assert.Equal("Ungeprueft", ticket.GetProperty("state").GetString());
        var checkedSource = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/sources/{sourceId}/check", new { reference = "abc123" });
        Assert.Equal("Geprueft", checkedSource.GetProperty("state").GetString());
        var changed = await Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/sources/{sourceId}", new { kind = "Code", title = "Archivpfad", target = "src/orders/archive-v2.ts" });
        Assert.Equal("ErneutPruefen", changed.GetProperty("state").GetString());

        var stranger = await Person("source-stranger@example.com");
        var hidden = await stranger.Client.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams/{step.DiagramId}/flow");
        Assert.Equal(HttpStatusCode.NotFound, hidden.Status);
        var sources = await stranger.Client.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{step.DiagramId}/sources");
        Assert.Equal(HttpStatusCode.NotFound, sources.Status);
    }

    [Fact]
    public async Task Flow_keeps_its_entry_and_catalog_links_a_foreign_key()
    {
        await Person("flow-owner@example.com");
        var projectId = await Project("Ablauf");
        var detail = await Screen(projectId, "Auftragsdetail", "/auftraege/1", null);
        var list = await Screen(projectId, "Auftragsliste", "/auftraege", detail);
        var open = await Process(projectId, null, "Auftrag bis zur Freigabe", "Auftrag öffnen");
        var inspect = await AddStep(projectId, open, "Detail prüfen");
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = open.NodeId, targetId = list, relation = "Uses" })).Status);
        Assert.Equal(HttpStatusCode.Created, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = inspect, targetId = detail, relation = "Uses" })).Status);
        Assert.Equal(HttpStatusCode.NoContent, (await CallRaw(HttpMethod.Put, $"/api/v1/projects/{projectId}/diagrams/{open.DiagramId}/flow", new { nodeId = open.NodeId, screenId = list })).Status);
        var flow = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams/{open.DiagramId}/flow");
        Assert.True(flow.GetProperty("ready").GetBoolean());
        Assert.Equal(list, flow.GetProperty("entryScreenId").GetGuid());
        Assert.Equal("Auftrag öffnen", flow.GetProperty("entryStepTitle").GetString());
        var detailScreen = flow.GetProperty("screens").EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == detail);
        Assert.Contains("\"targetScreenId\": null", detailScreen.GetProperty("wireframeJson").GetString(), StringComparison.Ordinal);

        var orders = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "orders", kind = "Page" });
        var lines = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "order_lines", kind = "Page" });
        var orderTable = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/catalog", new { name = "orders", purpose = "Aufträge", documentId = orders.GetProperty("id").GetGuid() });
        var lineTable = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/catalog", new { name = "order_lines", purpose = "", documentId = lines.GetProperty("id").GetGuid() });
        var withKey = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/catalog/{lineTable.GetProperty("id").GetGuid()}/columns", new { name = "order_id", isPrimaryKey = false, foreignTableId = orderTable.GetProperty("id").GetGuid(), notes = "" });
        var column = withKey.GetProperty("columns").EnumerateArray().Single();
        Assert.Equal("orders", column.GetProperty("foreignTableName").GetString());
        var found = await Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/catalog?q=order_id");
        Assert.Contains(found.EnumerateArray(), item => item.GetProperty("name").GetString() == "order_lines");
        Assert.Equal("", found.EnumerateArray().Single(item => item.GetProperty("name").GetString() == "order_lines").GetProperty("purpose").GetString());
    }

    [Fact]
    public async Task Reviewer_loses_the_task_after_approval()
    {
        var owner = await Person("work-owner@example.com");
        var reviewer = await Person("work-reviewer@example.com");
        _api = owner.Client;
        var projectId = await Project("Prüfung");
        Assert.Equal(HttpStatusCode.OK, (await CallRaw(HttpMethod.Post, $"/api/v1/projects/{projectId}/members", new { email = "work-reviewer@example.com", role = "Editor" })).Status);
        var requirement = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Sichtbar" });
        var package = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages", new { title = "Auftragsliste", goal = "Liste prüfen.", ownerId = owner.Id, reviewerId = reviewer.Id });
        var version = (await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{package.GetProperty("id").GetGuid()}/items", new { version = package.GetProperty("version").GetInt32(), artifactId = requirement.GetProperty("id").GetGuid(), note = "Prüfen" })).GetProperty("version").GetInt32();
        var submitted = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{package.GetProperty("id").GetGuid()}/submit", new { version });
        var before = await reviewer.Client.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/work");
        Assert.Contains(before.Body.GetProperty("review").EnumerateArray(), item => item.GetProperty("title").GetString() == "Auftragsliste" && item.GetProperty("href").GetString()!.Contains(package.GetProperty("id").GetGuid().ToString()));
        var approved = await reviewer.Client.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/packages/{package.GetProperty("id").GetGuid()}/approve", new { version = submitted.GetProperty("version").GetInt32() });
        Assert.Equal(HttpStatusCode.OK, approved.Status);
        var after = await reviewer.Client.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/work");
        Assert.Empty(after.Body.GetProperty("review").EnumerateArray());
    }

    private async Task<(ApiClient Client, Guid Id)> Person(string email)
    {
        var client = new ApiClient(fixture.Factory);
        await client.Boot();
        var registered = await client.Call(HttpMethod.Post, "/api/v1/auth/register", new { email, password = "Planung-Test-1", displayName = email });
        Assert.Equal(HttpStatusCode.OK, registered.Status);
        client.Token = registered.Body.GetProperty("token").GetString() ?? client.Token;
        var loggedIn = await client.Call(HttpMethod.Post, "/api/v1/auth/login", new { email, password = "Planung-Test-1" });
        client.Token = loggedIn.Body.GetProperty("token").GetString() ?? client.Token;
        _api = client;
        return (client, loggedIn.Body.GetProperty("id").GetGuid());
    }

    private async Task<Guid> Project(string name) =>
        (await Call(HttpMethod.Post, "/api/v1/projects", new { name })).GetProperty("id").GetGuid();

    private async Task<JsonElement> Call(HttpMethod method, string url, object? body = null)
    {
        var response = await CallRaw(method, url, body);
        Assert.True(response.Status is HttpStatusCode.OK or HttpStatusCode.Created or HttpStatusCode.NoContent, response.Body.ToString());
        return response.Body;
    }

    private Task<(HttpStatusCode Status, JsonElement Body)> CallRaw(HttpMethod method, string url, object? body = null) =>
        _api.Call(method, url, body);

    private async Task<Guid> Screen(Guid projectId, string name, string route, Guid? target)
    {
        var created = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/screens", new { name, route });
        var id = created.GetProperty("id").GetGuid();
        var targetJson = target is null ? "" : $",\"targetScreenId\":\"{target}\"";
        var button = $"{{\"id\":\"{Guid.NewGuid()}\",\"type\":\"button\",\"x\":8,\"y\":8,\"width\":120,\"height\":40,\"text\":\"Weiter\"{targetJson}}}";
        var json = "{\"version\":1,\"desktop\":{\"elements\":[" + button + "]},\"mobile\":{\"elements\":[]}}";
        await Call(HttpMethod.Put, $"/api/v1/projects/{projectId}/screens/{id}", new { version = created.GetProperty("version").GetInt32(), name, route, purpose = "", status = "Entwurf", notes = "", wireframeJson = json });
        return id;
    }

    private async Task<Guid> AddStep(Guid projectId, Flow flow, string title)
    {
        var stepId = Guid.NewGuid();
        var saved = await CallRaw(HttpMethod.Put, $"/api/v1/projects/{projectId}/diagrams/{flow.DiagramId}", new
        {
            version = flow.Version,
            name = flow.Name,
            areaId = flow.AreaId,
            nodes = new object[]
            {
                new { id = flow.StartId, nodeType = "start", title = "Start", x = 0, y = 0, description = "", eventName = "" },
                new { id = flow.NodeId, nodeType = "action", title = flow.StepTitle, x = 10, y = 20, description = "", eventName = "" },
                new { id = stepId, nodeType = "action", title, x = 30, y = 30, description = "", eventName = "" },
                new { id = flow.EndId, nodeType = "end", title = "Ende", x = 40, y = 40, description = "", eventName = "" },
            },
            edges = new object[]
            {
                new { id = flow.EdgeA, kind = "Sequence", sourceId = flow.StartId, targetId = flow.NodeId, label = "", condition = "", protocol = "" },
                new { id = Guid.NewGuid(), kind = "Sequence", sourceId = flow.NodeId, targetId = stepId, label = "", condition = "", protocol = "" },
                new { id = flow.EdgeB, kind = "Sequence", sourceId = stepId, targetId = flow.EndId, label = "", condition = "", protocol = "" },
            },
        });
        Assert.Equal(HttpStatusCode.OK, saved.Status);
        return stepId;
    }

    private async Task<Flow> Process(Guid projectId, Guid? areaId, string name, string title)
    {
        var diagram = await Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name, kind = "Process", areaId });
        var flow = new Flow(diagram.GetProperty("id").GetGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), diagram.GetProperty("version").GetInt32(), name, title, areaId);
        var saved = await CallRaw(HttpMethod.Put, $"/api/v1/projects/{projectId}/diagrams/{flow.DiagramId}", new
        {
            version = flow.Version,
            name,
            areaId,
            nodes = new[]
            {
                new { id = flow.StartId, nodeType = "start", title = "Start", x = 0, y = 0, description = "", eventName = "" },
                new { id = flow.NodeId, nodeType = "action", title, x = 10, y = 20, description = "", eventName = "" },
                new { id = flow.EndId, nodeType = "end", title = "Ende", x = 40, y = 40, description = "", eventName = "" },
            },
            edges = new[]
            {
                new { id = flow.EdgeA, kind = "Sequence", sourceId = flow.StartId, targetId = flow.NodeId, label = "", condition = "", protocol = "" },
                new { id = flow.EdgeB, kind = "Sequence", sourceId = flow.NodeId, targetId = flow.EndId, label = "", condition = "", protocol = "" },
            },
        });
        Assert.Equal(HttpStatusCode.OK, saved.Status);
        return flow with { Version = saved.Body.GetProperty("version").GetInt32() };
    }

    private sealed record Flow(Guid DiagramId, Guid NodeId, Guid StartId, Guid EndId, Guid EdgeA, Guid EdgeB, int Version, string Name, string StepTitle, Guid? AreaId);
}
