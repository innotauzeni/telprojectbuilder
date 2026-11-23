using System.Text.RegularExpressions;

namespace ProjectBuilder.Core;

/// <summary>
/// Security-critical: every name here ends up as C# source. Only plain PascalCase-style identifiers
/// that are not C# keywords may pass, so user input can never inject code into generated files.
/// </summary>
public static partial class AppDefinitionValidator
{
    private static readonly HashSet<string> Keywords = new(StringComparer.Ordinal)
    {
        "abstract","as","base","bool","break","byte","case","catch","char","checked","class","const","continue",
        "decimal","default","delegate","do","double","else","enum","event","explicit","extern","false","finally",
        "fixed","float","for","foreach","goto","if","implicit","in","int","interface","internal","is","lock","long",
        "namespace","new","null","object","operator","out","override","params","private","protected","public",
        "readonly","ref","return","sbyte","sealed","short","sizeof","stackalloc","static","string","struct","switch",
        "this","throw","true","try","typeof","uint","ulong","unchecked","unsafe","ushort","using","virtual","void",
        "volatile","while"
    };

    // Names that would clash with generated infrastructure types.
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
        { "AppDbContext", "Program", "Controller", "Task", "System" };

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9]{0,63}$")]
    private static partial Regex IdentifierRegex();

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9 ]{0,63}$")]
    private static partial Regex AppNameRegex();

    public static IReadOnlyList<string> Validate(AppDefinition app)
    {
        var errors = new List<string>();

        if (!AppNameRegex().IsMatch(app.Name ?? ""))
            errors.Add("App name must start with a letter and contain only letters, digits and spaces (max 64).");
        else if (Reserved.Contains(app.Namespace) || Keywords.Contains(app.Namespace))
            errors.Add($"App name '{app.Name}' is reserved.");

        if (app.Entities.Count == 0) errors.Add("Add at least one entity.");

        var entityNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in app.Entities)
        {
            if (!CheckIdentifier(e.Name, $"Entity '{e.Name}'", errors)) continue;
            if (!entityNames.Add(e.Name)) errors.Add($"Duplicate entity '{e.Name}'.");

            var members = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Id", e.Name };
            foreach (var f in e.Fields)
            {
                if (CheckIdentifier(f.Name, $"Field '{e.Name}.{f.Name}'", errors) && !members.Add(f.Name))
                    errors.Add($"'{e.Name}.{f.Name}' clashes with another member (Id, the entity name, or a duplicate).");
            }
            foreach (var r in e.Relations)
            {
                if (CheckIdentifier(r.Name, $"Relation '{e.Name}.{r.Name}'", errors))
                {
                    if (!members.Add(r.Name) || !members.Add(r.Name + "Id"))
                        errors.Add($"Relation '{e.Name}.{r.Name}' clashes with another member.");
                }
            }
        }

        foreach (var e in app.Entities)
            foreach (var r in e.Relations)
                if (!entityNames.Contains(r.TargetEntity))
                    errors.Add($"Relation '{e.Name}.{r.Name}' points to unknown entity '{r.TargetEntity}'.");

        return errors;
    }

    private static bool CheckIdentifier(string? name, string what, List<string> errors)
    {
        if (name is null || !IdentifierRegex().IsMatch(name))
        {
            errors.Add($"{what}: name must start with a letter and contain only letters and digits (max 64).");
            return false;
        }
        if (Keywords.Contains(name) || Reserved.Contains(name))
        {
            errors.Add($"{what}: '{name}' is a reserved word.");
            return false;
        }
        return true;
    }
}
