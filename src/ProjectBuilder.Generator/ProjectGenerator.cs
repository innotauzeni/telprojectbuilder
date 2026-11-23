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

        files.Add(new("Data/AppDbContext.cs", Tpl.Render(Tpl.DbContext, new { Ns = ns, Entities = entities })));
        files.Add(new("PagedResult.cs", Tpl.Render(Tpl.PagedResult, new { Ns = ns })));
        files.Add(new("Controllers/AuthController.cs", Tpl.Render(Tpl.AuthController, new { Ns = ns })));
        files.Add(new("Data/DbSeeder.cs", Tpl.Render(Tpl.DbSeeder, new { Ns = ns })));
        foreach (var e in entities)
            files.Add(new($"Controllers/{e.Plural}Controller.cs",
                Tpl.Render(Tpl.Controller, new { Ns = ns, e.Name, e.Plural, Route = e.Plural.ToLowerInvariant() })));
        foreach (var def in app.Entities)
            files.Add(new($"Dtos/{def.Name}Dto.cs", Tpl.Render(Tpl.Dto, new { Ns = ns, def.Name, Props = DtoProps(def) })));

        files.Add(new("Program.cs", Tpl.Render(Tpl.Program, new { Ns = ns, UseCall = useCall })));
        files.Add(new($"{ns}.csproj", Tpl.Render(Tpl.Csproj, new { Ns = ns, ProviderPackage = package, ProviderVersion = version })));
        var jwtKey = _realSecrets ? Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)) : "PREVIEW-ONLY-the-real-key-is-generated-on-download";
        // Aa1! guarantees Identity's default password rules; the hex tail is 64 bits of randomness.
        var adminPassword = _realSecrets ? "Aa1!" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)) : "PREVIEW-ONLY";
        files.Add(new("appsettings.json", AppSettings(connection, ns, jwtKey, adminPassword)));

        if (app.Targets.HasFlag(Targets.Docker))
        {
            files.Add(new("Dockerfile", Tpl.Render(Tpl.Dockerfile, new { Ns = ns })));
            files.Add(new("docker-compose.yml", Compose(app, connection)));
            files.Add(new(".dockerignore", "bin/\nobj/\n*.db\n"));
        }

        files.Add(new(".gitignore", "bin/\nobj/\n*.db\n"));
        files.Add(new("README.md", Readme(app)));
        files.Add(new("app-definition.json", AppDefinitionSerializer.ToJson(app)));
        return files;
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

    private static string Compose(AppDefinition app, string localConnection)
    {
        var name = app.Namespace.ToLowerInvariant();
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
                    build: .
                    depends_on: [db]
                    environment:
                      ConnectionStrings__Default: "Server=db,1433;Database={app.Namespace};User Id=sa;Password=Your_strong_Passw0rd;TrustServerCertificate=True"
                    ports: ["8080:8080"]
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
                    build: .
                    depends_on: [db]
                    environment:
                      ConnectionStrings__Default: "Host=db;Database={name};Username=postgres;Password=postgres"
                    ports: ["8080:8080"]
                """,
            _ => """
                services:
                  api:
                    build: .
                    environment:
                      ConnectionStrings__Default: "Data Source=/data/app.db"
                    volumes: ["appdata:/data"]
                    ports: ["8080:8080"]
                volumes:
                  appdata:
                """
        };
    }

    private static string Readme(AppDefinition app) => $"""
        # {app.Name}

        Generated by ProjectBuilder. ASP.NET Core Web API ({app.Database}) with Swagger, JWT login and roles.

        ## Run locally
        ```
        dotnet run
        ```
        Open the URL printed in the console; `/` redirects to Swagger UI.

        ## Run with Docker
        ```
        docker compose up --build
        ```
        Swagger: http://localhost:8080/swagger

        ## Logging in
        Every endpoint except `POST /api/auth/login` requires a JWT.
        1. First run creates an **Admin** account. Its email and one-time password are in `appsettings.json` (`Seed` section). Change the password after first login.
        2. In Swagger call `POST /api/auth/login`, copy the `token`, click **Authorize** and paste it.
        3. Admins can create more users with `POST /api/auth/register` (role `Admin` or `User`). Only Admins can delete records.

        ## Entities
        {string.Join("\n", app.Entities.Select(e => $"- {e.Name}  ->  /api/{Naming.Plural(e.Name).ToLowerInvariant()}"))}

        ## Before production
        - `appsettings.json` contains a freshly generated JWT signing key and admin password. Do not commit it to a public repository;
          move them to environment variables (`Jwt__Key`, `Seed__AdminPassword`) or a secret store, and use HTTPS.
        - Replace the sample database connection string / passwords the same way.
        - The app calls `EnsureCreated()` on startup. Switch to EF Core migrations for schema changes.
        """;
}
