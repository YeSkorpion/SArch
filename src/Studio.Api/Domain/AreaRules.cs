namespace Studio.Api.Domain;

public static class AreaRules
{
    public static bool CreatesCycle(Guid areaId, Guid? newParentId, IReadOnlyDictionary<Guid, Guid?> parentById)
    {
        var current = newParentId;
        var seen = new HashSet<Guid>();
        while (current is Guid id)
        {
            if (id == areaId || !seen.Add(id))
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
}
