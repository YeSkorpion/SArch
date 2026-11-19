using Studio.Api.Domain;

namespace Studio.Api.UnitTests;

public class DiagramRulesTests
{
    [Fact]
    public void Process_without_start_end_and_decision_exits_is_saveable_but_reported()
    {
        var decision = Guid.NewGuid();
        var action = Guid.NewGuid();
        var nodes = new[]
        {
            Node(decision, "decision", "Freigabe?"),
            Node(action, "action", "Ablehnen"),
        };
        var edges = new[] { Edge(decision, action, "") };
        var structure = DiagramRules.ValidateStructure(DiagramKind.Process, nodes, edges);
        var issues = DiagramRules.Analyze(DiagramKind.Process, nodes, edges);

        Assert.Empty(structure);
        Assert.Contains(issues, issue => issue.Code == "missing_start");
        Assert.Contains(issues, issue => issue.Code == "missing_end");
        Assert.Contains(issues, issue => issue.Code == "decision_exits" && issue.NodeId == decision);
        Assert.Contains(issues, issue => issue.Code == "unlabeled_exit" && issue.EdgeId == edges[0].Id);
    }

    [Fact]
    public void Unreachable_nodes_are_reported_from_the_start()
    {
        var start = Guid.NewGuid();
        var action = Guid.NewGuid();
        var orphan = Guid.NewGuid();
        var end = Guid.NewGuid();
        var nodes = new[] { Node(start, "start", "Start"), Node(action, "action", "Prüfen"), Node(orphan, "action", "Verwaist"), Node(end, "end", "Ende") };
        var edges = new[] { Edge(start, action, null), Edge(action, end, null) };
        var issues = DiagramRules.Analyze(DiagramKind.Process, nodes, edges);
        Assert.Contains(issues, issue => issue.Code == "unreachable" && issue.NodeId == orphan);
        Assert.DoesNotContain(issues, issue => issue.NodeId == action);
    }

    [Fact]
    public void Edge_outside_the_diagram_is_rejected()
    {
        var start = Guid.NewGuid();
        var errors = DiagramRules.ValidateStructure(
            DiagramKind.Process,
            [Node(start, "start", "Start")],
            [Edge(start, Guid.NewGuid(), null)]);
        Assert.Contains(errors, error => error.Contains("desselben Diagramms", StringComparison.Ordinal));
    }

    [Fact]
    public void Notes_are_allowed_and_do_not_count_as_unreachable()
    {
        var start = Guid.NewGuid();
        var end = Guid.NewGuid();
        var note = Guid.NewGuid();
        var source = Guid.NewGuid();
        var nodes = new[]
        {
            Node(start, "start", "Start"),
            Node(end, "end", "Ende"),
            Node(note, "note", "Hinweis"),
            Node(source, "source", "Datenquelle"),
        };
        var edges = new[] { Edge(start, end, "weiter") };
        Assert.Empty(DiagramRules.ValidateStructure(DiagramKind.Process, nodes, edges));
        var issues = DiagramRules.Analyze(DiagramKind.Process, nodes, edges);
        Assert.DoesNotContain(issues, issue => issue.NodeId == note || issue.NodeId == source);
    }

    [Fact]
    public void Unknown_color_is_rejected()
    {
        var start = Guid.NewGuid();
        var node = Node(start, "start", "Start") with { Color = "pink" };
        var errors = DiagramRules.ValidateStructure(DiagramKind.Process, [node], []);
        Assert.Contains(errors, error => error.Contains("Farbe", StringComparison.Ordinal));
    }

    [Fact]
    public void System_node_requires_a_component()
    {
        var errors = DiagramRules.ValidateStructure(DiagramKind.System, [Node(Guid.NewGuid(), "placement", "")], []);
        Assert.NotEmpty(errors);
    }

    private static DiagramNodeDraft Node(Guid id, string type, string title) => new(id, type, title, 10, 20, null, null, null);

    private static DiagramEdgeDraft Edge(Guid source, Guid target, string? condition) =>
        new(Guid.NewGuid(), EdgeKind.Sequence, source, target, condition, condition, null);
}

