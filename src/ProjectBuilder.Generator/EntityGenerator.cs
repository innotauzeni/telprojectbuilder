using System.Text;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator;

/// <summary>A generated file: relative path inside the output project + its content.</summary>
public sealed record GeneratedFile(string Path, string Content);

public interface IGenerator
{
    IEnumerable<GeneratedFile> Generate(AppDefinition app);
}

/// <summary>Emits one C# entity class per EntityDefinition.</summary>
public sealed class EntityGenerator : IGenerator
{
    public IEnumerable<GeneratedFile> Generate(AppDefinition app)
    {
        foreach (var e in app.Entities)
        {
            var sb = new StringBuilder();
            sb.AppendLine("using System.ComponentModel.DataAnnotations;");
            sb.AppendLine();
            sb.AppendLine($"namespace {app.Namespace}.Domain;");
            sb.AppendLine();
            sb.AppendLine($"public class {e.Name}");
            sb.AppendLine("{");
            sb.AppendLine("    public Guid Id { get; set; }");
            foreach (var f in e.Fields)
            {
                var t = Naming.CsType(f.Type);
                var isString = t == "string";
                if (f.MaxLength is > 0 && isString) sb.AppendLine($"    [MaxLength({f.MaxLength})]");
                if (f.Type == FieldType.Email) sb.AppendLine("    [EmailAddress]");
                var nullable = f.Required ? "" : "?";
                var init = f.Required && isString ? " = default!;" : "";
                sb.AppendLine($"    public {t}{nullable} {f.Name} {{ get; set; }}{init}");
            }
            foreach (var r in e.Relations)
            {
                sb.AppendLine($"    public Guid{(r.Required ? "" : "?")} {r.Name}Id {{ get; set; }}");
                sb.AppendLine($"    public {r.TargetEntity}? {r.Name} {{ get; set; }}");
            }
            sb.AppendLine("}");
            yield return new GeneratedFile($"Domain/{e.Name}.cs", sb.ToString());
        }
    }
}

public static class Naming
{
    public static string CsType(FieldType t) => t switch
    {
        FieldType.Int => "int",
        FieldType.Long => "long",
        FieldType.Decimal => "decimal",
        FieldType.Bool => "bool",
        FieldType.Date or FieldType.DateTime => "DateTime",
        FieldType.Guid => "Guid",
        _ => "string"
    };

    public static string Plural(string name) =>
        name.EndsWith('y') && name.Length > 1 && !"aeiou".Contains(char.ToLowerInvariant(name[^2])) ? name[..^1] + "ies"
        : name.EndsWith('s') || name.EndsWith("x") || name.EndsWith("ch") || name.EndsWith("sh") ? name + "es"
        : name + "s";
}
