namespace Studio.Api.Domain;

public static class SourceRules
{
    public static SourceState State(DateTimeOffset? checkedAt, string? checkedTarget, string target) =>
        checkedAt is null || string.IsNullOrEmpty(checkedTarget)
            ? SourceState.Ungeprueft
            : string.Equals(checkedTarget, target, StringComparison.Ordinal)
                ? SourceState.Geprueft
                : SourceState.ErneutPruefen;

    public static bool IsSafeTarget(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 2000)
        {
            return false;
        }

        var text = value.Trim();
        if (text.Contains('\\') || text.Contains('\n') || text.Contains('\r'))
        {
            return false;
        }

        if (Uri.TryCreate(text, UriKind.Absolute, out var uri))
        {
            return uri.Scheme is "http" or "https";
        }

        if (text.Contains(':') || text.StartsWith("//", StringComparison.Ordinal))
        {
            return false;
        }

        return !text.Split('/', StringSplitOptions.RemoveEmptyEntries).Contains("..");
    }

    public static string Destination(string target)
    {
        if (Uri.TryCreate(target, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
        {
            var path = uri.AbsolutePath == "/" ? "" : uri.AbsolutePath;
            return uri.Host + path;
        }

        return target;
    }
}
