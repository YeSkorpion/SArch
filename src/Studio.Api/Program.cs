using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Studio.Api.Features;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Database");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("Die Datenbankverbindung fehlt. Setze ConnectionStrings__Database.");
}

builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
    options.Limits.MaxRequestBodySize = 1_500_000;
});

var secureCookies = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
var keyPath = Environment.GetEnvironmentVariable("DATA_PROTECTION_KEYS");
if (!string.IsNullOrWhiteSpace(keyPath))
{
    Directory.CreateDirectory(keyPath);
    builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keyPath));
}

if (string.Equals(Environment.GetEnvironmentVariable("STUDIO_BEHIND_PROXY"), "true", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
    });
}

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable(AppDbContext.MigrationsHistoryTable))
        .UseSnakeCaseNamingConvention());
builder.Services.AddScoped<ProjectGuard>();
builder.Services.AddIdentity<AppUser, IdentityRole<Guid>>(options =>
{
    options.Password.RequiredLength = 12;
    options.Password.RequireDigit = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = true;
    options.User.RequireUniqueEmail = true;
    options.SignIn.RequireConfirmedEmail = false;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
    options.Lockout.AllowedForNewUsers = true;
}).AddEntityFrameworkStores<AppDbContext>().AddDefaultTokenProviders();
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "Studio.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = secureCookies;
    options.SlidingExpiration = true;
    options.ExpireTimeSpan = TimeSpan.FromHours(12);
    options.Events.OnRedirectToLogin = context => WriteStatus(context.Response, StatusCodes.Status401Unauthorized, "Anmeldung erforderlich", "Bitte melde dich an.");
    options.Events.OnRedirectToAccessDenied = context => WriteStatus(context.Response, StatusCodes.Status403Forbidden, "Keine Berechtigung", "Dafür fehlt die erforderliche Projektrolle.");
});
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "Studio.Csrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = secureCookies;
});
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
});
var permit = builder.Configuration.GetValue("Studio:LoginPermitLimit", builder.Environment.IsDevelopment() ? 100 : 10);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (context, token) => new ValueTask(WriteStatus(context.HttpContext.Response, StatusCodes.Status429TooManyRequests, "Zu viele Versuche", "Zu viele Anmeldeversuche. Bitte warte einen Moment."));
    options.AddPolicy("login", httpContext => RateLimitPartition.GetFixedWindowLimiter(
        httpContext.Connection.RemoteIpAddress?.ToString() ?? "lokal",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = Math.Max(1, permit), Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.Configure<JsonOptions>(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

var app = builder.Build();
if (args.Contains("--migrate"))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    return;
}

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (builder.Configuration.GetValue<bool>("Studio:ApplyMigrations"))
    {
        await db.Database.MigrateAsync();
    }
    else
    {
        var pending = await db.Database.GetPendingMigrationsAsync();
        if (pending.Any())
        {
            throw new InvalidOperationException("Die Datenbank ist nicht aktuell. Führe den Migrationsschritt aus.");
        }
    }

    await DemoSeed.ApplyAsync(scope.ServiceProvider, app.Environment, app.Logger);
}

if (string.Equals(Environment.GetEnvironmentVariable("STUDIO_BEHIND_PROXY"), "true", StringComparison.OrdinalIgnoreCase))
{
    app.UseForwardedHeaders();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
    app.UseHsts();
}

app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
    var correlationId = context.Items["CorrelationId"]?.ToString();
    app.Logger.LogError(feature?.Error, "Unbehandelte Ausnahme {CorrelationId} {Method} {Path}", correlationId, context.Request.Method, context.Request.Path);
    await WriteStatus(context.Response, StatusCodes.Status500InternalServerError, "Unerwarteter Fehler", "Die Aktion konnte nicht ausgeführt werden.");
}));
app.Use(async (context, next) =>
{
    var incoming = context.Request.Headers["X-Correlation-ID"].ToString();
    var correlationId = Guid.TryParse(incoming, out _) ? incoming : Guid.NewGuid().ToString("N");
    context.Items["CorrelationId"] = correlationId;
    context.Response.Headers["X-Correlation-ID"] = correlationId;
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
    }

    using (app.Logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
    {
        await next();
    }
});
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapOpenApi().AllowAnonymous();
app.MapGet("/health", async (AppDbContext db, CancellationToken ct) =>
{
    var ready = await db.Database.CanConnectAsync(ct);
    return ready ? Results.Ok(new { status = "ok" }) : Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
}).AllowAnonymous();

var api = app.MapGroup("/api/v1").AddEndpointFilter<CsrfFilter>();
AuthEndpoints.Map(api);
ProjectEndpoints.Map(api);
TogetherEndpoints.Map(api);
RequirementEndpoints.Map(api);
DiagramEndpoints.Map(api);
PlanningEndpoints.Map(api);
DocumentEndpoints.Map(api);
TraceEndpoints.Map(api);
OrganizationEndpoints.Map(api);
UsageEndpoints.Map(api);
PackageEndpoints.Map(api);
SnapshotEndpoints.Map(api);
TransferEndpoints.Map(api);
PlanEndpoints.Map(api);
        ProjectWorkEndpoints.Map(api);
app.Run();

static Task WriteStatus(HttpResponse response, int status, string title, string detail)
{
    response.StatusCode = status;
    return response.WriteAsJsonAsync(new { title, status, detail });
}

public sealed class CsrfFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var method = context.HttpContext.Request.Method;
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method))
        {
            return await next(context);
        }

        try
        {
            await antiforgery.ValidateRequestAsync(context.HttpContext);
        }
        catch (AntiforgeryValidationException)
        {
            return Problems.BadRequest(context.HttpContext, "Die Anfrage konnte nicht bestätigt werden. Lade die Seite neu.");
        }

        return await next(context);
    }
}

public partial class Program;
