using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using ProjectBuilder.Core;
using ProjectBuilder.Generator;
using ProjectBuilder.Studio.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton<ProjectStore>();
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 2_000_000); // designs are small; refuse huge bodies

// ---- accounts: ASP.NET Core Identity (SQLite) + a secure HttpOnly cookie session ----
var dataRoot = ProjectStore.DataRoot(builder.Configuration, builder.Environment.ContentRootPath);
Directory.CreateDirectory(dataRoot);
builder.Services.AddDbContext<StudioDb>(o => o.UseSqlite($"Data Source={Path.Combine(dataRoot, "studio.db")}"));
builder.Services.AddIdentity<IdentityUser, IdentityRole>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Password.RequiredLength = 8;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
    })
    .AddEntityFrameworkStores<StudioDb>();
builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "pb.auth";
    o.Cookie.HttpOnly = true;                              // not readable from JavaScript
    o.Cookie.SameSite = SameSiteMode.Lax;                  // not sent on cross-site POSTs
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest; // behind HTTPS the cookie is Secure (see README for proxies)
    o.ExpireTimeSpan = TimeSpan.FromDays(14);
    o.SlidingExpiration = true;
    // An API: answer 401/403 instead of redirecting to a login page.
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();

// Slow down password guessing and sign-up spam: 20 attempts per minute per address.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<StudioDb>().Database.EnsureCreated();

if (!app.Environment.IsDevelopment())
    app.UseHsts();

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// CSRF defence for cookie sessions: state-changing /api calls must carry a custom header. Browsers cannot add it
// on a cross-site request without a CORS preflight, which this server never allows.
app.Use(async (ctx, next) =>
{
    var m = ctx.Request.Method;
    var safe = HttpMethods.IsGet(m) || HttpMethods.IsHead(m) || HttpMethods.IsOptions(m);
    if (!safe && ctx.Request.Path.StartsWithSegments("/api") && ctx.Request.Headers["X-Requested-With"] != "ProjectBuilder")
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsJsonAsync(new { errors = new[] { "Missing X-Requested-With header." } });
        return;
    }
    await next();
});

string Uid(ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new UnauthorizedAccessException();

// ---- accounts ----
var account = app.MapGroup("/api/account");

account.MapPost("/register", async (RegisterRequest req, UserManager<IdentityUser> users, SignInManager<IdentityUser> signIn, IConfiguration config) =>
{
    if (config.GetValue("Studio:AllowRegistration", true) is false)
        return Results.Json(new { errors = new[] { "Registration is closed on this server." } }, statusCode: StatusCodes.Status403Forbidden);
    if (!new EmailAddressAttribute().IsValid(req.Email) || req.Email.Length > 200)
        return Results.BadRequest(new { errors = new[] { "Enter a valid email address." } });

    var user = new IdentityUser { UserName = req.Email.Trim(), Email = req.Email.Trim() };
    var result = await users.CreateAsync(user, req.Password ?? "");
    if (!result.Succeeded)
        return Results.BadRequest(new { errors = result.Errors.Select(e => e.Description).ToArray() });

    await signIn.SignInAsync(user, isPersistent: true);
    return Results.Ok(new { email = user.Email });
}).RequireRateLimiting("auth");

account.MapPost("/login", async (LoginRequest req, UserManager<IdentityUser> users, SignInManager<IdentityUser> signIn) =>
{
    var user = await users.FindByEmailAsync(req.Email ?? "");
    if (user is null) return Results.Json(new { errors = new[] { "Invalid email or password." } }, statusCode: StatusCodes.Status401Unauthorized);

    var result = await signIn.PasswordSignInAsync(user, req.Password ?? "", isPersistent: true, lockoutOnFailure: true);
    if (result.IsLockedOut)
        return Results.Json(new { errors = new[] { "Too many failed attempts. Try again in a few minutes." } }, statusCode: StatusCodes.Status429TooManyRequests);
    return result.Succeeded
        ? Results.Ok(new { email = user.Email })
        : Results.Json(new { errors = new[] { "Invalid email or password." } }, statusCode: StatusCodes.Status401Unauthorized);
}).RequireRateLimiting("auth");

account.MapPost("/logout", async (SignInManager<IdentityUser> signIn) =>
{
    await signIn.SignOutAsync();
    return Results.NoContent();
});

account.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new { email = user.FindFirstValue(ClaimTypes.Email) ?? user.Identity?.Name }))
    .RequireAuthorization();

