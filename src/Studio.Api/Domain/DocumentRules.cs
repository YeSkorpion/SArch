using System.Text.Json;

namespace Studio.Api.Domain;

public static class DocumentRules
{
    public const string EmptyContent = """{"type":"doc","content":[{"type":"paragraph"}]}""";

    public const string DecisionTemplate = """
        {"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Kontext"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Entscheidung"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Alternativen"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Konsequenzen"}]},{"type":"paragraph"}]}
        """;

    public static bool CreatesCycle(Guid documentId, Guid? newParentId, IReadOnlyDictionary<Guid, Guid?> parentById)
    {
        var current = newParentId;
        var seen = new HashSet<Guid>();
        while (current is Guid id)
        {
            if (id == documentId || !seen.Add(id))
            {
                return true;
            }

            if (!parentById.TryGetValue(id, out var next))
            {
                return false;
            }

            current = next;
        }

        return false;
    }

    public static bool StatusMatchesKind(DocumentKind kind, DocumentStatus status) => kind switch
    {
        DocumentKind.Page => status == DocumentStatus.Entwurf,
        DocumentKind.Decision => status is DocumentStatus.Vorgeschlagen or DocumentStatus.Akzeptiert or DocumentStatus.Abgeloest,
        _ => false,
    };
}

public static class WireframeRules
{
    public static readonly string[] ElementTypes = ["text", "button", "input", "image", "card", "container"];

    public sealed record Element(
        string Id,
        string Type,
        double X,
        double Y,
        double Width,
        double Height,
        string Text,
        Guid? TargetScreenId);

    public sealed record Frame(List<Element> Elements);

    public sealed record DocumentModel(int Version, Frame Desktop, Frame Mobile);

    public static DocumentModel Empty() => new(1, new Frame([]), new Frame([]));

    public static (DocumentModel? Model, IReadOnlyList<string> Errors) Parse(string json)
    {
        var errors = new List<string>();
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return (null, ["Das Wireframe ist kein gültiges JSON."]);
        }

        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return (null, ["Das Wireframe hat ein ungültiges Format."]);
            }

            var version = document.RootElement.TryGetProperty("version", out var versionElement) && versionElement.TryGetInt32(out var parsed)
                ? parsed
                : 0;
            if (version != 1)
            {
                errors.Add("Das Wireframe-Format wird nicht unterstützt.");
            }

            var desktop = ReadFrame(document.RootElement, "desktop", errors);
            var mobile = ReadFrame(document.RootElement, "mobile", errors);
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var element in desktop.Concat(mobile))
            {
                if (!ids.Add(element.Id))
                {
                    errors.Add("Jedes Wireframe-Element braucht eine eindeutige Kennung.");
                }
            }

            return (new DocumentModel(1, new Frame(desktop), new Frame(mobile)), errors);
        }
    }

    public static string Serialize(DocumentModel model)
    {
        return JsonSerializer.Serialize(new
        {
            version = 1,
            desktop = new { elements = model.Desktop.Elements.Select(Write) },
            mobile = new { elements = model.Mobile.Elements.Select(Write) },
        }, StudioJson.Options);
    }

    private static object Write(Element element) => new
    {
        id = element.Id,
        type = element.Type,
        x = element.X,
        y = element.Y,
        width = element.Width,
        height = element.Height,
        text = element.Text,
        targetScreenId = element.TargetScreenId,
    };

    private static List<Element> ReadFrame(JsonElement root, string name, List<string> errors)
    {
        var result = new List<Element>();
        if (!root.TryGetProperty(name, out var frame) || frame.ValueKind != JsonValueKind.Object
            || !frame.TryGetProperty("elements", out var elements) || elements.ValueKind != JsonValueKind.Array)
        {
            errors.Add($"Der Rahmen „{name}“ fehlt.");
            return result;
        }

        if (elements.GetArrayLength() > 150)
        {
            errors.Add($"Der Rahmen „{name}“ enthält zu viele Elemente.");
        }

        foreach (var item in elements.EnumerateArray())
        {
            var type = item.TryGetProperty("type", out var typeElement) ? typeElement.GetString() ?? "" : "";
            var id = item.TryGetProperty("id", out var idElement) ? idElement.GetString() ?? "" : "";
            if (!Guid.TryParse(id, out _))
            {
                errors.Add("Ein Wireframe-Element hat eine ungültige Kennung.");
                continue;
            }

            if (!ElementTypes.Contains(type))
            {
                errors.Add($"Der Elementtyp „{type}“ ist nicht zulässig.");
                continue;
            }

            var x = ReadNumber(item, "x");
            var y = ReadNumber(item, "y");
            var width = ReadNumber(item, "width");
            var height = ReadNumber(item, "height");
            if (!double.IsFinite(x) || !double.IsFinite(y) || !double.IsFinite(width) || !double.IsFinite(height)
                || x is < -100 or > 4000 || y is < -100 or > 4000 || width is < 8 or > 2000 || height is < 8 or > 2000)
            {
                errors.Add("Position oder Größe eines Elements ist ungültig.");
            }

            var text = item.TryGetProperty("text", out var textElement) && textElement.ValueKind == JsonValueKind.String
                ? textElement.GetString() ?? ""
                : "";
            if (text.Length > 500)
            {
                errors.Add("Ein Elementtext ist zu lang.");
            }

            Guid? target = null;
            if (item.TryGetProperty("targetScreenId", out var targetElement) && targetElement.ValueKind == JsonValueKind.String)
            {
                if (Guid.TryParse(targetElement.GetString(), out var parsed))
                {
                    target = parsed;
                }
                else if (!string.IsNullOrWhiteSpace(targetElement.GetString()))
                {
                    errors.Add("Ein Navigationsziel ist ungültig.");
                }
            }

            if (target is not null && type != "button")
            {
                errors.Add("Nur Schaltflächen können eine Navigation erhalten.");
            }

            result.Add(new Element(id, type, x, y, width, height, text, target));
        }

        return result;
    }

    private static double ReadNumber(JsonElement item, string name)
    {
        if (!item.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var number))
        {
            return double.NaN;
        }

        return number;
    }
}

public static class StudioJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}
