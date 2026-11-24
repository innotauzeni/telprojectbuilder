using System.Text.Json;
using System.Text.RegularExpressions;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator;

/// <summary>
/// Generates the Angular web app: a fixed, readable template (login, dashboard, list/form pages, menu editor)
/// plus one generated file, <c>public/entities.json</c>, describing the user's entities. The app reads that file
/// at startup, so labels and fields can be changed after deployment without rebuilding.
/// </summary>
public static class WebAppGenerator
{
    private const string Prefix = "AngularTemplate/";
    public const string EntitiesPath = "public/entities.json";

    public static IEnumerable<GeneratedFile> Generate(AppDefinition app)
    {
        var asm = typeof(WebAppGenerator).Assembly;
        var slug = Regex.Replace(app.Name.Trim().ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');

        foreach (var resource in asm.GetManifestResourceNames().Select(n => (Raw: n, Name: n.Replace('\\', '/')))
                     .Where(n => n.Name.StartsWith(Prefix, StringComparison.Ordinal)).OrderBy(n => n.Name, StringComparer.Ordinal))
        {
            var path = resource.Name[Prefix.Length..];
            if (path == EntitiesPath) continue; // replaced below
            using var stream = asm.GetManifestResourceStream(resource.Raw)!;
            using var reader = new StreamReader(stream);
            yield return new GeneratedFile(path, reader.ReadToEnd().Replace("__APP_NAME__", app.Name).Replace("__APP_SLUG__", slug));
        }

        yield return new GeneratedFile(EntitiesPath, EntitiesJson(app));
    }

    /// <summary>The system description the web app loads at startup (also served by the Studio preview).</summary>
    public static string EntitiesJson(AppDefinition app)
    {
        var entities = app.Entities.Select(e => new
        {
            name = e.Name,
            label = Naming.Humanize(e.Name),
            plural = Naming.Humanize(Naming.Plural(e.Name)),
            route = Naming.Plural(e.Name).ToLowerInvariant(),
            display = DisplayField(e),
            icon = MenuSeed.IconFor(e.Name),
            fields = e.Fields.Select(f => new
            {
                key = OpenApiGenerator.CamelCase(f.Name),
                label = Naming.Humanize(f.Name),
                type = f.Type.ToString(),
                required = f.Required,
                maxLength = f.MaxLength is > 0 ? f.MaxLength : null
            }),
            relations = e.Relations.Select(r => new
            {
                key = OpenApiGenerator.CamelCase(r.Name) + "Id",
                label = Naming.Humanize(r.Name),
                target = r.TargetEntity,
                required = r.Required
            })
        });

        return JsonSerializer.Serialize(new { appName = app.Name, dynamicMenu = app.DynamicMenu || app.AccessControl, accessControl = app.AccessControl, entities },
            new JsonSerializerOptions
            {
                WriteIndented = true,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
            });
    }

    /// <summary>The field shown to people when a record is referenced (dropdowns, relation columns).</summary>
    private static string DisplayField(EntityDefinition e)
    {
        var textual = e.Fields.Where(f => f.Type is FieldType.String or FieldType.Text or FieldType.Email or FieldType.Phone).ToList();
        var pick = textual.FirstOrDefault(f => f.Required) ?? textual.FirstOrDefault() ?? e.Fields.FirstOrDefault();
        return pick is null ? "id" : OpenApiGenerator.CamelCase(pick.Name);
    }
}