// ---- Studio API (consumed by the Angular app in src/studio-web); everything needs a signed-in user ----
var api = app.MapGroup("/api").RequireAuthorization();

api.MapGet("/templates", (ProjectStore s) => s.Templates());
api.MapGet("/projects", (ClaimsPrincipal u, ProjectStore s) => s.List(Uid(u)));

api.MapPost("/projects", (CreateProjectRequest? req, ClaimsPrincipal u, ProjectStore s) =>
{
    try { return Results.Ok(new { id = s.Create(Uid(u), req?.TemplateKey) }); }
    catch (ArgumentException) { return Results.BadRequest(new { errors = new[] { "Unknown template." } }); }
    catch (ProjectLimitException ex) { return Results.Json(new { errors = new[] { ex.Message } }, statusCode: StatusCodes.Status409Conflict); }
});

api.MapGet("/projects/{id:guid}", (Guid id, ClaimsPrincipal u, ProjectStore s) =>
    s.Get(Uid(u), id) is { } def ? Results.Ok(def) : Results.NotFound());

api.MapPut("/projects/{id:guid}", (Guid id, AppDefinition def, ClaimsPrincipal u, ProjectStore s) =>
{
    if (s.Get(Uid(u), id) is null) return Results.NotFound();
    s.Save(Uid(u), id, def); // drafts may be invalid; validation is enforced when previewing/downloading
    return Results.NoContent();
});

api.MapDelete("/projects/{id:guid}", (Guid id, ClaimsPrincipal u, ProjectStore s) => { s.Delete(Uid(u), id); return Results.NoContent(); });

api.MapPost("/validate", (AppDefinition def) => new { errors = AppDefinitionValidator.Validate(def) });

// Generated files for the "Generated files" preview. Secrets are placeholders here, never real ones.
api.MapGet("/projects/{id:guid}/files", (Guid id, ClaimsPrincipal u, ProjectStore s) =>
{
    var def = s.Get(Uid(u), id);
    if (def is null) return Results.NotFound();
    try { return Results.Ok(new ProjectGenerator(realSecrets: false).Generate(def)); }
    catch (InvalidDefinitionException ex) { return Results.BadRequest(new { errors = ex.Errors }); }
});

// Download the generated project as a ZIP (real, per-download secrets).
app.MapGet("/download/{id:guid}", (Guid id, ClaimsPrincipal u, ProjectStore s) =>
{
    var def = s.Get(Uid(u), id);
    if (def is null) return Results.NotFound();
    try { return Results.File(new ProjectGenerator().ToZip(def), "application/zip", $"{def.Namespace}.zip"); }
    catch (InvalidDefinitionException ex) { return Results.BadRequest(new { errors = ex.Errors }); }
}).RequireAuthorization();

PreviewApi.Map(app);

// Angular single-page app: any other GET returns index.html (built into wwwroot, see README).
app.MapFallback(async ctx =>
{
    var index = Path.Combine(app.Environment.WebRootPath ?? "", "index.html");
    if (File.Exists(index))
    {
        ctx.Response.ContentType = "text/html; charset=utf-8";
        await ctx.Response.SendFileAsync(index);
    }
    else
    {
        ctx.Response.StatusCode = 503;
        ctx.Response.ContentType = "text/plain; charset=utf-8";
        await ctx.Response.WriteAsync(
            "The Studio web app has not been built yet.\n\n" +
            "  cd src/studio-web\n  npm install\n  npm run build\n\n" +
            "Then restart (or refresh). For live development run `npm start` in src/studio-web instead.");
    }
});

app.Run();

public sealed record CreateProjectRequest(string? TemplateKey);
public sealed record RegisterRequest(string Email, string Password);
public sealed record LoginRequest(string Email, string Password);

// Lets the integration tests start the app in memory.
public partial class Program;
