using ProjectBuilder.Core;

namespace ProjectBuilder.Studio.Services;

/// <summary>Mutable editing models for the designer; converted to/from the immutable AppDefinition.</summary>
public sealed class ProjectModel
{
    public string Name { get; set; } = "";
    public DbProvider Database { get; set; } = DbProvider.Sqlite;
    public bool Docker { get; set; } = true;
    public List<EntityModel> Entities { get; set; } = [];

    public static ProjectModel From(AppDefinition d) => new()
    {
        Name = d.Name,
        Database = d.Database,
        Docker = d.Targets.HasFlag(Targets.Docker),
        Entities = d.Entities.Select(e => new EntityModel
        {
            Name = e.Name,
            Fields = e.Fields.Select(f => new FieldModel
            {
                Name = f.Name, Type = f.Type, Required = f.Required, Unique = f.Unique, MaxLength = f.MaxLength
            }).ToList(),
            Relations = e.Relations.Select(r => new RelationModel
            {
                Name = r.Name, TargetEntity = r.TargetEntity, Required = r.Required
            }).ToList()
        }).ToList()
    };

    public AppDefinition ToDefinition() => new()
    {
        Name = Name ?? "",
        Database = Database,
        Targets = Targets.WebApi | (Docker ? Targets.Docker : Targets.None),
        Entities = Entities.Select(e => new EntityDefinition
        {
            Name = e.Name ?? "",
            Fields = e.Fields.Select(f => new FieldDefinition
            {
                Name = f.Name ?? "", Type = f.Type, Required = f.Required, Unique = f.Unique,
                MaxLength = f.MaxLength is > 0 ? f.MaxLength : null
            }).ToList(),
            Relations = e.Relations.Select(r => new RelationDefinition
            {
                Name = r.Name ?? "", TargetEntity = r.TargetEntity ?? "", Required = r.Required
            }).ToList()
        }).ToList()
    };
}

public sealed class EntityModel
{
    public string Name { get; set; } = "";
    public List<FieldModel> Fields { get; set; } = [];
    public List<RelationModel> Relations { get; set; } = [];
}

public sealed class FieldModel
{
    public string Name { get; set; } = "";
    public FieldType Type { get; set; } = FieldType.String;
    public bool Required { get; set; }
    public bool Unique { get; set; }
    public int? MaxLength { get; set; }
}

public sealed class RelationModel
{
    public string Name { get; set; } = "";
    public string TargetEntity { get; set; } = "";
    public bool Required { get; set; } = true;
}
