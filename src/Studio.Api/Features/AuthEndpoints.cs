namespace Studio.Api.Features;

public static class AuthEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/auth/csrf", Csrf).AllowAnonymous();
        group.MapPost("/auth/register", Register).AllowAnonymous();
        group.MapPost("/auth/login", Login).AllowAnonymous().RequireRateLimiting("login");
        group.MapPost("/auth/logout", Logout);
        group.MapGet("/auth/me", Me);
    }

    private static IResult Csrf(IAntiforgery antiforgery, HttpContext http)
    {
        var tokens = antiforgery.GetAndStoreTokens(http);
        return Results.Ok(new { token = tokens.RequestToken });
    }

    private static async Task<IResult> Register(UserManager<AppUser> users, IAntiforgery antiforgery, HttpContext http, RegisterRequest body, CancellationToken ct)
    {
        var errors = new List<string>();
        if (TextInput.Required(body.DisplayName, "Name", 80) is string nameError)
        {
            errors.Add(nameError);
        }

        var email = body.Email?.Trim() ?? "";
        if (email.Length is < 3 or > 200 || !email.Contains('@') || email.Contains(' '))
        {
            errors.Add("Die E-Mail-Adresse ist ungültig.");
        }

        if (string.IsNullOrEmpty(body.Password) || body.Password.Length > 128)
        {
            errors.Add("Das Passwort muss zwischen 12 und 128 Zeichen lang sein.");
        }

        if (errors.Count > 0)
        {
            return Problems.BadRequest(http, [.. errors]);
        }

        var user = new AppUser
        {
            Id = Guid.CreateVersion7(),
            UserName = email,
            Email = email,
            DisplayName = body.DisplayName.Trim(),
            EmailConfirmed = true,
        };
        var created = await users.CreateAsync(user, body.Password);
        if (!created.Succeeded)
        {
            return Problems.BadRequest(http, [.. created.Errors.Select(Translate)]);
        }

        return Results.Ok(Session(antiforgery, http, user));
    }

    private static async Task<IResult> Login(
        SignInManager<AppUser> signIn,
        UserManager<AppUser> users,
        IAntiforgery antiforgery,
        ILoggerFactory loggerFactory,
        HttpContext http,
        LoginRequest body,
        CancellationToken ct)
    {
        var email = body.Email?.Trim() ?? "";
        var result = await signIn.PasswordSignInAsync(email, body.Password ?? "", isPersistent: true, lockoutOnFailure: true);
        if (!result.Succeeded)
        {
            var logger = loggerFactory.CreateLogger("Studio.Auth");
            var existing = await users.FindByEmailAsync(email);
            if (existing is not null && await users.IsLockedOutAsync(existing))
            {
                logger.LogWarning("Anmeldung gesperrt für Benutzer {UserId}", existing.Id);
            }
            else
            {
                logger.LogWarning("Anmeldung fehlgeschlagen");
            }

            return Problems.Status(http, StatusCodes.Status401Unauthorized, "Anmeldung fehlgeschlagen", "Anmeldung fehlgeschlagen.");
        }

        var user = await users.FindByEmailAsync(email);
        return Results.Ok(Session(antiforgery, http, user!));
    }

    private static async Task<IResult> Logout(SignInManager<AppUser> signIn)
    {
        await signIn.SignOutAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Me(UserManager<AppUser> users, IAntiforgery antiforgery, ClaimsPrincipal principal, HttpContext http)
    {
        var user = await users.GetUserAsync(principal);
        return user is null
            ? Problems.Status(http, StatusCodes.Status401Unauthorized, "Anmeldung erforderlich", "Bitte melde dich an.")
            : Results.Ok(Session(antiforgery, http, user));
    }

    private static UserResponse Session(IAntiforgery antiforgery, HttpContext http, AppUser user)
    {
        var tokens = antiforgery.GetAndStoreTokens(http);
        return new UserResponse(user.Id, user.Email ?? "", user.DisplayName, tokens.RequestToken ?? "");
    }

    private static string Translate(IdentityError error) => error.Code switch
    {
        "DuplicateEmail" or "DuplicateUserName" => "Für diese E-Mail-Adresse gibt es bereits ein Konto.",
        "PasswordTooShort" => "Das Passwort muss mindestens 12 Zeichen haben.",
        "PasswordRequiresDigit" => "Das Passwort muss eine Ziffer enthalten.",
        "PasswordRequiresUpper" => "Das Passwort muss einen Großbuchstaben enthalten.",
        "PasswordRequiresLower" => "Das Passwort muss einen Kleinbuchstaben enthalten.",
        "PasswordRequiresNonAlphanumeric" => "Das Passwort muss ein Sonderzeichen enthalten.",
        _ => "Die Eingabe konnte nicht gespeichert werden.",
    };
}
