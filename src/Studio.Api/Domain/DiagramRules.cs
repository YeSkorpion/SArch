namespace Studio.Api.Domain;

public sealed record DiagramNodeDraft(
    Guid Id,
    string NodeType,
    string Title,
    double X,
    double Y,
    Guid? ComponentId,
    string? Description,
    string? EventName,
    string? Color = null,
    string? Comment = null);

public sealed record DiagramEdgeDraft(
    Guid Id,
    EdgeKind Kind,
    Guid SourceId,
    Guid TargetId,
    string? Label,
    string? Condition,
    string? Protocol,
    string? Color = null);

public sealed record DiagramIssue(string Code, string Message, Guid? NodeId, Guid? EdgeId);

public static class DiagramRules
{
    public const int MaxNodes = 400;
    public const int MaxEdges = 800;

    private static readonly HashSet<string> ProcessTypes = ["start", "action", "decision", "event", "end", "note"];
    private static readonly HashSet<string> Tones = ["accent", "ok", "warning", "danger"];

    public static IReadOnlyList<string> ValidateStructure(
        DiagramKind kind,
        IReadOnlyList<DiagramNodeDraft> nodes,
        IReadOnlyList<DiagramEdgeDraft> edges)
    {
        var errors = new List<string>();
        if (nodes.Count > MaxNodes)
        {
            errors.Add($"Ein Diagramm kann höchstens {MaxNodes} Knoten enthalten.");
        }

        if (edges.Count > MaxEdges)
        {
            errors.Add($"Ein Diagramm kann höchstens {MaxEdges} Kanten enthalten.");
        }

        var nodeIds = new HashSet<Guid>();
        foreach (var node in nodes)
        {
            if (node.Id == Guid.Empty || !nodeIds.Add(node.Id))
            {
                errors.Add("Jeder Knoten braucht eine eindeutige Kennung.");
                continue;
            }

            if (!double.IsFinite(node.X) || !double.IsFinite(node.Y) || Math.Abs(node.X) > 20000 || Math.Abs(node.Y) > 20000)
            {
                errors.Add($"Die Position von „{Trim(node.Title)}“ liegt außerhalb des zulässigen Bereichs.");
            }

            if (node.Description is { Length: > 4000 })
            {
                errors.Add($"Die Beschreibung von „{Trim(node.Title)}“ ist zu lang.");
            }

            if (node.EventName is { Length: > 200 })
            {
                errors.Add($"Der Ereignisname von „{Trim(node.Title)}“ ist zu lang.");
            }

            if (node.Comment is { Length: > 500 })
            {
                errors.Add($"Der Kommentar von „{Trim(node.Title)}“ ist zu lang.");
            }

            if (BadTone(node.Color))
            {
                errors.Add($"Die Farbe von „{Trim(node.Title)}“ ist nicht zulässig.");
            }

            if (kind == DiagramKind.Process)
            {
                if (!ProcessTypes.Contains(node.NodeType))
                {
                    errors.Add($"Der Knotentyp „{node.NodeType}“ ist in einem Prozessdiagramm nicht zulässig.");
                }

                if (string.IsNullOrWhiteSpace(node.Title) || node.Title.Trim().Length > 160)
                {
                    errors.Add("Jeder Prozessknoten braucht einen Titel mit höchstens 160 Zeichen.");
                }

                if (node.ComponentId is not null)
                {
                    errors.Add("Prozessknoten verweisen nicht auf Komponenten.");
                }
            }
            else if (node.NodeType == "note")
            {
                if (node.ComponentId is not null)
                {
                    errors.Add("Kommentare verweisen nicht auf Komponenten.");
                }
            }
            else
            {
                if (node.NodeType != "placement")
                {
                    errors.Add("Systemdiagramme enthalten nur Komponentenplatzierungen und Kommentare.");
                }

                if (node.ComponentId is null || node.ComponentId == Guid.Empty)
                {
                    errors.Add("Jede Platzierung braucht eine Komponente desselben Projekts.");
                }
            }
        }

        var edgeIds = new HashSet<Guid>();
        var pairs = new HashSet<string>();
        foreach (var edge in edges)
        {
            if (edge.Id == Guid.Empty || !edgeIds.Add(edge.Id))
            {
                errors.Add("Jede Kante braucht eine eindeutige Kennung.");
                continue;
            }

            if (edge.SourceId == edge.TargetId || !nodeIds.Contains(edge.SourceId) || !nodeIds.Contains(edge.TargetId))
            {
                errors.Add("Eine Kante muss zwei verschiedene Knoten desselben Diagramms verbinden.");
            }

            if (kind == DiagramKind.Process && edge.Kind != EdgeKind.Sequence)
            {
                errors.Add("Prozesskanten sind Ablaufkanten.");
            }

            if (kind == DiagramKind.System && edge.Kind == EdgeKind.Sequence)
            {
                errors.Add("Systemkanten beschreiben Abhängigkeiten oder Datenflüsse.");
            }

            if (edge.Label is { Length: > 200 } || edge.Condition is { Length: > 200 } || edge.Protocol is { Length: > 80 })
            {
                errors.Add("Eine Kantenbeschriftung ist zu lang.");
            }

            if (BadTone(edge.Color))
            {
                errors.Add("Die Farbe einer Kante ist nicht zulässig.");
            }

            if (!string.IsNullOrWhiteSpace(edge.Protocol) && edge.Protocol.Any(ch => !(char.IsLetterOrDigit(ch) || ch is ' ' or '/' or '+' or '.' or '-' or '_')))
            {
                errors.Add("Das Protokoll enthält ungültige Zeichen.");
            }

            if (!pairs.Add($"{edge.SourceId:N}:{edge.TargetId:N}:{edge.Kind}"))
            {
                errors.Add("Zwischen zwei Knoten gibt es diese Kante bereits.");
            }
        }

        return errors;
    }

