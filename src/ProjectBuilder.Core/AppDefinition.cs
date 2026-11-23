using System.Text.Json.Serialization;

namespace ProjectBuilder.Core;

/// <summary>Databases the generated system can target (via EF Core providers).</summary>
public enum DbProvider { SqlServer, PostgreSql, MySql, Sqlite, Oracle }

public enum FieldType { String, Text, Int, Long, Decimal, Bool, Date, DateTime, Guid, Email, Phone }

/// <summary>What gets generated for a project.</summary>
[Flags]
public enum Targets
{
    None = 0,
    WebApi = 1,        // ASP.NET Core API + Swagger
    WebApp = 2,        // Blazor / MVC admin UI
    FlutterApp = 4,    // Flutter client from OpenAPI
    Docker = 8,        // Dockerfile + compose
    All = WebApi | WebApp | FlutterApp | Docker
}

public sealed class FieldDefinition
{
    public required string Name { get; init; }
    public FieldType Type { get; init; } = FieldType.String;
    public bool Required { get; init; }
    public int? MaxLength { get; init; }
    public bool Unique { get; init; }
}

public sealed class RelationDefinition
{
    public required string Name { get; init; }          // e.g. "Student"
    public required string TargetEntity { get; init; }  // e.g. "Student"
    public bool Required { get; init; } = true;
}

public sealed class EntityDefinition
{
    public required string Name { get; init; }
    public List<FieldDefinition> Fields { get; init; } = [];
    public List<RelationDefinition> Relations { get; init; } = [];
}

/// <summary>The single source of truth: the Studio edits this, generators consume it.</summary>
public sealed class AppDefinition
{
    public const int CurrentSchemaVersion = 1;

    public int SchemaVersion { get; init; } = CurrentSchemaVersion;
    public required string Name { get; init; }
    public DbProvider Database { get; init; } = DbProvider.Sqlite;
    public Targets Targets { get; init; } = Targets.WebApi | Targets.Docker;
    public List<EntityDefinition> Entities { get; init; } = [];

    /// <summary>C# namespace / project name derived from <see cref="Name"/> (letters and digits only).</summary>
    [JsonIgnore]
    public string Namespace => new string(Name.Where(char.IsAsciiLetterOrDigit).ToArray());
}
