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
        foreach (var e in entities)
            files.Add(new($"Controllers/{e.Plural}Controller.cs",
                Tpl.Render(Tpl.Controller, new { Ns = ns, e.Name, e.Plural, Route = e.Plural.ToLowerInvariant() })));

        files.Add(new("Program.cs", Tpl.Render(Tpl.Program, new { Ns = ns, UseCall = useCall })));
        files.Add(new($"{ns}.csproj", Tpl.Render(Tpl.Csproj, new { Ns = ns, ProviderPackage = package, ProviderVersion = version })));
        files.Add(new("appsettings.json", AppSettings(connection)));

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

    private static string AppSettings(string connection) => $$"""
        {
          "ConnectionStrings": { "Default": "{{connection}}" },
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

        Generated by ProjectBuilder. ASP.NET Core Web API ({app.Database}) with Swagger.

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

        ## Entities
        {string.Join("\n", app.Entities.Select(e => $"- {e.Name}  ->  /api/{Naming.Plural(e.Name).ToLowerInvariant()}"))}

        ## Before production
        - Replace the sample connection string / passwords (use environment variables or a secret store).
        - The app calls `EnsureCreated()` on startup. Switch to EF Core migrations for schema changes.
        - Add authentication/authorization before exposing the API publicly.
        """;
}
