using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text.Json.Nodes;
using ProjectBuilder.Core;
using ProjectBuilder.Generator;

namespace ProjectBuilder.Studio.Services;

/// <summary>
/// Throwaway in-memory API that behaves like the generated one, so the Studio preview's Swagger
/// "Try it out" works without building anything. Data is lost on restart and capped per entity.
/// </summary>
public static class PreviewApi
{
    private const int MaxItemsPerEntity = 500;
    private static readonly ConcurrentDictionary<string, List<JsonObject>> Data = new();

    private static string Uid(ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new UnauthorizedAccessException();

    public static void Map(WebApplication app)
    {
        // Everything under /preview needs a signed-in user and only reaches that user's own projects.
        var g = app.MapGroup("").RequireAuthorization();

        g.MapGet("/preview/{id:guid}/openapi.json", (Guid id, ClaimsPrincipal u, ProjectStore store) =>
        {
            var def = store.Get(Uid(u), id);
            if (def is null) return Results.NotFound();
            try { return Results.Content(OpenApiGenerator.Generate(def, $"/preview/{id}"), "application/json"); }
            catch (InvalidDefinitionException ex) { return Results.BadRequest(new { errors = ex.Errors }); }
        });

        g.MapGet("/preview/{id:guid}/swagger", (Guid id) => Results.Content(SwaggerHtml(id), "text/html"));

        MapWebApp(g, app.Environment.WebRootPath ?? "");
        PreviewAccess.Map(g);

        // Menu for the previewed user (the preview user is an Admin, so every visible entry is shown).
        g.MapGet("/preview/{id:guid}/api/menu", (Guid id, ClaimsPrincipal u, ProjectStore s) =>
            s.Get(Uid(u), id)?.AccessControl == true ? PreviewAccess.Menu(s, u, id) :
            With(s, Uid(u), id, MenuRoute, (e, list) =>
            {
                lock (list)
                    return Results.Ok(list
                        .Where(x => x["isVisible"]?.GetValue<bool>() ?? true)
                        .OrderBy(x => x["sortOrder"]?.GetValue<int>() ?? 0)
                        .Select(x => new JsonObject { ["label"] = x["label"]?.DeepClone(), ["route"] = x["route"]?.DeepClone(), ["icon"] = x["icon"]?.DeepClone() })
                        .ToList());
            }));

        var api = g.MapGroup("/preview/{id:guid}/api/{resource}");

        api.MapGet("", (Guid id, string resource, ClaimsPrincipal u, ProjectStore s, int page = 1, int pageSize = 20) =>
            With(s, Uid(u), id, resource, (e, list) =>
            {
                // Like the real API, the menu editor gets a plain array, not a page.
                if (ReferenceEquals(e, MenuEntity))
                    lock (list) return Results.Ok(list.OrderBy(x => x["sortOrder"]?.GetValue<int>() ?? 0).Select(x => (JsonNode)x.DeepClone()).ToArray());

                page = Math.Max(page, 1);
                pageSize = Math.Clamp(pageSize, 1, 200);
                JsonObject result;
                lock (list)
                    result = new JsonObject
                    {
                        ["items"] = new JsonArray(list.Skip((page - 1) * pageSize).Take(pageSize).Select(x => (JsonNode)x.DeepClone()).ToArray()),
                        ["total"] = list.Count, ["page"] = page, ["pageSize"] = pageSize
                    };
                return Results.Ok(result);
            }));

        api.MapGet("{itemId:guid}", (Guid id, string resource, Guid itemId, ClaimsPrincipal u, ProjectStore s) =>
            With(s, Uid(u), id, resource, (e, list) =>
            {
                lock (list)
                    return list.FirstOrDefault(x => x["id"]!.GetValue<Guid>() == itemId) is { } hit
                        ? Results.Ok(hit.DeepClone()) : Results.NotFound();
            }));

        api.MapPost("", async (Guid id, string resource, HttpRequest req, ClaimsPrincipal u, ProjectStore s) =>
        {
            var body = await ReadBody(req);
            return With(s, Uid(u), id, resource, (e, list) =>
            {
                if (Validate(e, body) is { } err) return err;
                var item = Clean(e, body!);
                item["id"] = Guid.NewGuid();
                lock (list)
                {
                    if (list.Count >= MaxItemsPerEntity)
                        return Results.BadRequest(new { errors = new[] { $"Preview is limited to {MaxItemsPerEntity} records per entity." } });
                    list.Add(item);
                }
                return Results.Created($"/preview/{id}/api/{resource}/{item["id"]}", item.DeepClone());
            });
        });

        api.MapPut("{itemId:guid}", async (Guid id, string resource, Guid itemId, HttpRequest req, ClaimsPrincipal u, ProjectStore s) =>
        {
            var body = await ReadBody(req);
            return With(s, Uid(u), id, resource, (e, list) =>
            {
                if (Validate(e, body) is { } err) return err;
                lock (list)
                {
                    var idx = list.FindIndex(x => x["id"]!.GetValue<Guid>() == itemId);
                    if (idx < 0) return Results.NotFound();
                    var item = Clean(e, body!);
                    item["id"] = itemId;
                    list[idx] = item;
                }
                return Results.NoContent();
            });
        });

        api.MapDelete("{itemId:guid}", (Guid id, string resource, Guid itemId, ClaimsPrincipal u, ProjectStore s) =>
            With(s, Uid(u), id, resource, (e, list) =>
            {
                lock (list)
                    return list.RemoveAll(x => x["id"]!.GetValue<Guid>() == itemId) > 0 ? Results.NoContent() : Results.NotFound();
            }));
    }

    private const string MenuRoute = "menu-items";

    /// <summary>The generated "MenuItem" table, so the menu editor works against the mock exactly like the real API.</summary>
    private static readonly EntityDefinition MenuEntity = new()
    {
        Name = "MenuItem",
        Fields =
        [
            new() { Name = "Label", Required = true },
            new() { Name = "Route", Required = true },
            new() { Name = "Icon" },
            new() { Name = "SortOrder", Type = FieldType.Int },
            new() { Name = "Roles" },
            new() { Name = "IsVisible", Type = FieldType.Bool }
        ]
    };

    private static IResult With(ProjectStore store, string userId, Guid id, string resource, Func<EntityDefinition, List<JsonObject>, IResult> action)
    {
        var def = store.Get(userId, id);
        if (def is null) return Results.NotFound();

        if (resource.Equals(MenuRoute, StringComparison.OrdinalIgnoreCase))
        {
            if (!def.DynamicMenu) return Results.NotFound();
            var menu = Data.GetOrAdd($"{id:N}/{MenuEntity.Name}", _ => MenuSeed.Default(def).Select(m => new JsonObject
            {
                ["id"] = Guid.NewGuid(), ["label"] = m.Label, ["route"] = m.Route, ["icon"] = m.Icon,
                ["sortOrder"] = m.SortOrder, ["roles"] = m.Roles == "" ? null : m.Roles, ["isVisible"] = true
            }).ToList());
            return action(MenuEntity, menu);
        }

        var entity = def.Entities.FirstOrDefault(e => Naming.Plural(e.Name).Equals(resource, StringComparison.OrdinalIgnoreCase));
        if (entity is null) return Results.NotFound();
        var list = Data.GetOrAdd($"{id:N}/{entity.Name}", _ => []);
        return action(entity, list);
    }

    // ---- the real generated Angular web app, served inside the Studio under /preview/{id}/app/ ----

    private static readonly Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider ContentTypes = new();

    private static void MapWebApp(RouteGroupBuilder g, string webRoot)
    {
        var previewApp = Path.Combine(webRoot, "preview-app");

        g.MapGet("/preview/{id:guid}/app/config.json", (Guid id) =>
            Results.Json(new { apiBaseUrl = $"/preview/{id}/api", preview = true }));

        g.MapGet("/preview/{id:guid}/app/entities.json", (Guid id, ClaimsPrincipal u, ProjectStore store) =>
        {
            var def = store.Get(Uid(u), id);
            if (def is null) return Results.NotFound();
            if (AppDefinitionValidator.Validate(def).Count > 0) return Results.BadRequest(new { errors = AppDefinitionValidator.Validate(def) });
            return Results.Content(WebAppGenerator.EntitiesJson(def), "application/json");
        });

        // Everything else: a built file if it exists, otherwise index.html (Angular's router handles the path).
        g.MapGet("/preview/{id:guid}/app/{**path}", async (Guid id, string? path, ClaimsPrincipal u, ProjectStore store) =>
        {
            if (store.Get(Uid(u), id) is null) return Results.NotFound();
            var index = Path.Combine(previewApp, "index.html");
            if (!File.Exists(index))
                return Results.Content(NotBuiltHtml, "text/html; charset=utf-8", statusCode: 503);

            if (!string.IsNullOrEmpty(path))
            {
                var full = Path.GetFullPath(Path.Combine(previewApp, path));
                // never leave the preview-app folder (path traversal)
                if (full.StartsWith(Path.GetFullPath(previewApp) + Path.DirectorySeparatorChar, StringComparison.Ordinal) && File.Exists(full))
                {
                    ContentTypes.TryGetContentType(full, out var type);
                    return Results.File(full, type ?? "application/octet-stream");
                }
            }

            var html = await File.ReadAllTextAsync(index);
            return Results.Content(html.Replace("<base href=\"/\">", $"<base href=\"/preview/{id}/app/\">"), "text/html; charset=utf-8");
        });
    }

    private const string NotBuiltHtml = """
        <!doctype html><meta charset="utf-8"><title>Preview not built</title>
        <body style="font-family:system-ui;max-width:560px;margin:4rem auto;padding:0 1rem;color:#334155">
        <h2>The web app preview has not been built yet</h2>
        <p>Run this once in <code>src/studio-web</code>, then refresh:</p>
        <pre style="background:#f1f5f9;padding:1rem;border-radius:8px">npm install
        npm run build</pre>
        </body>
        """;

    private static async Task<JsonObject?> ReadBody(HttpRequest req)
    {
        try { return await req.ReadFromJsonAsync<JsonObject>(); }
        catch { return null; }
    }

    private static IResult? Validate(EntityDefinition e, JsonObject? body)
    {
        if (body is null) return Results.BadRequest(new { errors = new[] { "Body must be a JSON object." } });
        var missing = new List<string>();
        foreach (var f in e.Fields.Where(f => f.Required))
            if (body[OpenApiGenerator.CamelCase(f.Name)] is null) missing.Add($"'{OpenApiGenerator.CamelCase(f.Name)}' is required.");
        foreach (var r in e.Relations.Where(r => r.Required))
            if (body[OpenApiGenerator.CamelCase(r.Name) + "Id"] is null) missing.Add($"'{OpenApiGenerator.CamelCase(r.Name)}Id' is required.");
        return missing.Count > 0 ? Results.BadRequest(new { errors = missing }) : null;
    }

    /// <summary>Keep only properties declared by the entity.</summary>
    private static JsonObject Clean(EntityDefinition e, JsonObject body)
    {
        var item = new JsonObject();
        var allowed = e.Fields.Select(f => OpenApiGenerator.CamelCase(f.Name))
            .Concat(e.Relations.Select(r => OpenApiGenerator.CamelCase(r.Name) + "Id"));
        foreach (var name in allowed)
            if (body[name] is { } v) item[name] = v.DeepClone();
        return item;
    }

    private static string SwaggerHtml(Guid id) => $$"""
        <!doctype html>
        <html><head><meta charset="utf-8"><title>API preview</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
        </head><body style="margin:0">
        <div id="ui"></div>
        <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
        <script>SwaggerUIBundle({ url: "/preview/{{id}}/openapi.json", dom_id: "#ui", deepLinking: false });</script>
        </body></html>
        """;
}
