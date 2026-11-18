using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Respawn;
using Respawn.Graph;
using Studio.Api.Data;

namespace Studio.Api.IntegrationTests;

[CollectionDefinition("db")]
public sealed class DbCollection : ICollectionFixture<PostgresFixture>;

public sealed class PostgresFixture : IAsyncLifetime
{
    private Respawner? _respawner;
    public StudioFactory Factory { get; private set; } = null!;
    public string ConnectionString { get; private set; } = "";

    public async Task InitializeAsync()
    {
        var env = Environment.GetEnvironmentVariable("STUDIO_TEST_CONNECTION");
        ConnectionString = string.IsNullOrWhiteSpace(env)
            ? "Host=127.0.0.1;Port=54329;Database=studio_test;Username=studio"
            : env;
        if (string.IsNullOrWhiteSpace(env))
        {
            await EnsureDatabase();
        }

        Factory = new StudioFactory(ConnectionString);
        _ = Factory.CreateClient();
        await using var scope = Factory.Services.CreateAsyncScope();
        await using var connection = scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.GetDbConnection();
        await connection.OpenAsync();
        _respawner = await Respawner.CreateAsync(connection, new RespawnerOptions
        {
            DbAdapter = DbAdapter.Postgres,
            SchemasToInclude = ["public"],
            TablesToIgnore = [new Table("__ef_migrations_history")],
        });
    }

    public async Task ResetAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        await using var connection = scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.GetDbConnection();
        await connection.OpenAsync();
        await _respawner!.ResetAsync(connection);
    }

    public Task DisposeAsync()
    {
        Factory.Dispose();
        return Task.CompletedTask;
    }

    private static async Task EnsureDatabase()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=54329;Database=postgres;Username=studio")
            .Options;
        await using var db = new AppDbContext(options);
        var connection = db.Database.GetDbConnection();
        await connection.OpenAsync();
        await using var check = connection.CreateCommand();
        check.CommandText = "SELECT 1 FROM pg_database WHERE datname = 'studio_test'";
        if (await check.ExecuteScalarAsync() is not null)
        {
            return;
        }

        await using var create = connection.CreateCommand();
        create.CommandText = "CREATE DATABASE studio_test";
        await create.ExecuteNonQueryAsync();
    }
}

public sealed class StudioFactory(string connection) : WebApplicationFactory<Program>
{
    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureHostConfiguration(config =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Database"] = connection,
                ["Studio:ApplyMigrations"] = "true",
                ["Studio:SeedDemo"] = "false",
                ["Studio:LoginPermitLimit"] = "1000",
            });
        });
        return base.CreateHost(builder);
    }
}

public sealed class ApiClient
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public HttpClient Http { get; }
    public string Token { get; set; } = "";

    public ApiClient(StudioFactory factory)
    {
        Http = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            BaseAddress = new Uri("http://localhost"),
        });
    }

    public async Task Boot()
    {
        var response = await Http.GetAsync("/api/v1/auth/csrf");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Token = body.GetProperty("token").GetString() ?? "";
    }

    public async Task<HttpResponseMessage> Send(HttpMethod method, string url, object? body = null, bool csrf = true)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, options: Json);
        }

        if (csrf && method != HttpMethod.Get)
        {
            request.Headers.Add("X-CSRF-TOKEN", Token);
        }

        return await Http.SendAsync(request);
    }

    public async Task<(HttpStatusCode Status, JsonElement Body)> Call(HttpMethod method, string url, object? body = null, bool csrf = true)
    {
        var response = await Send(method, url, body, csrf);
        var text = await response.Content.ReadAsStringAsync();
        var json = string.IsNullOrWhiteSpace(text) ? JsonDocument.Parse("{}").RootElement : JsonDocument.Parse(text).RootElement;
        return (response.StatusCode, json.Clone());
    }
}

