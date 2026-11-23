using System.Text.Json.Serialization;
using ProjectBuilder.Core;
using ProjectBuilder.Generator;
using ProjectBuilder.Studio.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton<ProjectStore>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
    app.UseHsts();

app.UseDefaultFiles();
app.UseStaticFiles();

// ---- Studio API (consumed by the Angular app in src/studio-web) ----
var api = app.MapGroup("/api");

api.MapGet("/templates", (ProjectStore s) => s.Templates());
api.MapGet("/projects", (ProjectStore s) => s.List());

api.MapPost("/projects", (CreateProjectRequest? req, ProjectStore s) =>
{
    try { return Results.Ok(new { id = s.Create(req?.TemplateKey) }); }
    catch (ArgumentException) { return Results.BadRequest(new { errors = new[] { "Unknown template." } }); }
});

api.MapGet("/projects/{id:guid}", (Guid id, ProjectStore s) =>
    s.Get(id) is { } def ? Results.Ok(def) : Results.NotFound());

api.MapPut("/projects/{id:guid}", (Guid id, AppDefinition def, ProjectStore s) =>
{
    if (s.Get(id) is null) return Results.NotFound();
    s.Save(id, def); // drafts may be invalid; validation is enforced when previewing/downloading
    return Results.NoContent();
});

api.MapDelete("/projects/{id:guid}", (Guid id, ProjectStore s) => { s.Delete(id); return Results.NoContent(); });

api.MapPost("/validate", (AppDefinition def) => new { errors = AppDefinitionValidator.Validate(def) });

// Generated files for the "Generated code" preview. Secrets are placeholders here, never real ones.
api.MapGet("/projects/{id:guid}/files", (Guid id, ProjectStore s) =>
{
    var def = s.Get(id);
    if (def is null) return Results.NotFound();
    try { return Results.Ok(new ProjectGenerator(realSecrets: false).Generate(def)); }
    catch (InvalidDefinitionException ex) { return Results.BadRequest(new { errors = ex.Errors }); }
});

// Download the generated project as a ZIP (real, per-download secrets).
app.MapGet("/download/{id:guid}", (Guid id, ProjectStore s) =>
{
    var def = s.Get(id);
    if (def is null) return Results.NotFound();
    try { return Results.File(new ProjectGenerator().ToZip(def), "application/zip", $"{def.Namespace}.zip"); }
    catch (InvalidDefinitionException ex) { return Results.BadRequest(new { errors = ex.Errors }); }
});

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
