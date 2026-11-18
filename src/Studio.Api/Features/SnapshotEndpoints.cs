namespace Studio.Api.Features;

public static class SnapshotEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/projects/{projectId:guid}/snapshots", List);
        group.MapPost("/projects/{projectId:guid}/snapshots", Create);
        group.MapGet("/projects/{projectId:guid}/snapshot-compare", Compare);
        group.MapGet("/projects/{projectId:guid}/snapshots/{snapshotId:guid}", Detail);
    }

    private static async Task<IResult> List(ProjectGuard guard, AppDbContext db, Guid projectId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var items = await db.ProjectSnapshots.AsNoTracking().Where(item => item.ProjectId == projectId)
            .OrderByDescending(item => item.CreatedAt)
            .Select(item => new SnapshotSummary(item.Id, item.Name, item.Scope, item.PackageId, item.CreatedByName, item.CreatedAt))
            .ToListAsync(ct);
        return Results.Ok(items);
    }

    private static async Task<IResult> Create(ProjectGuard guard, AppDbContext db, TimeProvider clock, Guid projectId, CreateSnapshotRequest body, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Write, ct);
        if (gate.Failed) return gate.Error!;
        if (TextInput.Required(body.Name, "Name", 160) is string error) return Problems.BadRequest(http, error);
        var document = await SnapshotCapture.Project(db, projectId, ct);
        var author = await db.Users.AsNoTracking().FirstAsync(item => item.Id == gate.UserId, ct);
        var snapshot = new ProjectSnapshot
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Name = body.Name.Trim(),
            Scope = "project",
            CreatedById = gate.UserId,
            CreatedByName = author.DisplayName,
            CreatedAt = clock.GetUtcNow(),
            ContentHash = SnapshotJson.Hash(document),
            PayloadJson = SnapshotJson.Serialize(document),
        };
        db.ProjectSnapshots.Add(snapshot);
        var saved = await DbSave.SaveAsync(db, http, ct);
        return saved ?? Results.Created($"/api/v1/projects/{projectId}/snapshots/{snapshot.Id}", new SnapshotSummary(snapshot.Id, snapshot.Name, snapshot.Scope, null, snapshot.CreatedByName, snapshot.CreatedAt));
    }

    private static async Task<IResult> Detail(ProjectGuard guard, AppDbContext db, Guid projectId, Guid snapshotId, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var snapshot = await db.ProjectSnapshots.AsNoTracking().FirstOrDefaultAsync(item => item.ProjectId == projectId && item.Id == snapshotId, ct);
        if (snapshot is null) return Problems.NotFound(http);
        var document = SnapshotJson.Deserialize(snapshot.PayloadJson);
        var ids = document.Artifacts.Where(item => item.Type != "edge").Select(item => item.Id).ToArray();
        var live = (await ArtifactCatalog.Labels(db, projectId, ids, ct)).Keys.ToList();
        return Results.Ok(new SnapshotDetailResponse(snapshot.Id, snapshot.Name, snapshot.Scope, snapshot.PackageId, snapshot.CreatedByName, snapshot.CreatedAt, document, live));
    }

    private static async Task<IResult> Compare(ProjectGuard guard, AppDbContext db, Guid projectId, Guid left, Guid right, HttpContext http, CancellationToken ct)
    {
        var gate = await guard.Require(http.User, projectId, Access.Read, ct);
        if (gate.Failed) return gate.Error!;
        var snapshots = await db.ProjectSnapshots.AsNoTracking().Where(item => item.ProjectId == projectId && (item.Id == left || item.Id == right)).ToListAsync(ct);
        var older = snapshots.FirstOrDefault(item => item.Id == left);
        var newer = snapshots.FirstOrDefault(item => item.Id == right);
        if (older is null || newer is null) return Problems.NotFound(http);
        if (older.Scope != newer.Scope || older.PackageId != newer.PackageId)
        {
            return Problems.BadRequest(http, "Verglichen werden nur Stände desselben Projekts und desselben Umfangs.");
        }

        var changes = SnapshotDiff.Compare(SnapshotJson.Deserialize(older.PayloadJson), SnapshotJson.Deserialize(newer.PayloadJson));
        return Results.Ok(new CompareResponse(left, right, changes));
    }
}
