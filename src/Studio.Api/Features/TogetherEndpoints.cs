namespace Studio.Api.Features;

public static class TogetherEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapPost("/projects/{projectId:guid}/presence", Presence);
    }

    private static async Task<IResult> Presence(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, PresenceRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var now = clock.GetUtcNow();
        var user = await db.Users.AsNoTracking().FirstAsync(item => item.Id == gate.UserId, ct);
        var label = string.IsNullOrWhiteSpace(body.Label) ? "Im Projekt" : body.Label.Trim();
        if (label.Length > 160) label = label[..160];
        Guid? artifactId = body.ArtifactId is Guid requested && await db.Artifacts.AnyAsync(item => item.ProjectId == projectId && item.Id == requested, ct)
            ? requested
            : null;
        var presence = await db.ProjectPresences.FirstOrDefaultAsync(item => item.ProjectId == projectId && item.UserId == gate.UserId, ct);
        if (presence is null)
        {
            presence = new ProjectPresence { ProjectId = projectId, UserId = gate.UserId };
            db.ProjectPresences.Add(presence);
        }

        presence.DisplayName = user.DisplayName;
        presence.Label = label;
        presence.ArtifactId = artifactId;
        presence.SeenAt = now;
        await db.SaveChangesAsync(ct);
        var stale = now.AddDays(-1);
        await db.ProjectPresences.Where(item => item.ProjectId == projectId && item.SeenAt < stale).ExecuteDeleteAsync(ct);
        var since = now.AddSeconds(-20);
        var people = await db.ProjectPresences.AsNoTracking()
            .Where(item => item.ProjectId == projectId && item.UserId != gate.UserId && item.SeenAt >= since)
            .OrderBy(item => item.DisplayName)
            .Select(item => new PresencePerson(item.UserId, item.DisplayName, item.Label, item.ArtifactId))
            .ToListAsync(ct);
        var revision = await db.Projects.AsNoTracking().Where(item => item.Id == projectId).Select(item => item.ContentRevision).FirstAsync(ct);
        return Results.Ok(new TogetherResponse(revision, people));
    }
}
