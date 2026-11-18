using Microsoft.EntityFrameworkCore.Design;

namespace Studio.Api.Data;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Port=5432;Database=studio;Username=studio;Password=studio", npgsql => npgsql.MigrationsHistoryTable(AppDbContext.MigrationsHistoryTable))
            .UseSnakeCaseNamingConvention()
            .Options;
        return new AppDbContext(options);
    }
}
