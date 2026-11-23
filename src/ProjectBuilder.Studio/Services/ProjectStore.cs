using ProjectBuilder.Core;

namespace ProjectBuilder.Studio.Services;

public sealed record ProjectSummary(Guid Id, string Name, int EntityCount, DateTime UpdatedUtc);
public sealed record TemplateInfo(string Key, string Name, int EntityCount);

/// <summary>
/// v0 persistence: one JSON file per project under App_Data/projects (no accounts yet).
/// Ids are GUIDs generated here, so user input never reaches a file path.
/// </summary>
public sealed class ProjectStore
{
    private readonly string _dir;
    private readonly string _templateDir;

    public ProjectStore(IWebHostEnvironment env)
    {
        _dir = Path.Combine(env.ContentRootPath, "App_Data", "projects");
        _templateDir = Path.Combine(AppContext.BaseDirectory, "templates");
        Directory.CreateDirectory(_dir);
    }

    private string PathFor(Guid id) => Path.Combine(_dir, id.ToString("N") + ".json");

    public IReadOnlyList<TemplateInfo> Templates()
    {
        if (!Directory.Exists(_templateDir)) return [];
        var list = new List<TemplateInfo>();
        foreach (var file in Directory.GetFiles(_templateDir, "*.json").Order())
        {
            try
            {
                var def = AppDefinitionSerializer.FromJson(File.ReadAllText(file));
                list.Add(new TemplateInfo(Path.GetFileNameWithoutExtension(file), def.Name, def.Entities.Count));
            }
            catch { /* ignore broken template files */ }
        }
        return list;
    }

    public IReadOnlyList<ProjectSummary> List()
    {
        var list = new List<ProjectSummary>();
        foreach (var file in Directory.GetFiles(_dir, "*.json"))
        {
            if (!Guid.TryParseExact(Path.GetFileNameWithoutExtension(file), "N", out var id)) continue;
            try
            {
                var def = AppDefinitionSerializer.FromJson(File.ReadAllText(file));
                list.Add(new ProjectSummary(id, def.Name, def.Entities.Count, File.GetLastWriteTimeUtc(file)));
            }
            catch { }
        }
        return list.OrderByDescending(p => p.UpdatedUtc).ToList();
    }

    public AppDefinition? Get(Guid id)
    {
        var path = PathFor(id);
        return File.Exists(path) ? AppDefinitionSerializer.FromJson(File.ReadAllText(path)) : null;
    }

    public void Save(Guid id, AppDefinition def) =>
        File.WriteAllText(PathFor(id), AppDefinitionSerializer.ToJson(def));

    public void Delete(Guid id)
    {
        var path = PathFor(id);
        if (File.Exists(path)) File.Delete(path);
    }

    /// <summary>Creates a project from a template key (file name without extension), or blank when null.</summary>
    public Guid Create(string? templateKey)
    {
        AppDefinition def;
        if (templateKey is null)
            def = new AppDefinition { Name = "My System" };
        else
        {
            // Only accept keys that match an existing template (no path traversal).
            var match = Templates().FirstOrDefault(t => t.Key == templateKey)
                ?? throw new ArgumentException("Unknown template.");
            def = AppDefinitionSerializer.FromJson(File.ReadAllText(Path.Combine(_templateDir, match.Key + ".json")));
        }
        var id = Guid.NewGuid();
        Save(id, def);
        return id;
    }
}