    public static IReadOnlyList<DiagramIssue> Analyze(
        DiagramKind kind,
        IReadOnlyList<DiagramNodeDraft> nodes,
        IReadOnlyList<DiagramEdgeDraft> edges)
    {
        if (kind != DiagramKind.Process)
        {
            return [];
        }

        var issues = new List<DiagramIssue>();
        var starts = nodes.Where(node => node.NodeType == "start").ToList();
        if (starts.Count == 0)
        {
            issues.Add(new DiagramIssue("missing_start", "Es fehlt ein Startknoten.", null, null));
        }

        if (nodes.All(node => node.NodeType != "end"))
        {
            issues.Add(new DiagramIssue("missing_end", "Es fehlt ein Endknoten.", null, null));
        }

        if (starts.Count > 0)
        {
            var outgoing = edges.GroupBy(edge => edge.SourceId)
                .ToDictionary(group => group.Key, group => group.Select(edge => edge.TargetId).ToList());
            var seen = new HashSet<Guid>(starts.Select(node => node.Id));
            var queue = new Queue<Guid>(seen);
            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                if (!outgoing.TryGetValue(current, out var next))
                {
                    continue;
                }

                foreach (var target in next)
                {
                    if (seen.Add(target))
                    {
                        queue.Enqueue(target);
                    }
                }
            }

            foreach (var node in nodes.Where(node => node.NodeType != "note" && !seen.Contains(node.Id)))
            {
                issues.Add(new DiagramIssue(
                    "unreachable",
                    $"„{Trim(node.Title)}“ ist vom Start aus nicht erreichbar.",
                    node.Id,
                    null));
            }
        }

        foreach (var decision in nodes.Where(node => node.NodeType == "decision"))
        {
            var exits = edges.Where(edge => edge.SourceId == decision.Id).ToList();
            if (exits.Count < 2)
            {
                issues.Add(new DiagramIssue(
                    "decision_exits",
                    $"„{Trim(decision.Title)}“ braucht mindestens zwei Ausgänge.",
                    decision.Id,
                    null));
            }

            foreach (var edge in exits.Where(edge => string.IsNullOrWhiteSpace(edge.Condition)))
            {
                issues.Add(new DiagramIssue(
                    "unlabeled_exit",
                    $"Ein Ausgang von „{Trim(decision.Title)}“ hat keine Bedingung.",
                    decision.Id,
                    edge.Id));
            }
        }

        return issues;
    }

    public static bool IsProcessStep(string nodeType) => nodeType is "action" or "decision" or "event";

    private static bool BadTone(string? color) => !string.IsNullOrWhiteSpace(color) && !Tones.Contains(color.Trim());

    private static string Trim(string? value)
    {
        var text = (value ?? "").Trim();
        return text.Length <= 80 ? text : text[..80];
    }
}
