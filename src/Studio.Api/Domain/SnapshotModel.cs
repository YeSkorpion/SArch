using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Studio.Api.Domain;

public sealed class SnapshotDocument
{
    public int Version { get; set; } = 1;
    public string Scope { get; set; } = "project";
    public List<SnapshotArtifact> Artifacts { get; set; } = [];
    public List<SnapshotLink> Links { get; set; } = [];
}

public sealed class SnapshotArtifact
{
    public Guid Id { get; set; }
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Status { get; set; }
    public string? Content { get; set; }
    public string? ContentJson { get; set; }
    public string? WireframeJson { get; set; }
    public string? Kind { get; set; }
    public string? NodeType { get; set; }
    public Guid? DiagramId { get; set; }
    public string? DiagramName { get; set; }
    public Guid? AreaId { get; set; }
    public string? AreaName { get; set; }
    public double? X { get; set; }
    public double? Y { get; set; }
    public Guid? SourceId { get; set; }
    public Guid? TargetId { get; set; }
    public string? Label { get; set; }
    public string? Condition { get; set; }
    public string? Color { get; set; }
    public string? Comment { get; set; }
}

public sealed class SnapshotLink
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public Guid TargetId { get; set; }
    public string Relation { get; set; } = "";
    public string? Rationale { get; set; }
}

public sealed record SnapshotChange(string Change, string Type, Guid Id, string Title, IReadOnlyList<string> Fields);

public static class SnapshotJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Converters = { new JsonStringEnumConverter() },
    };

    public static string Serialize(SnapshotDocument document) => JsonSerializer.Serialize(Normalize(document), Options);

    public static SnapshotDocument Deserialize(string json) =>
        JsonSerializer.Deserialize<SnapshotDocument>(json, Options) ?? new SnapshotDocument();

    public static SnapshotDocument Normalize(SnapshotDocument document)
    {
        document.Artifacts = document.Artifacts.OrderBy(item => item.Type).ThenBy(item => item.Id).ToList();
        document.Links = document.Links.OrderBy(item => item.Id).ToList();
        return document;
    }

    public static string Hash(SnapshotDocument document)
    {
        var copy = Deserialize(Serialize(document));
        foreach (var artifact in copy.Artifacts)
        {
            artifact.X = null;
            artifact.Y = null;
        }

        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(Serialize(copy)));
        return Convert.ToHexString(bytes);
    }
}

public static class SnapshotDiff
{
    public static IReadOnlyList<SnapshotChange> Compare(SnapshotDocument left, SnapshotDocument right)
    {
        var changes = new List<SnapshotChange>();
        var leftItems = left.Artifacts.ToDictionary(item => (item.Type, item.Id));
        var rightItems = right.Artifacts.ToDictionary(item => (item.Type, item.Id));
        foreach (var pair in leftItems.Keys.Concat(rightItems.Keys).Distinct().OrderBy(item => item.Type).ThenBy(item => item.Id))
        {
            leftItems.TryGetValue(pair, out var before);
            rightItems.TryGetValue(pair, out var after);
            if (before is null && after is not null)
            {
                changes.Add(new SnapshotChange("added", after.Type, after.Id, after.Title, []));
            }
            else if (before is not null && after is null)
            {
                changes.Add(new SnapshotChange("removed", before.Type, before.Id, before.Title, []));
            }
            else if (before is not null && after is not null)
            {
                var fields = Fields(before, after);
                if (fields.Count == 0)
                {
                    continue;
                }

                var positionOnly = fields.All(item => item == "Position");
                changes.Add(new SnapshotChange(positionOnly ? "position" : "changed", after.Type, after.Id, after.Title, fields));
            }
        }

        var leftLinks = left.Links.ToDictionary(item => item.Id);
        var rightLinks = right.Links.ToDictionary(item => item.Id);
        foreach (var id in leftLinks.Keys.Concat(rightLinks.Keys).Distinct().OrderBy(item => item))
        {
            leftLinks.TryGetValue(id, out var before);
            rightLinks.TryGetValue(id, out var after);
            if (before is null && after is not null)
            {
                changes.Add(new SnapshotChange("added", "link", after.Id, LinkTitle(after), []));
            }
            else if (before is not null && after is null)
            {
                changes.Add(new SnapshotChange("removed", "link", before.Id, LinkTitle(before), []));
            }
            else if (before is not null && after is not null && (before.Relation != after.Relation || before.Rationale != after.Rationale || before.SourceId != after.SourceId || before.TargetId != after.TargetId))
            {
                changes.Add(new SnapshotChange("changed", "link", after.Id, LinkTitle(after), ["Verknüpfung"]));
            }
        }

        return changes;
    }

    private static List<string> Fields(SnapshotArtifact before, SnapshotArtifact after)
    {
        var fields = new List<string>();
        if (before.Title != after.Title) fields.Add("Titel");
        if (before.Status != after.Status) fields.Add("Status");
        if (before.Comment != after.Comment) fields.Add("Kommentar");
        if (before.Color != after.Color) fields.Add("Farbe");
        if (before.Content != after.Content || before.ContentJson != after.ContentJson || before.WireframeJson != after.WireframeJson || before.Kind != after.Kind || before.NodeType != after.NodeType || before.Label != after.Label || before.Condition != after.Condition || before.SourceId != after.SourceId || before.TargetId != after.TargetId || before.DiagramId != after.DiagramId || before.AreaId != after.AreaId)
        {
            fields.Add("Inhalt");
        }

        if (Math.Abs((before.X ?? 0) - (after.X ?? 0)) > 0.001 || Math.Abs((before.Y ?? 0) - (after.Y ?? 0)) > 0.001)
        {
            fields.Add("Position");
        }

        return fields;
    }

    private static string LinkTitle(SnapshotLink link) => $"{link.Relation} {link.SourceId:N} → {link.TargetId:N}";
}
