using Microsoft.AspNetCore.Identity.EntityFrameworkCore;

namespace Studio.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options)
{
    public const string MigrationsHistoryTable = "__ef_migrations_history";
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMembership> Memberships => Set<ProjectMembership>();
    public DbSet<ProjectCounter> ProjectCounters => Set<ProjectCounter>();
    public DbSet<Artifact> Artifacts => Set<Artifact>();
    public DbSet<Requirement> Requirements => Set<Requirement>();
    public DbSet<Diagram> Diagrams => Set<Diagram>();
    public DbSet<DiagramNode> DiagramNodes => Set<DiagramNode>();
    public DbSet<DiagramEdge> DiagramEdges => Set<DiagramEdge>();
    public DbSet<Component> Components => Set<Component>();
    public DbSet<Screen> Screens => Set<Screen>();
    public DbSet<ScreenNavigation> ScreenNavigations => Set<ScreenNavigation>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentRevision> DocumentRevisions => Set<DocumentRevision>();
    public DbSet<ArtifactLink> ArtifactLinks => Set<ArtifactLink>();
    public DbSet<Area> Areas => Set<Area>();
    public DbSet<SavedView> SavedViews => Set<SavedView>();
    public DbSet<ChangePackage> ChangePackages => Set<ChangePackage>();
    public DbSet<ChangePackageItem> ChangePackageItems => Set<ChangePackageItem>();
    public DbSet<PackageComment> PackageComments => Set<PackageComment>();
    public DbSet<PackageDecision> PackageDecisions => Set<PackageDecision>();
    public DbSet<ProjectSnapshot> ProjectSnapshots => Set<ProjectSnapshot>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.HasPostgresExtension("pg_trgm");

        builder.Entity<Project>(b =>
        {
            b.Property(x => x.Name).HasMaxLength(160);
            b.Property(x => x.Description).HasMaxLength(4000);
            b.HasIndex(x => x.UpdatedAt);
        });

