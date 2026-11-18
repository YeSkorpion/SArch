using System.Text.Json;

namespace Studio.Api.Domain;

public static class TipTapRules
{
    private static readonly HashSet<string> Nodes =
    [
        "doc", "paragraph", "heading", "text", "bulletList", "orderedList", "listItem",
        "taskList", "taskItem", "blockquote", "codeBlock", "hardBreak", "horizontalRule",
        "table", "tableRow", "tableCell", "tableHeader", "artifactLink",
    ];

    private static readonly HashSet<string> Marks = ["bold", "italic", "strike", "code", "underline", "link"];

    public static IReadOnlyList<string> Validate(string json)
    {
        if (json.Length > 500_000)
        {
            return ["Das Dokument ist zu groß."];
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object
                || !document.RootElement.TryGetProperty("type", out var type)
                || type.GetString() != "doc")
            {
                return ["Der Inhalt muss ein TipTap-Dokument sein."];
            }

            var errors = new List<string>();
            var count = 0;
            Walk(document.RootElement, 0, errors, ref count, inline: false);
            if (count > 5000)
            {
                errors.Add("Das Dokument enthält zu viele Elemente.");
            }

            return errors;
        }
        catch (JsonException)
        {
            return ["Der Inhalt ist kein gültiges JSON."];
        }
    }

    public static IReadOnlyList<Guid> ArtifactIds(string json)
    {
        var ids = new List<Guid>();
        using var document = JsonDocument.Parse(json);
        Collect(document.RootElement, ids);
        return ids.Distinct().ToArray();
    }

    public static string PlainText(string json)
    {
        using var document = JsonDocument.Parse(json);
        var parts = new List<string>();
        CollectText(document.RootElement, parts);
        var text = string.Join(' ', parts.Where(part => part.Length > 0));
        return text.Length <= 8000 ? text : text[..8000];
    }

    private static void Walk(JsonElement node, int depth, List<string> errors, ref int count, bool inline)
    {
        count++;
        if (depth > 30 || errors.Count > 20)
        {
            errors.Add("Das Dokument ist zu tief verschachtelt.");
            return;
        }

        if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty("type", out var typeElement))
        {
            errors.Add("Ein Inhaltselement ist ungültig.");
            return;
        }

        var type = typeElement.GetString() ?? "";
        if (!Nodes.Contains(type))
        {
            errors.Add($"Der Inhaltstyp „{type}“ ist nicht zulässig.");
            return;
        }

        if (node.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String && text.GetString()!.Length > 20_000)
        {
            errors.Add("Ein Textabschnitt ist zu lang.");
        }

        if (type == "heading" && (!TryAttr(node, "level", out var level) || level is < 1 or > 3))
        {
            errors.Add("Überschriften dürfen nur die Ebenen 1 bis 3 verwenden.");
        }

        if (type == "codeBlock" && node.TryGetProperty("attrs", out var codeAttrs) && codeAttrs.ValueKind == JsonValueKind.Object
            && codeAttrs.TryGetProperty("language", out var language) && language.ValueKind == JsonValueKind.String)
        {
            var value = language.GetString() ?? "";
            if (value.Length > 40 || value.Any(ch => !(char.IsLetterOrDigit(ch) || ch is '-' or '+')))
            {
                errors.Add("Die Sprache eines Codeblocks ist ungültig.");
            }
        }

        if (type == "artifactLink")
        {
            var id = AttrString(node, "artifactId");
            var label = AttrString(node, "label") ?? "";
            if (!Guid.TryParse(id, out _) || label.Length > 200)
            {
                errors.Add("Ein interner Artefaktlink ist ungültig.");
            }
        }

        if (node.TryGetProperty("marks", out var marks) && marks.ValueKind == JsonValueKind.Array)
        {
            foreach (var mark in marks.EnumerateArray())
            {
                var markType = mark.TryGetProperty("type", out var markTypeElement) ? markTypeElement.GetString() : null;
                if (markType is null || !Marks.Contains(markType))
                {
                    errors.Add("Eine Textauszeichnung ist nicht zulässig.");
                    continue;
                }

                if (markType == "link")
                {
                    var href = mark.TryGetProperty("attrs", out var attrs) && attrs.TryGetProperty("href", out var hrefElement)
                        ? hrefElement.GetString()
                        : null;
                    if (!IsSafeHref(href))
                    {
                        errors.Add("Ein Link verwendet ein nicht zulässiges Ziel.");
                    }
                }
            }
        }

        if (!node.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
        {
            return;
        }

        foreach (var child in content.EnumerateArray())
        {
            Walk(child, depth + 1, errors, ref count, inline: type is "paragraph" or "heading");
        }
    }

    private static bool TryAttr(JsonElement node, string name, out int value)
    {
        value = 0;
        return node.TryGetProperty("attrs", out var attrs)
            && attrs.ValueKind == JsonValueKind.Object
            && attrs.TryGetProperty(name, out var property)
            && property.TryGetInt32(out value);
    }

    private static string? AttrString(JsonElement node, string name)
    {
        if (!node.TryGetProperty("attrs", out var attrs) || attrs.ValueKind != JsonValueKind.Object || !attrs.TryGetProperty(name, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : null;
    }

    public static bool IsSafeHref(string? href)
    {
        if (string.IsNullOrWhiteSpace(href) || href.Length > 2000)
        {
            return false;
        }

        if (href.StartsWith('/') && !href.StartsWith("//") && !href.Contains('\\'))
        {
            return true;
        }

        return Uri.TryCreate(href, UriKind.Absolute, out var uri)
            && uri.Scheme is "http" or "https" or "mailto";
    }

    private static void Collect(JsonElement node, List<Guid> ids)
    {
        if (node.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        if (node.TryGetProperty("type", out var type) && type.GetString() == "artifactLink")
        {
            var id = node.TryGetProperty("attrs", out var attrs) && attrs.TryGetProperty("artifactId", out var value)
                ? value.GetString()
                : null;
            if (Guid.TryParse(id, out var parsed))
            {
                ids.Add(parsed);
            }
        }

        if (node.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in content.EnumerateArray())
            {
                Collect(child, ids);
            }
        }
    }

    private static void CollectText(JsonElement node, List<string> parts)
    {
        if (node.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        if (node.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
        {
            parts.Add(text.GetString() ?? "");
        }

        if (node.TryGetProperty("type", out var type) && type.GetString() == "artifactLink"
            && node.TryGetProperty("attrs", out var attrs) && attrs.TryGetProperty("label", out var label)
            && label.ValueKind == JsonValueKind.String)
        {
            parts.Add(label.GetString() ?? "");
        }

        if (node.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in content.EnumerateArray())
            {
                CollectText(child, parts);
            }
        }
    }
}

public static class SearchText
{
    public static string Build(params string?[] parts)
    {
        var text = string.Join('\n', parts.Where(part => !string.IsNullOrWhiteSpace(part)).Select(part => part!.Trim()));
        return text.Length <= 8000 ? text : text[..8000];
    }
}

public static class TextInput
{
    public static string? Required(string? value, string label, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return $"{label} ist erforderlich.";
        }

        if (value.Trim().Length > max)
        {
            return $"{label} darf höchstens {max} Zeichen haben.";
        }

        return null;
    }

    public static string? Optional(string? value, string label, int max)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        return value.Trim().Length > max ? $"{label} darf höchstens {max} Zeichen haben." : null;
    }

    public static List<string> Tags(IEnumerable<string>? tags, List<string> errors)
    {
        var result = new List<string>();
        foreach (var tag in tags ?? [])
        {
            var value = tag.Trim();
            if (value.Length is < 2 or > 30 || value.Any(ch => !(char.IsLetterOrDigit(ch) || ch is ' ' or '-' or '_')))
            {
                errors.Add("Tags bestehen aus 2 bis 30 Buchstaben, Ziffern, Leerzeichen oder Bindestrichen.");
                break;
            }

            if (result.Any(existing => string.Equals(existing, value, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            result.Add(value);
        }

        if (result.Count > 8)
        {
            errors.Add("Eine Anforderung kann höchstens acht Tags haben.");
        }

        return result;
    }
}
