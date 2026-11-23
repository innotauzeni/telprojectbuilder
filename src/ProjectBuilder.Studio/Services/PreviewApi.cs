using System.Collections.Concurrent;
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

    public static void Map(WebApplication app)
    {
        app.MapGet("/preview/{id:guid}/openapi.json", (Guid id, HttpRequest req, ProjectStore store) =>
        {
            var def = store.Get(id);
            if (def is null) return Results.NotFound();
            try { return Results.Content(OpenApiGenerator.Generate(def, $"/preview/{id}"), "application/json"); }
            catch (InvalidDefinitionException ex) { return Results.BadRequest(new { errors = ex.Errors }); }
        });

        app.MapGet("/preview/{id:guid}/swagger", (Guid id) => Results.Content(SwaggerHtml(id), "text/html"));

        var api = app.MapGroup("/preview/{id:guid}/api/{resource}");

        api.MapGet("", (Guid id, string resource, ProjectStore s, int page = 1, int pageSize = 20) =>
            With(s, id, resource, (e, list) =>
            {
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

        api.MapGet("{itemId:guid}", (Guid id, string resource, Guid itemId, ProjectStore s) =>
            With(s, id, resource, (e, list) =>
            {
                lock (list)
                    return list.FirstOrDefault(x => x["id"]!.GetValue<Guid>() == itemId) is { } hit
                        ? Results.Ok(hit.DeepClone()) : Results.NotFound();
            }));

        api.MapPost("", async (Guid id, string resource, HttpRequest req, ProjectStore s) =>
        {
            var body = await ReadBody(req);
            return With(s, id, resource, (e, list) =>
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

        api.MapPut("{itemId:guid}", async (Guid id, string resource, Guid itemId, HttpRequest req, ProjectStore s) =>
        {
            var body = await ReadBody(req);
            return With(s, id, resource, (e, list) =>
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

        api.MapDelete("{itemId:guid}", (Guid id, string resource, Guid itemId, ProjectStore s) =>
            With(s, id, resource, (e, list) =>
            {
                lock (list)
                    return list.RemoveAll(x => x["id"]!.GetValue<Guid>() == itemId) > 0 ? Results.NoContent() : Results.NotFound();
            }));
    }

    private static IResult With(ProjectStore store, Guid id, string resource, Func<EntityDefinition, List<JsonObject>, IResult> action)
    {
        var def = store.Get(id);
        var entity = def?.Entities.FirstOrDefault(e => Naming.Plural(e.Name).Equals(resource, StringComparison.OrdinalIgnoreCase));
        if (def is null || entity is null) return Results.NotFound();
        var list = Data.GetOrAdd($"{id:N}/{entity.Name}", _ => []);
        return action(entity, list);
    }

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
