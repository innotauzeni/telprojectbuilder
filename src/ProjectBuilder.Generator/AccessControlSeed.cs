using ProjectBuilder.Core;

namespace ProjectBuilder.Generator;

/// <param name="Key">The sub-module's AccessName. Its permissions are named "{Key}.{action}", e.g. students.create.</param>
public sealed record SeedSubModule(string Name, string Key, string Route, string Icon, int Order, IReadOnlyList<string> Actions);

/// <param name="Slug">Slugname and AccessName of the module.</param>
/// <param name="ForUser">Whether the built-in User role gets this menu.</param>
public sealed record SeedModule(string Name, string Slug, string Icon, int Order, bool ForUser, IReadOnlyList<SeedSubModule> Subs);

/// <summary>
/// The access-control data a new system starts with: system modules (menu) -> sub-modules (submenu) -> permissions.
/// One sub-module per entity with View/Create/Edit/Delete, plus an Administration module for the admin screens.
/// Used by the generated database seeder and by the Studio preview, so both always match.
/// </summary>
public static class AccessControlSeed
{
    public static readonly string[] CrudActions = ["View", "Create", "Edit", "Delete"];

    /// <summary>Permission names are "{accessName}.{action}" (lowercase action, spaces as dashes), e.g. students.create.</summary>
    public static string PermissionName(string accessName, string action) =>
        accessName + "." + action.Trim().ToLowerInvariant().Replace(' ', '-');

    public static IReadOnlyList<SeedModule> Default(AppDefinition app)
    {
        var order = 10;
        var data = app.Entities.Select(e =>
        {
            var key = Naming.Plural(e.Name).ToLowerInvariant();
            return new SeedSubModule(Naming.Humanize(Naming.Plural(e.Name)), key, "/e/" + key, MenuSeed.IconFor(e.Name), order += 10, CrudActions);
        }).ToList();

        return
        [
            new SeedModule("Data", "data", "table", 10, true, data),
            // Admin-only screens: no permissions are defined for them, so only the Admin role (which can do everything) uses them.
            new SeedModule("Administration", "administration", "shield", 900, false,
            [
                new SeedSubModule("Modules", "modules", "/admin/modules", "layout", 10, []),
                new SeedSubModule("Roles", "roles", "/admin/roles", "shield", 20, []),
                new SeedSubModule("Users", "users", "/admin/users", "users", 30, [])
            ])
        ];
    }
}
