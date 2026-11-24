using ProjectBuilder.Core;

namespace ProjectBuilder.Studio.Services;

public sealed record ProjectSummary(Guid Id, string Name, int EntityCount, DateTime UpdatedUtc);
public sealed record TemplateInfo(string Key, string Name, int EntityCount);

public sealed class ProjectLimitException(int max) : Exception($"You can have at most {max} projects. Delete one to create another.");

/// <summary>
/// File-based project storage, one folder per user: &lt;data&gt;/projects/&lt;userId&gt;/&lt;projectId&gt;.json.
/// Every method takes the signed-in user's id, so one user can never read or change another user's project.
/// Ids are parsed as GUIDs and re-formatted here, so user input never reaches a file path.
/// </summary>
public sealed class ProjectStore
{
    public const int MaxProjectsPerUser = 50;

    private readonly string _root;
    private readonly string _templateDir;

    /// <summary>The folder that holds all Studio data (projects and the accounts database).</summary>
    public static string DataRoot(IConfiguration config, string contentRoot) =>
        config["Studio:DataDir"]
        ?? Environment.GetEnvironmentVariable("STUDIO_DATA_DIR")
        ?? Path.Combine(contentRoot, "App_Data");

    public ProjectStore(IConfiguration config, IWebHostEnvironment env)
    {
        _root = Path.Combine(DataRoot(config, env.ContentRootPath), "projects");
        _templateDir = Path.Combine(AppContext.BaseDirectory, "templates");
        Directory.CreateDirectory(_root);
    }

    private string UserDir(string userId)
    {
        if (!Guid.TryParse(userId, out var uid)) throw new ArgumentException("Invalid user id.");
        var dir = Path.Combine(_root, uid.ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private string PathFor(string userId, Guid id) => Path.Combine(UserDir(userId), id.ToString("N") + ".json");

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

    public IReadOnlyList<ProjectSummary> List(string userId)
    {
        var list = new List<ProjectSummary>();
        foreach (var file in Directory.GetFiles(UserDir(userId), "*.json"))
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

    /// <summary>Returns the user's project, or null if it does not exist or belongs to someone else.</summary>
    public AppDefinition? Get(string userId, Guid id)
    {
        var path = PathFor(userId, id);
        return File.Exists(path) ? AppDefinitionSerializer.FromJson(File.ReadAllText(path)) : null;
    }

    public void Save(string userId, Guid id, AppDefinition def) =>
        File.WriteAllText(PathFor(userId, id), AppDefinitionSerializer.ToJson(def));

    public void Delete(string userId, Guid id)
    {
        var path = PathFor(userId, id);
        if (File.Exists(path)) File.Delete(path);
    }

    /// <summary>Creates a project from a template key (file name without extension), or blank when null.</summary>
    public Guid Create(string userId, string? templateKey)
    {
        if (Directory.GetFiles(UserDir(userId), "*.json").Length >= MaxProjectsPerUser)
            throw new ProjectLimitException(MaxProjectsPerUser);

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
        Save(userId, id, def);
        return id;
    }
}