[Collection("db")]
public sealed class StudioFlowTests(PostgresFixture fixture) : IAsyncLifetime
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
    public async Task Login_failure_is_generic_and_csrf_is_required()
    {
        var missing = await _api.Call(HttpMethod.Post, "/api/v1/auth/login", new { email = "a@b.co", password = "nope" }, csrf: false);
        Assert.Equal(HttpStatusCode.BadRequest, missing.Status);

        await Register("ada@example.com");
        var wrong = await _api.Call(HttpMethod.Post, "/api/v1/auth/login", new { email = "ada@example.com", password = "falsch-Falsch-1" });
        var unknown = await _api.Call(HttpMethod.Post, "/api/v1/auth/login", new { email = "niemand@example.com", password = "falsch-Falsch-1" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.Status);
        Assert.Equal(wrong.Body.GetProperty("detail").GetString(), unknown.Body.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Requirements_keys_versions_roles_and_project_boundaries()
    {
        await Login("owner@example.com");
        var project = await CreateProject("Portal");
        var projectId = project.GetProperty("id").GetGuid();
        var created = await Task.WhenAll(Enumerable.Range(0, 6).Select(index =>
            _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = $"Parallel {index}" })));
        Assert.All(created, item => Assert.Equal(HttpStatusCode.Created, item.Status));
        var keys = created.Select(item => item.Body.GetProperty("key").GetString()).ToArray();
        Assert.Equal(keys.Length, keys.Distinct().Count());

        var requirement = created[0].Body;
        var id = requirement.GetProperty("id").GetGuid();
        var first = await _api.Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/requirements/{id}", new
        {
            version = 1,
            title = "Erster Titel",
            description = "Text",
            status = "Offen",
            priority = "Hoch",
            tags = new[] { "kern" },
        });
        var conflict = await _api.Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/requirements/{id}", new
        {
            version = 1,
            title = "Zweiter Titel",
            description = "Text",
            status = "Offen",
            priority = "Hoch",
            tags = Array.Empty<string>(),
        });
        Assert.Equal(HttpStatusCode.OK, first.Status);
        Assert.Equal(HttpStatusCode.Conflict, conflict.Status);
        Assert.Equal("version_conflict", conflict.Body.GetProperty("code").GetString());
        var current = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/requirements/{id}");
        Assert.Equal("Erster Titel", current.Body.GetProperty("title").GetString());

        var viewer = await NewUser("viewer@example.com");
        var stranger = await NewUser("stranger@example.com");
        var added = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/members", new { email = "viewer@example.com", role = "Viewer" });
        Assert.Equal(HttpStatusCode.OK, added.Status);
        var read = await viewer.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/requirements/{id}");
        var write = await viewer.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Nicht erlaubt" });
        var hidden = await stranger.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/requirements/{id}");
        Assert.Equal(HttpStatusCode.OK, read.Status);
        Assert.Equal(HttpStatusCode.Forbidden, write.Status);
        Assert.Equal(HttpStatusCode.NotFound, hidden.Status);

        var otherProject = await stranger.Call(HttpMethod.Post, "/api/v1/projects", new { name = "Fremd" });
        var otherId = otherProject.Body.GetProperty("id").GetGuid();
        var otherRequirement = await stranger.Call(HttpMethod.Post, $"/api/v1/projects/{otherId}/requirements", new { title = "Fremde Anforderung" });
        var cross = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new
        {
            sourceId = id,
            targetId = otherRequirement.Body.GetProperty("id").GetGuid(),
            relation = "Documents",
        });
        Assert.Equal(HttpStatusCode.NotFound, cross.Status);

        var demote = await _api.Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/members/{currentUserId}", new { role = "Editor" });
        Assert.Equal(HttpStatusCode.Conflict, demote.Status);
        Assert.Equal("last_owner", demote.Body.GetProperty("code").GetString());
    }

    private Guid currentUserId;

    [Fact]
    public async Task Diagram_save_rejects_invalid_edges_and_deletes_node_links()
    {
        await Login("editor@example.com");
        var projectId = (await CreateProject("Ablauf")).GetProperty("id").GetGuid();
        var diagram = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name = "Prüfung", kind = "Process" });
        var diagramId = diagram.Body.GetProperty("id").GetGuid();
        var start = Guid.NewGuid();
        var action = Guid.NewGuid();
        var end = Guid.NewGuid();
        var edge = Guid.NewGuid();
        var saved = await SaveDiagram(projectId, diagramId, 1, "Prüfung", Nodes(("start", start, "Start"), ("action", action, "Annehmen"), ("end", end, "Ende")),
            Edges((edge, start, action, "Weiter"), (Guid.NewGuid(), action, end, null)));
        Assert.Equal(HttpStatusCode.OK, saved.Status);

        var requirement = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Freigabe" });
        var linked = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = action, targetId = requirement.Body.GetProperty("id").GetGuid(), relation = "Satisfies" });
        Assert.Equal(HttpStatusCode.Created, linked.Status);

        var invalid = await SaveDiagram(projectId, diagramId, saved.Body.GetProperty("version").GetInt32(), "Prüfung",
            Nodes(("start", start, "Start")),
            Edges((Guid.NewGuid(), start, Guid.NewGuid(), null)));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.Status);
        var unchanged = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams/{diagramId}");
        Assert.Equal(3, unchanged.Body.GetProperty("nodes").GetArrayLength());
        Assert.Equal(2, unchanged.Body.GetProperty("edges").GetArrayLength());

        var removed = await SaveDiagram(projectId, diagramId, unchanged.Body.GetProperty("version").GetInt32(), "Prüfung",
            Nodes(("start", start, "Start"), ("end", end, "Ende")),
            Edges((Guid.NewGuid(), start, end, null)));
        Assert.Equal(HttpStatusCode.OK, removed.Status);
        Assert.Equal(2, removed.Body.GetProperty("nodes").GetArrayLength());
        Assert.Equal(1, removed.Body.GetProperty("edges").GetArrayLength());
        var links = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{action}/links");
        Assert.Equal(HttpStatusCode.NotFound, links.Status);
        var requirementLinks = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{requirement.Body.GetProperty("id").GetGuid()}/links");
        Assert.Equal(0, requirementLinks.Body.GetArrayLength());

        var deletedDiagram = await _api.Call(HttpMethod.Delete, $"/api/v1/projects/{projectId}/diagrams/{diagramId}");
        Assert.Equal(HttpStatusCode.NoContent, deletedDiagram.Status);
        var missingDiagram = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams/{diagramId}");
        Assert.Equal(HttpStatusCode.NotFound, missingDiagram.Status);
    }

    [Fact]
    public async Task Trigger_can_cross_diagrams_and_component_placements_follow_the_name()
    {
        await Login("arch@example.com");
        var projectId = (await CreateProject("System")).GetProperty("id").GetGuid();
        var first = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name = "Prüfung", kind = "Process" });
        var second = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name = "Hinweis", kind = "Process" });
        var action = Guid.NewGuid();
        var ev = Guid.NewGuid();
        await SaveDiagram(projectId, first.Body.GetProperty("id").GetGuid(), 1, "Prüfung", Nodes(("action", action, "Annehmen")), []);
        await SaveDiagram(projectId, second.Body.GetProperty("id").GetGuid(), 1, "Hinweis", Nodes(("event", ev, "Eingegangen")), []);
        var trigger = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = action, targetId = ev, relation = "Triggers" });
        Assert.Equal(HttpStatusCode.Created, trigger.Status);

        var component = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/components", new { name = "Bestell-API", kind = "Api", technology = "HTTP" });
        var componentId = component.Body.GetProperty("id").GetGuid();
        var context = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name = "Kontext", kind = "System" });
        var container = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name = "Container", kind = "System" });
        var placeA = Guid.NewGuid();
        var placeB = Guid.NewGuid();
        await SaveDiagram(projectId, context.Body.GetProperty("id").GetGuid(), 1, "Kontext", SystemNodes((placeA, componentId)), [], system: true);
        await SaveDiagram(projectId, container.Body.GetProperty("id").GetGuid(), 1, "Container", SystemNodes((placeB, componentId)), [], system: true);
        var renamed = await _api.Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/components/{componentId}", new { version = 1, name = "Order API", kind = "Api", technology = "HTTP" });
        Assert.Equal(HttpStatusCode.OK, renamed.Status);
        var left = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams/{context.Body.GetProperty("id").GetGuid()}");
        var right = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams/{container.Body.GetProperty("id").GetGuid()}");
        Assert.Equal("Order API", left.Body.GetProperty("nodes")[0].GetProperty("componentName").GetString());
        Assert.Equal("Order API", right.Body.GetProperty("nodes")[0].GetProperty("componentName").GetString());

        var blocked = await _api.Call(HttpMethod.Delete, $"/api/v1/projects/{projectId}/artifacts/{componentId}");
        Assert.Equal(HttpStatusCode.Conflict, blocked.Status);
        await SaveDiagram(projectId, context.Body.GetProperty("id").GetGuid(), left.Body.GetProperty("version").GetInt32(), "Kontext", [], [], system: true);
        var after = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams/{container.Body.GetProperty("id").GetGuid()}");
        var still = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/components/{componentId}");
        Assert.Equal(1, after.Body.GetProperty("nodes").GetArrayLength());
        Assert.Equal(HttpStatusCode.OK, still.Status);
    }

    [Fact]
    public async Task Shared_component_lists_both_flows_with_rationale()
    {
        await Login("wirkung@example.com");
        var projectId = (await CreateProject("Groß")).GetProperty("id").GetGuid();
        var orderArea = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/areas", new { name = "Bestellung", description = "Auftrag" });
        var shippingArea = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/areas", new { name = "Versand" });
        Assert.Equal(HttpStatusCode.Created, orderArea.Status);
        var orderAreaId = orderArea.Body.GetProperty("id").GetGuid();
        var shippingAreaId = shippingArea.Body.GetProperty("id").GetGuid();

        var stranger = await NewUser("fremd-bereich@example.com");
        var foreign = await stranger.Call(HttpMethod.Post, "/api/v1/projects", new { name = "Fremd" });
        var rejected = await stranger.Call(HttpMethod.Post, $"/api/v1/projects/{foreign.Body.GetProperty("id").GetGuid()}/diagrams", new { name = "Fremdablauf", kind = "Process", areaId = orderAreaId });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.Status);

        var first = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name = "Auftrag annehmen", kind = "Process", areaId = orderAreaId });
        var second = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/diagrams", new { name = "Versand starten", kind = "Process", areaId = shippingAreaId });
        var component = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/components", new { name = "Bestell-API", kind = "Api" });
        var componentId = component.Body.GetProperty("id").GetGuid();
        var check = Guid.NewGuid();
        var ship = Guid.NewGuid();
        var firstId = first.Body.GetProperty("id").GetGuid();
        var secondId = second.Body.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await SaveDiagram(projectId, firstId, 1, "Auftrag annehmen", Nodes(("action", check, "Prüfen")), [], areaId: orderAreaId)).Status);
        Assert.Equal(HttpStatusCode.OK, (await SaveDiagram(projectId, secondId, 1, "Versand starten", Nodes(("action", ship, "Versenden")), [], areaId: shippingAreaId)).Status);
        var firstLink = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = check, targetId = componentId, relation = "Uses", rationale = "prüft die Bestellung über die API" });
        var secondLink = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/links", new { sourceId = ship, targetId = componentId, relation = "Uses", rationale = "meldet den Versand an die API" });
        Assert.Equal(HttpStatusCode.Created, firstLink.Status);
        Assert.Equal(HttpStatusCode.Created, secondLink.Status);

        var renamed = await _api.Call(HttpMethod.Patch, $"/api/v1/projects/{projectId}/components/{componentId}", new { version = 1, name = "Bestelldienst", kind = "Api" });
        Assert.Equal(HttpStatusCode.OK, renamed.Status);
        var overview = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/overview");
        var shared = overview.Body.GetProperty("sharedComponents");
        Assert.Equal(1, shared.GetArrayLength());
        Assert.Equal("Bestelldienst", shared[0].GetProperty("name").GetString());
        var flows = shared[0].GetProperty("flows");
        Assert.Equal(2, flows.GetArrayLength());
        Assert.Contains("prüft die Bestellung über die API", flows.EnumerateArray().Select(item => item.GetProperty("rationale").GetString()));
        Assert.Contains("meldet den Versand an die API", flows.EnumerateArray().Select(item => item.GetProperty("rationale").GetString()));
        Assert.Contains(check, flows.EnumerateArray().Select(item => item.GetProperty("nodeId").GetGuid()));
        Assert.Contains(ship, flows.EnumerateArray().Select(item => item.GetProperty("nodeId").GetGuid()));
        Assert.Equal(firstId, flows.EnumerateArray().First(item => item.GetProperty("nodeId").GetGuid() == check).GetProperty("diagramId").GetGuid());
        Assert.Equal("Bestellung", flows.EnumerateArray().First(item => item.GetProperty("nodeId").GetGuid() == check).GetProperty("areaName").GetString());

        var effects = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/components/{componentId}/effects");
        Assert.Equal(2, effects.Body.GetArrayLength());
        var back = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/artifacts/{componentId}/links");
        Assert.Equal(2, back.Body.GetArrayLength());
        Assert.Contains("prüft die Bestellung über die API", back.Body.EnumerateArray().Select(item => item.GetProperty("rationale").GetString()));

        var view = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/views", new { name = "Nur Bestellung", scope = "processes", areaId = orderAreaId, unassigned = false, query = "" });
        Assert.Equal(HttpStatusCode.Created, view.Status);
        var filtered = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/diagrams?kind=Process&areaId={orderAreaId}");
        Assert.Equal(1, filtered.Body.GetArrayLength());
        Assert.Equal("Auftrag annehmen", filtered.Body[0].GetProperty("name").GetString());
        Assert.Equal("Bestellung", filtered.Body[0].GetProperty("areaName").GetString());
    }

    [Fact]
    public async Task Documents_keep_revisions_and_reject_cycles()
    {
        await Login("doku@example.com");
        var projectId = (await CreateProject("Doku")).GetProperty("id").GetGuid();
        var parent = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "Fachkonzept", kind = "Page" });
        var child = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents", new { title = "Ablauf", kind = "Page", parentId = parent.Body.GetProperty("id").GetGuid() });
        var parentId = parent.Body.GetProperty("id").GetGuid();
        var cycle = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents/{parentId}/move", new { version = parent.Body.GetProperty("version").GetInt32(), parentId = child.Body.GetProperty("id").GetGuid(), sortOrder = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, cycle.Status);

        var requirement = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/requirements", new { title = "Freigabe" });
        var content = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"artifactLink\",\"attrs\":{\"artifactId\":\"" + requirement.Body.GetProperty("id").GetGuid() + "\",\"label\":\"REQ\"}}]}]}";
        var updated = await _api.Call(HttpMethod.Put, $"/api/v1/projects/{projectId}/documents/{parentId}", new { version = parent.Body.GetProperty("version").GetInt32(), title = "Fachkonzept", status = "Entwurf", contentJson = content });
        Assert.Equal(HttpStatusCode.OK, updated.Status);
        var second = await _api.Call(HttpMethod.Put, $"/api/v1/projects/{projectId}/documents/{parentId}", new { version = updated.Body.GetProperty("version").GetInt32(), title = "Fachkonzept neu", status = "Entwurf", contentJson = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Neu\"}]}]}" });
        var revision = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/documents/{parentId}/revisions/2");
        Assert.Contains("artifactLink", revision.Body.GetProperty("contentJson").GetString(), StringComparison.Ordinal);
        var restored = await _api.Call(HttpMethod.Post, $"/api/v1/projects/{projectId}/documents/{parentId}/revisions/2/restore", new { version = second.Body.GetProperty("version").GetInt32() });
        Assert.Equal(HttpStatusCode.OK, restored.Status);
        Assert.Contains("artifactLink", restored.Body.GetProperty("contentJson").GetString(), StringComparison.Ordinal);
        Assert.True(restored.Body.GetProperty("version").GetInt32() > second.Body.GetProperty("version").GetInt32());

        var deletedPage = await _api.Call(HttpMethod.Delete, $"/api/v1/projects/{projectId}/artifacts/{parentId}");
        Assert.Equal(HttpStatusCode.NoContent, deletedPage.Status);
        var missingChild = await _api.Call(HttpMethod.Get, $"/api/v1/projects/{projectId}/documents/{child.Body.GetProperty("id").GetGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missingChild.Status);
    }

    private async Task Register(string email)
    {
        var response = await _api.Call(HttpMethod.Post, "/api/v1/auth/register", new { displayName = "Testperson", email, password = "Planung-Test-1" });
        Assert.Equal(HttpStatusCode.OK, response.Status);
        _api.Token = response.Body.GetProperty("token").GetString() ?? _api.Token;
    }

    private async Task Login(string email)
    {
        await Register(email);
        var response = await _api.Call(HttpMethod.Post, "/api/v1/auth/login", new { email, password = "Planung-Test-1" });
        Assert.Equal(HttpStatusCode.OK, response.Status);
        _api.Token = response.Body.GetProperty("token").GetString() ?? _api.Token;
        currentUserId = response.Body.GetProperty("id").GetGuid();
    }

    private async Task<ApiClient> NewUser(string email)
    {
        var client = new ApiClient(fixture.Factory);
        await client.Boot();
        var registered = await client.Call(HttpMethod.Post, "/api/v1/auth/register", new { displayName = "Weitere Person", email, password = "Planung-Test-1" });
        Assert.Equal(HttpStatusCode.OK, registered.Status);
        client.Token = registered.Body.GetProperty("token").GetString() ?? client.Token;
        var loggedIn = await client.Call(HttpMethod.Post, "/api/v1/auth/login", new { email, password = "Planung-Test-1" });
        Assert.Equal(HttpStatusCode.OK, loggedIn.Status);
        client.Token = loggedIn.Body.GetProperty("token").GetString() ?? client.Token;
        return client;
    }

    private async Task<JsonElement> CreateProject(string name)
    {
        var response = await _api.Call(HttpMethod.Post, "/api/v1/projects", new { name });
        Assert.Equal(HttpStatusCode.OK, response.Status);
        return response.Body;
    }

    private Task<(HttpStatusCode Status, JsonElement Body)> SaveDiagram(Guid projectId, Guid diagramId, int version, string name, object[] nodes, object[] edges, bool system = false, Guid? areaId = null) =>
        _api.Call(HttpMethod.Put, $"/api/v1/projects/{projectId}/diagrams/{diagramId}", new { version, name, nodes, edges, areaId });

    private static object[] Nodes(params (string Type, Guid Id, string Title)[] nodes) =>
        nodes.Select(node => new { id = node.Id, nodeType = node.Type, title = node.Title, x = 10, y = 20, description = "", eventName = "" }).ToArray();

    private static object[] SystemNodes(params (Guid Id, Guid ComponentId)[] nodes) =>
        nodes.Select(node => new { id = node.Id, nodeType = "placement", title = "", x = 30, y = 40, componentId = node.ComponentId }).ToArray();

    private static object[] Edges(params (Guid Id, Guid Source, Guid Target, string? Condition)[] edges) =>
        edges.Select(edge => new { id = edge.Id, kind = "Sequence", sourceId = edge.Source, targetId = edge.Target, condition = edge.Condition, label = edge.Condition }).ToArray();
}
