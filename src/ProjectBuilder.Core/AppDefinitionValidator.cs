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
        {
            "AppDbContext", "Program", "Controller", "Task", "System",
            // generated infrastructure
            "DbSeeder", "PagedResult", "LoginRequest", "RegisterRequest", "AuthResponse", "Auth", "AuthController",
            "Menu", "MenuItem", "MenuEntry", "MenuItemDto", "MenuController",
            // access control tables and types
            "SystemModule", "SubModule", "Module", "Permission", "RolePermission", "PermissionService", "PermissionHandler",
            "PermissionRequirement", "HasPermission", "AccessControlController",
            // ASP.NET Identity types / DbSet names inherited from IdentityDbContext
            "IdentityUser", "IdentityRole", "User", "Role", "UserClaim", "UserLogin", "UserToken", "RoleClaim", "UserRole"
        };

    private const int MaxEntities = 100;
    private const int MaxFieldsPerEntity = 100;
    private const int MaxRelationsPerEntity = 50;
    private const int MaxRoles = 20;

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
        if (app.Entities.Count > MaxEntities) errors.Add($"A system can have at most {MaxEntities} entities.");
        foreach (var e in app.Entities)
        {
            if (e.Fields.Count > MaxFieldsPerEntity) errors.Add($"'{e.Name}' has more than {MaxFieldsPerEntity} fields.");
            if (e.Relations.Count > MaxRelationsPerEntity) errors.Add($"'{e.Name}' has more than {MaxRelationsPerEntity} links.");
        }
        if (errors.Count > 0 && app.Entities.Count > MaxEntities) return errors; // don't walk an oversized design

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

        ValidateRoles(app, entityNames, errors);
        return errors;
    }

    private static readonly string[] CrudActions = ["View", "Create", "Edit", "Delete"];

    private static void ValidateRoles(AppDefinition app, HashSet<string> entityNames, List<string> errors)
    {
        if (app.Roles.Count == 0) return;
        if (!app.AccessControl) { errors.Add("Roles need Access control to be switched on."); return; }
        if (app.Roles.Count > MaxRoles) { errors.Add($"A system can start with at most {MaxRoles} extra roles."); return; }

        var routes = app.Entities.Where(e => e.Name is not null)
            .Select(e => Plural(e.Name).ToLowerInvariant()).ToHashSet(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Admin", "User" };

        foreach (var role in app.Roles)
        {
            if (string.IsNullOrWhiteSpace(role.Name) || role.Name.Length > 50 || !RoleNameRegex().IsMatch(role.Name))
            { errors.Add($"Role '{role.Name}': use letters and spaces only (max 50)."); continue; }
            if (!seen.Add(role.Name)) errors.Add($"Role '{role.Name}' is a duplicate or a built-in role (Admin and User always exist).");
            if (role.Type is { Length: > 50 } || role.Level is { Length: > 50 }) errors.Add($"Role '{role.Name}': Type and Level are limited to 50 characters.");

            foreach (var (route, actions) in role.Grants)
            {
                if (!routes.Contains(route)) { errors.Add($"Role '{role.Name}' grants access to unknown entity '{route}' (use the entity's plural in lowercase, e.g. students)."); continue; }
                foreach (var action in actions)
                    if (!CrudActions.Contains(action, StringComparer.OrdinalIgnoreCase))
                        errors.Add($"Role '{role.Name}': '{action}' is not an action (use View, Create, Edit or Delete).");
            }
        }
    }

    /// <summary>The pluralisation used for routes; kept in step with the generator's Naming.Plural.</summary>
    private static string Plural(string name) =>
        name.EndsWith('y') && name.Length > 1 && !"aeiou".Contains(char.ToLowerInvariant(name[^2])) ? name[..^1] + "ies"
        : name.EndsWith('s') || name.EndsWith("x") || name.EndsWith("ch") || name.EndsWith("sh") ? name + "es"
        : name + "s";

    [GeneratedRegex("^[A-Za-z][A-Za-z ]*$")]
    private static partial Regex RoleNameRegex();

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