public class LinkRulesTests
{
    [Theory]
    [InlineData(ArtifactType.Screen, null, ArtifactType.Requirement, null, LinkRelation.Satisfies, true)]
    [InlineData(ArtifactType.DiagramNode, "action", ArtifactType.Requirement, null, LinkRelation.Satisfies, true)]
    [InlineData(ArtifactType.DiagramNode, "start", ArtifactType.Requirement, null, LinkRelation.Satisfies, false)]
    [InlineData(ArtifactType.DiagramNode, "action", ArtifactType.Screen, null, LinkRelation.Uses, true)]
    [InlineData(ArtifactType.DiagramNode, "action", ArtifactType.DiagramNode, "event", LinkRelation.Triggers, true)]
    [InlineData(ArtifactType.DiagramNode, "event", ArtifactType.DiagramNode, "action", LinkRelation.Triggers, false)]
    [InlineData(ArtifactType.Document, null, ArtifactType.Requirement, null, LinkRelation.Documents, true)]
    [InlineData(ArtifactType.Requirement, null, ArtifactType.Document, null, LinkRelation.Documents, false)]
    public void Allows_only_typed_relations(ArtifactType source, string? sourceNode, ArtifactType target, string? targetNode, LinkRelation relation, bool allowed)
    {
        var error = LinkRules.Validate(source, sourceNode, target, targetNode, relation);
        Assert.Equal(allowed, error is null);
    }
}

public class DocumentRulesTests
{
    [Fact]
    public void Detects_cycles()
    {
        var root = Guid.NewGuid();
        var child = Guid.NewGuid();
        var parents = new Dictionary<Guid, Guid?> { [root] = null, [child] = root };
        Assert.True(DocumentRules.CreatesCycle(root, child, parents));
        Assert.False(DocumentRules.CreatesCycle(child, null, parents));
    }

    [Fact]
    public void Rejects_scriptable_links_and_unknown_nodes()
    {
        Assert.False(TipTapRules.IsSafeHref("javascript:alert(1)"));
        Assert.True(TipTapRules.IsSafeHref("https://example.com"));
        var errors = TipTapRules.Validate("""{"type":"doc","content":[{"type":"html","content":[{"type":"text","text":"x"}]}]}""");
        Assert.NotEmpty(errors);
    }

    [Fact]
    public void Extracts_artifact_links_and_plain_text()
    {
        var id = Guid.NewGuid();
        var json = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Siehe \"},{\"type\":\"artifactLink\",\"attrs\":{\"artifactId\":\"" + id + "\",\"label\":\"REQ-001\"}}]}]}";
        Assert.Empty(TipTapRules.Validate(json));
        Assert.Equal([id], TipTapRules.ArtifactIds(json));
        Assert.Contains("REQ-001", TipTapRules.PlainText(json), StringComparison.Ordinal);
    }
}

public class WireframeRulesTests
{
    [Fact]
    public void Rejects_navigation_on_text_and_accepts_a_button()
    {
        var bad = WireframeRules.Parse("""{"version":1,"desktop":{"elements":[{"id":"11111111-1111-1111-1111-111111111111","type":"text","x":0,"y":0,"width":40,"height":20,"text":"A","targetScreenId":"22222222-2222-2222-2222-222222222222"}]},"mobile":{"elements":[]}}""");
        Assert.Contains(bad.Errors, error => error.Contains("Schaltflächen", StringComparison.Ordinal));

        var good = WireframeRules.Parse("""{"version":1,"desktop":{"elements":[{"id":"11111111-1111-1111-1111-111111111111","type":"button","x":0,"y":0,"width":80,"height":32,"text":"Weiter","targetScreenId":"22222222-2222-2222-2222-222222222222"}]},"mobile":{"elements":[]}}""");
        Assert.Empty(good.Errors);
        Assert.Equal(Guid.Parse("22222222-2222-2222-2222-222222222222"), good.Model!.Desktop.Elements[0].TargetScreenId);
    }
}
