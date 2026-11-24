using System.Security.Cryptography;
using System.IO.Compression;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator;

public sealed class InvalidDefinitionException(IReadOnlyList<string> errors)
    : Exception("Invalid app definition: " + string.Join(" | ", errors))
{
    public IReadOnlyList<string> Errors { get; } = errors;
}

/// <summary>Generates a complete, runnable ASP.NET Core Web API project from an AppDefinition.</summary>
public sealed class ProjectGenerator
{
    private readonly bool _realSecrets;

    /// <param name="realSecrets">
    /// true (downloads): every generated project gets its own random JWT key and admin password.
    /// false (previews): readable placeholders, so no secret is ever shown on screen.
    /// </param>
    public ProjectGenerator(bool realSecrets = true) => _realSecrets = realSecrets;

    public IReadOnlyList<GeneratedFile> Generate(AppDefinition app)
    {
        var errors = AppDefinitionValidator.Validate(app);
        if (errors.Count > 0) throw new InvalidDefinitionException(errors);

        var (package, version, useCall, connection) = Provider(app);
        var ns = app.Namespace;
        var files = new List<GeneratedFile>();

        files.AddRange(new EntityGenerator().Generate(app));

        var entities = app.Entities.Select(e => new
        {
            e.Name,
            Plural = Naming.Plural(e.Name),
            UniqueFields = e.Fields.Where(f => f.Unique).Select(f => f.Name).ToList(),
            DecimalFields = e.Fields.Where(f => f.Type == FieldType.Decimal).Select(f => f.Name).ToList()
        }).ToList();

        // With access control the menu comes from the modules, so the simple database menu is only used without it.
        var simpleMenu = app.DynamicMenu && !app.AccessControl;
        files.Add(new("Domain/Role.cs", Tpl.Render(AcTpl.RoleEntity, new { Ns = ns, app.AccessControl })));
        files.Add(new("Data/AppDbContext.cs", Tpl.Render(Tpl.DbContext, new { Ns = ns, Entities = entities, DynamicMenu = simpleMenu, app.AccessControl })));
        files.Add(new("PagedResult.cs", Tpl.Render(Tpl.PagedResult, new { Ns = ns })));
        files.Add(new("Controllers/AuthController.cs", Tpl.Render(Tpl.AuthController, new { Ns = ns })));
        var menuSeed = simpleMenu ? MenuSeed.Default(app).ToList() : [];
        var acSeed = app.AccessControl
            ? AccessControlSeed.Default(app).Select(m => new { m.Name, m.Slug, m.Icon, m.Order, m.ForUser, Subs = m.Subs.Select(s => new { s.Name, s.Key, s.Route, s.Icon, s.Order, Actions = s.Actions.ToList() }).ToList() }).ToList()
            : [];
        files.Add(new("Data/DbSeeder.cs", Tpl.Render(Tpl.DbSeeder, new { Ns = ns, DynamicMenu = simpleMenu, app.AccessControl, MenuItems = menuSeed, Modules = acSeed })));
        if (app.AccessControl)
        {
            files.Add(new("Domain/AccessControl.cs", Tpl.Render(AcTpl.Domain, new { Ns = ns })));
            files.Add(new("Security/PermissionService.cs", Tpl.Render(AcTpl.Infrastructure, new { Ns = ns })));
            files.Add(new("Controllers/AccessControlController.cs", Tpl.Render(AcTpl.Controller, new { Ns = ns })));
        }
        if (simpleMenu)
        {
            files.Add(new("Domain/MenuItem.cs", Tpl.Render(Tpl.MenuItem, new { Ns = ns })));
            files.Add(new("Controllers/MenuController.cs", Tpl.Render(Tpl.MenuController, new { Ns = ns })));
        }
        foreach (var e in entities)
            files.Add(new($"Controllers/{e.Plural}Controller.cs",
                Tpl.Render(Tpl.Controller, new { Ns = ns, e.Name, e.Plural, Route = e.Plural.ToLowerInvariant(), app.AccessControl })));
        foreach (var def in app.Entities)
            files.Add(new($"Dtos/{def.Name}Dto.cs", Tpl.Render(Tpl.Dto, new { Ns = ns, def.Name, Props = DtoProps(def) })));

        files.Add(new("Program.cs", Tpl.Render(Tpl.Program, new { Ns = ns, UseCall = useCall, app.AccessControl })));
        files.Add(new($"{ns}.csproj", Tpl.Render(Tpl.Csproj, new { Ns = ns, ProviderPackage = package, ProviderVersion = version })));
        var jwtKey = _realSecrets ? Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)) : "PREVIEW-ONLY-the-real-key-is-generated-on-download";
        // Aa1! guarantees Identity's default password rules; the hex tail is 64 bits of randomness.
        var adminPassword = _realSecrets ? "Aa1!" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)) : "PREVIEW-ONLY";
        files.Add(new("appsettings.json", AppSettings(connection, ns, jwtKey, adminPassword)));

        var withDocker = app.Targets.HasFlag(Targets.Docker);
        var withWeb = app.Targets.HasFlag(Targets.WebApp);
        if (withDocker)
        {
            files.Add(new("Dockerfile", Tpl.Render(Tpl.Dockerfile, new { Ns = ns })));
            files.Add(new(".dockerignore", "bin/\nobj/\n*.db\n"));
        }
        files.Add(new(".gitignore", "bin/\nobj/\n*.db\n"));

        // Layout: api/ (ASP.NET Core), web/ (Angular, optional), plus shared files at the root.
        var all = files.Select(f => new GeneratedFile("api/" + f.Path, f.Content)).ToList();
        if (withWeb) all.AddRange(WebAppGenerator.Generate(app).Select(f => new GeneratedFile("web/" + f.Path, f.Content)));
        if (withDocker) all.Add(new("docker-compose.yml", Compose(app, withWeb)));
        all.Add(new(".gitignore", "*.db\n.env\n"));
        all.Add(new("README.md", Readme(app, withWeb, withDocker)));
        all.Add(new("app-definition.json", AppDefinitionSerializer.ToJson(app)));
        return all;
    }

    /// <summary>Writes the generated project into a ZIP (all entries under a single folder).</summary>
    public byte[] ToZip(AppDefinition app)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var f in Generate(app))
            {
                var entry = zip.CreateEntry($"{app.Namespace}/{f.Path}");
                using var w = new StreamWriter(entry.Open());
                w.Write(f.Content);
            }
        return ms.ToArray();
    }

    public void WriteTo(AppDefinition app, string directory)
    {
        foreach (var f in Generate(app))
        {
            var full = Path.Combine(directory, f.Path);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            File.WriteAllText(full, f.Content);
        }
    }

    private static (string Package, string Version, string UseCall, string Connection) Provider(AppDefinition app) =>
        app.Database switch
        {
            DbProvider.Sqlite => ("Microsoft.EntityFrameworkCore.Sqlite", "10.*", "UseSqlite", "Data Source=app.db"),
            DbProvider.SqlServer => ("Microsoft.EntityFrameworkCore.SqlServer", "10.*", "UseSqlServer",
                $"Server=localhost,1433;Database={app.Namespace};User Id=sa;Password=Your_strong_Passw0rd;TrustServerCertificate=True"),
            DbProvider.PostgreSql => ("Npgsql.EntityFrameworkCore.PostgreSQL", "10.*", "UseNpgsql",
                $"Host=localhost;Database={app.Namespace.ToLowerInvariant()};Username=postgres;Password=postgres"),
            _ => throw new NotSupportedException($"{app.Database} is planned for Phase 2.")
        };

    private static List<DtoProp> DtoProps(EntityDefinition e)
    {
        var props = new List<DtoProp>();
        foreach (var f in e.Fields)
        {
            var t = Naming.CsType(f.Type);
            var isString = t == "string";
            var attrs = new List<string>();
            if (f.Required && isString) attrs.Add("[Required]");
            if (f.MaxLength is > 0 && isString) attrs.Add($"[MaxLength({f.MaxLength})]");
            if (f.Type == FieldType.Email) attrs.Add("[EmailAddress]");
            var nullable = f.Required ? "" : "?";
            var init = f.Required && isString ? " = default!;" : "";
            props.Add(new DtoProp(f.Name, $"public {t}{nullable} {f.Name} {{ get; set; }}{init}", attrs));
        }
        foreach (var r in e.Relations)
        {
            var name = r.Name + "Id";
            props.Add(new DtoProp(name, $"public Guid{(r.Required ? "" : "?")} {name} {{ get; set; }}", []));
        }
        return props;
    }

    private sealed record DtoProp(string Name, string Decl, List<string> Attrs);

    private static string AppSettings(string connection, string ns, string jwtKey, string adminPassword) => $$"""
        {
          "ConnectionStrings": { "Default": "{{connection}}" },
          "Jwt": { "Key": "{{jwtKey}}", "Issuer": "{{ns}}", "Audience": "{{ns}}" },
          "Seed": { "AdminEmail": "admin@example.com", "AdminPassword": "{{adminPassword}}" },
          "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } },
          "AllowedHosts": "*"
        }
        """;

    private const string WebService = """
          web:
            build: ./web
            depends_on: [api]
            ports: ["8081:80"]
        """;

    private static string Compose(AppDefinition app, bool withWeb)
    {
        var name = app.Namespace.ToLowerInvariant();
        var web = withWeb ? "\n" + WebService.Replace("\r\n", "\n") : "";

        return app.Database switch
        {
            DbProvider.SqlServer => $"""
                services:
                  db:
                    image: mcr.microsoft.com/mssql/server:2022-latest
                    environment:
                      ACCEPT_EULA: "Y"
                      MSSQL_SA_PASSWORD: "Your_strong_Passw0rd"
                    ports: ["1433:1433"]
                  api:
                    build: ./api
                    depends_on: [db]
                    environment:
                      ConnectionStrings__Default: "Server=db,1433;Database={app.Namespace};User Id=sa;Password=Your_strong_Passw0rd;TrustServerCertificate=True"
                    ports: ["8080:8080"]{web}
                """,
            DbProvider.PostgreSql => $"""
                services:
                  db:
                    image: postgres:16
                    environment:
                      POSTGRES_PASSWORD: postgres
                      POSTGRES_DB: {name}
                    ports: ["5432:5432"]
                  api:
                    build: ./api
                    depends_on: [db]
                    environment:
                      ConnectionStrings__Default: "Host=db;Database={name};Username=postgres;Password=postgres"
                    ports: ["8080:8080"]{web}
                """,
            _ => $"""
                services:
                  api:
                    build: ./api
                    environment:
                      ConnectionStrings__Default: "Data Source=/data/app.db"
                    volumes: ["appdata:/data"]
                    ports: ["8080:8080"]{web}
                volumes:
                  appdata:
                """
        };
    }

    private static string Readme(AppDefinition app, bool withWeb, bool withDocker)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"# {app.Name}");
        sb.AppendLine();
        sb.AppendLine($"Generated by ProjectBuilder. ASP.NET Core Web API ({app.Database}) with Swagger, JWT login and roles"
            + (withWeb ? ", plus an Angular web app." : "."));
        sb.AppendLine();
        sb.AppendLine("```");
        sb.AppendLine("api/   ASP.NET Core Web API (C#)");
        if (withWeb) sb.AppendLine("web/   Angular web app");
        if (withDocker) sb.AppendLine("docker-compose.yml   runs everything together");
        sb.AppendLine("```");
        sb.AppendLine();
        sb.AppendLine("## Run locally");
        sb.AppendLine("```");
        sb.AppendLine("cd api");
        sb.AppendLine("dotnet run --urls http://localhost:5000     # Swagger at http://localhost:5000/swagger");
        sb.AppendLine("```");
        if (withWeb)
        {
            sb.AppendLine("In a second terminal (needs Node.js 20.19+, 22.12+ or 24+):");
            sb.AppendLine("```");
            sb.AppendLine("cd web");
            sb.AppendLine("npm install");
            sb.AppendLine("npm start                                  # http://localhost:4200 (proxies /api to port 5000)");
            sb.AppendLine("```");
        }
        if (withDocker)
        {
            sb.AppendLine();
            sb.AppendLine("## Run with Docker");
            sb.AppendLine("```");
            sb.AppendLine("docker compose up --build");
            sb.AppendLine("```");
            sb.AppendLine("API + Swagger: http://localhost:8080/swagger" + (withWeb ? "  |  Web app: http://localhost:8081" : ""));
        }
        sb.AppendLine();
        sb.AppendLine("## Logging in");
        sb.AppendLine("Every API endpoint except `POST /api/auth/login` requires a JWT" + (withWeb ? "; the web app shows a login page." : "."));
        sb.AppendLine("1. First run creates an **Admin** account. Its email and one-time password are in `api/appsettings.json` (`Seed` section). Change the password after first login.");
        sb.AppendLine("2. In Swagger call `POST /api/auth/login`, copy the `token`, click **Authorize** and paste it.");
        sb.AppendLine("3. Admins can create more users with `POST /api/auth/register` (role `Admin` or `User`). Only Admins can delete records.");
        sb.AppendLine();
        if (app.AccessControl)
        {
            sb.AppendLine("## Roles, menus and permissions");
            sb.AppendLine("Access is managed in the database and from the web app's **Administration** screens (Admins only):");
            sb.AppendLine("- **System modules** are the main menu; each has **sub-modules** (the submenu, one per screen). Open a module to see its sub-modules, and a sub-module to see its permissions.");
            sb.AppendLine("- A **permission** is named like `students.create`. Add several to a sub-module at once with *Add permissions in bulk*. Every entity starts with View, Create, Edit and Delete.");
            sb.AppendLine("- **Roles** hold the permissions. *Menu permission* decides which menus a role sees; *Role permission* decides what it may do. Both can be assigned together on a role's assign page.");
            sb.AppendLine("- The API enforces the permissions (`[HasPermission(\"students.delete\")]`), and the menu is built from the modules assigned to the user's roles. Admin can always do everything.");
            sb.AppendLine("- The built-in **User** role starts with every permission except Delete. Give a user a role when you register them: `POST /api/auth/register` with the role name.");
            sb.AppendLine();
        }
        sb.AppendLine("## Entities");
        foreach (var e in app.Entities)
            sb.AppendLine($"- {e.Name}  ->  /api/{Naming.Plural(e.Name).ToLowerInvariant()}");
        sb.AppendLine();
        sb.AppendLine("## Before production");
        sb.AppendLine("- `api/appsettings.json` contains a freshly generated JWT signing key and admin password. Do not commit it to a public repository;");
        sb.AppendLine("  move them to environment variables (`Jwt__Key`, `Seed__AdminPassword`) or a secret store, and use HTTPS.");
        sb.AppendLine("- Replace the sample database connection string / passwords the same way.");
        sb.AppendLine("- The API calls `EnsureCreated()` on startup. Switch to EF Core migrations for schema changes.");
        if (withWeb)
            sb.AppendLine("- Deploying the web app separately? Edit `web/public/config.json` (`apiBaseUrl`) to point at your API, and allow that origin with CORS in the API.");
        return sb.ToString();
    }
}