        builder.Entity<ProjectMembership>(b =>
        {
            b.Property(x => x.Role).HasConversion<string>().HasMaxLength(32);
            b.HasIndex(x => new { x.ProjectId, x.UserId }).IsUnique();
            b.HasOne(x => x.Project).WithMany(x => x.Memberships).HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<ProjectCounter>(b =>
        {
            b.HasKey(x => x.ProjectId);
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Artifact>(b =>
        {
            b.Property(x => x.Type).HasConversion<string>().HasMaxLength(32);
            b.HasAlternateKey(x => new { x.Id, x.ProjectId });
            b.HasIndex(x => new { x.ProjectId, x.Type });
            b.HasOne(x => x.Project).WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Requirement>(b =>
        {
            b.HasKey(x => x.ArtifactId);
            b.Property(x => x.Key).HasMaxLength(32);
            b.Property(x => x.Title).HasMaxLength(200);
            b.Property(x => x.Description).HasMaxLength(20000);
            b.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.Priority).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.SearchText).HasMaxLength(8000);
            b.HasIndex(x => new { x.ProjectId, x.Key }).IsUnique();
            b.HasIndex(x => x.SearchText).HasMethod("gin").HasOperators("gin_trgm_ops");
            b.HasOne(x => x.Artifact).WithOne().HasForeignKey<Requirement>(x => new { x.ArtifactId, x.ProjectId })
                .HasPrincipalKey<Artifact>(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Diagram>(b =>
        {
            b.HasKey(x => x.ArtifactId);
            b.HasAlternateKey(x => new { x.ArtifactId, x.ProjectId });
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.Name).HasMaxLength(160);
            b.Property(x => x.Description).HasMaxLength(4000);
            b.Property(x => x.SearchText).HasMaxLength(8000);
            b.HasIndex(x => new { x.ProjectId, x.Kind });
            b.HasIndex(x => x.AreaId);
            b.HasIndex(x => x.SearchText).HasMethod("gin").HasOperators("gin_trgm_ops");
            b.HasOne(x => x.Artifact).WithOne().HasForeignKey<Diagram>(x => new { x.ArtifactId, x.ProjectId })
                .HasPrincipalKey<Artifact>(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<Area>().WithMany().HasForeignKey(x => x.AreaId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Component>(b =>
        {
            b.HasKey(x => x.ArtifactId);
            b.HasAlternateKey(x => new { x.ArtifactId, x.ProjectId });
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.Name).HasMaxLength(160);
            b.Property(x => x.Description).HasMaxLength(4000);
            b.Property(x => x.Technology).HasMaxLength(80);
            b.Property(x => x.SearchText).HasMaxLength(8000);
            b.HasIndex(x => x.SearchText).HasMethod("gin").HasOperators("gin_trgm_ops");
            b.HasOne(x => x.Artifact).WithOne().HasForeignKey<Component>(x => new { x.ArtifactId, x.ProjectId })
                .HasPrincipalKey<Artifact>(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<DiagramNode>(b =>
        {
            b.HasKey(x => x.ArtifactId);
            b.HasAlternateKey(x => new { x.ArtifactId, x.DiagramId, x.ProjectId });
            b.Property(x => x.NodeType).HasMaxLength(32);
            b.Property(x => x.Title).HasMaxLength(160);
            b.Property(x => x.Description).HasMaxLength(4000);
            b.Property(x => x.EventName).HasMaxLength(200);
            b.Property(x => x.SearchText).HasMaxLength(8000);
            b.HasIndex(x => x.DiagramId);
            b.HasIndex(x => x.ComponentId);
            b.HasIndex(x => x.SearchText).HasMethod("gin").HasOperators("gin_trgm_ops");
            b.HasOne(x => x.Artifact).WithOne().HasForeignKey<DiagramNode>(x => new { x.ArtifactId, x.ProjectId })
                .HasPrincipalKey<Artifact>(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Diagram).WithMany(x => x.Nodes).HasForeignKey(x => new { x.DiagramId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Component).WithMany().HasForeignKey(x => new { x.ComponentId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.ProjectId }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<DiagramEdge>(b =>
        {
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.Label).HasMaxLength(200);
            b.Property(x => x.Condition).HasMaxLength(200);
            b.Property(x => x.Protocol).HasMaxLength(80);
            b.HasIndex(x => x.DiagramId);
            b.HasOne<Diagram>().WithMany(x => x.Edges).HasForeignKey(x => new { x.DiagramId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<DiagramNode>().WithMany().HasForeignKey(x => new { x.SourceNodeId, x.DiagramId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.DiagramId, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<DiagramNode>().WithMany().HasForeignKey(x => new { x.TargetNodeId, x.DiagramId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.DiagramId, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Screen>(b =>
        {
            b.HasKey(x => x.ArtifactId);
            b.HasAlternateKey(x => new { x.ArtifactId, x.ProjectId });
            b.Property(x => x.Name).HasMaxLength(160);
            b.Property(x => x.Route).HasMaxLength(200);
            b.Property(x => x.Purpose).HasMaxLength(2000);
            b.Property(x => x.Notes).HasMaxLength(8000);
            b.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.WireframeJson).HasColumnType("jsonb");
            b.Property(x => x.SearchText).HasMaxLength(8000);
            b.HasIndex(x => x.SearchText).HasMethod("gin").HasOperators("gin_trgm_ops");
            b.HasOne(x => x.Artifact).WithOne().HasForeignKey<Screen>(x => new { x.ArtifactId, x.ProjectId })
                .HasPrincipalKey<Artifact>(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ScreenNavigation>(b =>
        {
            b.Property(x => x.ElementId).HasMaxLength(64);
            b.HasIndex(x => new { x.SourceScreenId, x.ElementId }).IsUnique();
            b.HasOne<Screen>().WithMany().HasForeignKey(x => new { x.SourceScreenId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<Screen>().WithMany().HasForeignKey(x => new { x.TargetScreenId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Document>(b =>
        {
            b.HasKey(x => x.ArtifactId);
            b.HasAlternateKey(x => new { x.ArtifactId, x.ProjectId });
            b.Property(x => x.Title).HasMaxLength(200);
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.ContentJson).HasColumnType("jsonb");
            b.Property(x => x.SearchText).HasMaxLength(8000);
            b.HasIndex(x => new { x.ProjectId, x.ParentId });
            b.HasIndex(x => x.SearchText).HasMethod("gin").HasOperators("gin_trgm_ops");
            b.HasOne(x => x.Artifact).WithOne().HasForeignKey<Document>(x => new { x.ArtifactId, x.ProjectId })
                .HasPrincipalKey<Artifact>(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Parent).WithMany().HasForeignKey(x => new { x.ParentId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.ProjectId }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<DocumentRevision>(b =>
        {
            b.Property(x => x.Title).HasMaxLength(200);
            b.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.AuthorName).HasMaxLength(160);
            b.Property(x => x.ContentJson).HasColumnType("jsonb");
            b.HasIndex(x => new { x.DocumentId, x.Number }).IsUnique();
            b.HasOne<Document>().WithMany().HasForeignKey(x => new { x.DocumentId, x.ProjectId })
                .HasPrincipalKey(x => new { x.ArtifactId, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ArtifactLink>(b =>
        {
            b.Property(x => x.Relation).HasConversion<string>().HasMaxLength(32);
            b.Property(x => x.Rationale).HasMaxLength(500);
            b.HasIndex(x => new { x.SourceArtifactId, x.TargetArtifactId, x.Relation }).IsUnique();
            b.HasIndex(x => new { x.ProjectId, x.SourceArtifactId });
            b.HasIndex(x => new { x.ProjectId, x.TargetArtifactId, x.Relation });
            b.ToTable(table => table.HasCheckConstraint("ck_artifact_links_no_self", "source_artifact_id <> target_artifact_id"));
            b.HasOne<Artifact>().WithMany().HasForeignKey(x => new { x.SourceArtifactId, x.ProjectId })
                .HasPrincipalKey(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<Artifact>().WithMany().HasForeignKey(x => new { x.TargetArtifactId, x.ProjectId })
                .HasPrincipalKey(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Area>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(160);
            b.Property(x => x.Description).HasMaxLength(2000);
            b.HasIndex(x => new { x.ProjectId, x.Name }).IsUnique();
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<SavedView>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(160);
            b.Property(x => x.Scope).HasMaxLength(32);
            b.Property(x => x.Query).HasMaxLength(200);
            b.HasIndex(x => new { x.ProjectId, x.Name }).IsUnique();
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Area>().WithMany().HasForeignKey(x => x.AreaId).OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<ChangePackage>(b =>
        {
            b.Property(x => x.Title).HasMaxLength(160);
            b.Property(x => x.Goal).HasMaxLength(4000);
            b.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            b.HasIndex(x => new { x.ProjectId, x.UpdatedAt });
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Area>().WithMany().HasForeignKey(x => x.AreaId).OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<ChangePackageItem>(b =>
        {
            b.Property(x => x.ArtifactType).HasMaxLength(32);
            b.Property(x => x.ArtifactTitle).HasMaxLength(240);
            b.Property(x => x.Note).HasMaxLength(80);
            b.HasIndex(x => new { x.PackageId, x.ArtifactId }).IsUnique();
            b.HasOne<ChangePackage>().WithMany().HasForeignKey(x => x.PackageId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<PackageComment>(b =>
        {
            b.Property(x => x.TargetType).HasMaxLength(32);
            b.Property(x => x.TargetTitle).HasMaxLength(240);
            b.Property(x => x.AuthorName).HasMaxLength(160);
            b.Property(x => x.Text).HasMaxLength(4000);
            b.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            b.HasIndex(x => new { x.ProjectId, x.ArtifactId, x.Status });
            b.HasOne<ChangePackage>().WithMany().HasForeignKey(x => x.PackageId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<PackageDecision>(b =>
        {
            b.Property(x => x.Action).HasMaxLength(32);
            b.Property(x => x.Reason).HasMaxLength(2000);
            b.Property(x => x.ActorName).HasMaxLength(160);
            b.HasOne<ChangePackage>().WithMany().HasForeignKey(x => x.PackageId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<ProjectSnapshot>(b =>
        {
            b.Property(x => x.Name).HasMaxLength(160);
            b.Property(x => x.Scope).HasMaxLength(32);
            b.Property(x => x.CreatedByName).HasMaxLength(160);
            b.Property(x => x.ContentHash).HasMaxLength(64);
            b.Property(x => x.PayloadJson).HasColumnType("text");
            b.HasIndex(x => new { x.ProjectId, x.CreatedAt });
            b.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<ChangePackage>().WithMany().HasForeignKey(x => x.PackageId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
