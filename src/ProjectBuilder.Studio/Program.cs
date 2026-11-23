using ProjectBuilder.Core;
using ProjectBuilder.Generator;
using ProjectBuilder.Studio.Components;
using ProjectBuilder.Studio.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();
builder.Services.AddSingleton<ProjectStore>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();

app.UseAntiforgery();

app.MapStaticAssets();

// Download the generated project as a ZIP.
app.MapGet("/download/{id:guid}", (Guid id, ProjectStore store) =>
{
    var def = store.Get(id);
    if (def is null) return Results.NotFound();
    try
    {
        var zip = new ProjectGenerator().ToZip(def);
        return Results.File(zip, "application/zip", $"{def.Namespace}.zip");
    }
    catch (InvalidDefinitionException ex)
    {
        return Results.BadRequest(new { errors = ex.Errors });
    }
});

PreviewApi.Map(app);

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
