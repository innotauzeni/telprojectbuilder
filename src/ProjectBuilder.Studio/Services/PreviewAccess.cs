using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text.RegularExpressions;
using ProjectBuilder.Core;
using ProjectBuilder.Generator;

namespace ProjectBuilder.Studio.Services;

/// <summary>
/// Throwaway in-memory version of the generated access-control API (modules, sub-modules, permissions, roles), so the
/// Studio preview can show those screens working. It mirrors the real endpoints and shapes; data is lost on restart.
/// </summary>
public static partial class PreviewAccess
{
    private const int MaxModules = 100, MaxSubmodules = 500, MaxPermissions = 2000, MaxRoles = 100;

    private sealed class Module { public int Id; public string Name = "", Slugname = "", Icon = "table"; public string? Description, AccessName; public int SortOrder; public bool IsActive = true; }
    private sealed class Sub { public int Id, ModuleId, Order; public string Name = "", Icon = "table", Route = "/", AccessName = ""; public bool IsActive = true; }
    private sealed class Perm { public int Id; public string Name = "", DisplayName = "", Module = ""; public bool IsActive = true; }
    private sealed class RoleRec { public string Id = Guid.NewGuid().ToString(); public string Name = ""; public string? Type, Level; public bool BuiltIn; public int UserCount; }

    private sealed class State
    {
        public readonly object Gate = new();
        public int NextId = 1;
        public readonly List<Module> Modules = [];
        public readonly List<Sub> Subs = [];
        public readonly List<Perm> Perms = [];
        public readonly List<RoleRec> Roles = [];
        public readonly HashSet<(string Role, int Module)> RoleMenus = [];
        public readonly HashSet<(string Role, int Perm)> RolePerms = [];
    }

    private static readonly ConcurrentDictionary<Guid, State> States = new();

    [GeneratedRegex(@"^/[A-Za-z0-9/_\-]*$")] private static partial Regex RouteRx();
    [GeneratedRegex(@"^[a-z0-9\-]+$")] private static partial Regex SlugRx();
    [GeneratedRegex(@"^[a-z0-9\-_]+$")] private static partial Regex AccessRx();
    [GeneratedRegex(@"^[a-z0-9._\-]+$")] private static partial Regex PermRx();
    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9 ]*$")] private static partial Regex ActionRx();
    [GeneratedRegex(@"^[A-Za-z][A-Za-z ]*$")] private static partial Regex RoleNameRx();

    private static string Uid(ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new UnauthorizedAccessException();

    /// <summary>Seeds like the generated DbSeeder: modules/sub-modules/permissions, built-in roles, and the User role's grants.</summary>
    private static State Seed(AppDefinition def)
    {
        var s = new State();
        var admin = new RoleRec { Name = "Admin", Type = "System", Level = "Administrator", BuiltIn = true, UserCount = 1 };
        var user = new RoleRec { Name = "User", Type = "System", Level = "Standard", BuiltIn = true };
        s.Roles.Add(admin); s.Roles.Add(user);

        foreach (var m in AccessControlSeed.Default(def))
        {
            var mod = new Module { Id = s.NextId++, Name = m.Name, Slugname = m.Slug, Icon = m.Icon, AccessName = m.Slug, SortOrder = m.Order };
            s.Modules.Add(mod);
            if (m.ForUser) s.RoleMenus.Add((user.Id, mod.Id));
            foreach (var sm in m.Subs)
            {
                s.Subs.Add(new Sub { Id = s.NextId++, ModuleId = mod.Id, Name = sm.Name, Icon = sm.Icon, Route = sm.Route, AccessName = sm.Key, Order = sm.Order });
                foreach (var action in sm.Actions)
                {
                    var p = new Perm { Id = s.NextId++, Name = sm.Key + "." + action.ToLowerInvariant(), DisplayName = action + " " + sm.Name, Module = sm.Name };
                    s.Perms.Add(p);
                    if (m.ForUser && action != "Delete") s.RolePerms.Add((user.Id, p.Id));
                }
            }
        }
        return s;
    }

    private static IResult Run(ProjectStore store, ClaimsPrincipal u, Guid id, Func<State, IResult> action)
    {
        var def = store.Get(Uid(u), id);
        if (def is null || !def.AccessControl) return Results.NotFound();
        var state = States.GetOrAdd(id, _ => Seed(def));
        lock (state.Gate) return action(state);
    }

    private static IResult Bad(params string[] errors) => Results.BadRequest(new { errors });
    private static IResult Conflict(string message) => Results.Json(new { title = message, status = 409 }, statusCode: 409);

    private static object ModuleDto(State s, Module m) => new
    {
        m.Id, m.Name, m.Slugname, m.Icon, m.Description, m.AccessName, m.SortOrder, m.IsActive,
        SubmoduleCount = s.Subs.Count(x => x.ModuleId == m.Id), RoleCount = s.RoleMenus.Count(x => x.Module == m.Id)
    };

    private static object SubDto(State s, Sub x) => new
    {
        x.Id, x.ModuleId, x.Name, x.Icon, x.Route, x.AccessName, x.Order, x.IsActive,
        PermissionCount = s.Perms.Count(p => p.Name.StartsWith(x.AccessName + ".", StringComparison.Ordinal))
    };

    private static object PermDto(State s, Perm p) => new { p.Id, p.Name, p.DisplayName, p.Module, p.IsActive, RoleCount = s.RolePerms.Count(r => r.Perm == p.Id) };

    private static object RoleDto(State s, RoleRec r) => new
    {
        r.Id, r.Name, r.Type, r.Level, r.BuiltIn, r.UserCount,
        MenuIds = s.RoleMenus.Where(x => x.Role == r.Id).Select(x => x.Module).Order().ToList(),
        PermissionIds = s.RolePerms.Where(x => x.Role == r.Id).Select(x => x.Perm).Order().ToList()
    };

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    // ---- request shapes (same names as the real API) ----
    public sealed record ModuleInput(string? Name, string? Slugname, string? Icon, string? Description, string? AccessName, int SortOrder, bool IsActive = true);
    public sealed record SubmoduleInput(string? Name, string? Icon, string? Route, string? AccessName, int Order, bool IsActive = true);
    public sealed record PermissionInput(string? Name, string? DisplayName, bool IsActive = true);
    public sealed record BulkInput(List<string>? Names);
    public sealed record RoleInput(string? Name, string? Type, string? Level);
    public sealed record MenusInput(List<int>? ModuleIds);
    public sealed record PermsInput(List<int>? PermissionIds);
    public sealed record RolesInput(List<string>? RoleIds);

    private static string? ValidateModule(ModuleInput i) =>
        string.IsNullOrWhiteSpace(i.Name) || i.Name.Length > 100 ? "Name is required (max 100)."
        : i.Slugname is null || !SlugRx().IsMatch(i.Slugname) ? "Slug may use lowercase letters, digits and dashes."
        : i.Icon is { Length: > 0 } && !SlugRx().IsMatch(i.Icon) ? "Icon must be a lowercase icon name such as home."
        : i.AccessName is { Length: > 0 } && !AccessRx().IsMatch(i.AccessName.Replace('.', '-')) ? "Access name may use lowercase letters, digits, dash and underscore."
        : null;

    private static string? ValidateSub(SubmoduleInput i) =>
        string.IsNullOrWhiteSpace(i.Name) || i.Name.Length > 100 ? "Name is required (max 100)."
        : i.Icon is null || !SlugRx().IsMatch(i.Icon) ? "Icon must be a lowercase icon name such as home."
        : i.Route is null || !RouteRx().IsMatch(i.Route) ? "Route must be an internal path such as /e/students."
        : i.AccessName is null || !AccessRx().IsMatch(i.AccessName) ? "Access name may use lowercase letters, digits, dash and underscore."
        : null;

    public static void Map(RouteGroupBuilder g)
    {
        var p = g.MapGroup("/preview/{id:guid}/api");

        // ---- menu and my permissions (the preview user is an Admin) ----
        p.MapGet("/me/permissions", (Guid id, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            Results.Ok(new { IsAdmin = true, Codes = s.Perms.Where(x => x.IsActive).Select(x => x.Name).ToList() })));

        // ---- modules ----
        p.MapGet("/modules", (Guid id, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            Results.Ok(s.Modules.OrderBy(m => m.SortOrder).ThenBy(m => m.Name).Select(m => ModuleDto(s, m)).ToList())));

        p.MapGet("/modules/{mid:int}", (Guid id, int mid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            s.Modules.FirstOrDefault(m => m.Id == mid) is { } m ? Results.Ok(ModuleDto(s, m)) : Results.NotFound()));

        p.MapPost("/modules", (Guid id, ModuleInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            if (ValidateModule(i) is { } err) return Bad(err);
            if (s.Modules.Count >= MaxModules) return Bad($"Preview is limited to {MaxModules} modules.");
            if (s.Modules.Any(m => m.Slugname == i.Slugname)) return Conflict("That name, slug or access name is already used.");
            var m = new Module { Id = s.NextId++ };
            ApplyModule(m, i); s.Modules.Add(m);
            return Results.Created($"/preview/{id}/api/modules/{m.Id}", ModuleDto(s, m));
        }));

        p.MapPut("/modules/{mid:int}", (Guid id, int mid, ModuleInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var m = s.Modules.FirstOrDefault(x => x.Id == mid);
            if (m is null) return Results.NotFound();
            if (ValidateModule(i) is { } err) return Bad(err);
            if (s.Modules.Any(x => x.Id != mid && x.Slugname == i.Slugname)) return Conflict("That name, slug or access name is already used.");
            ApplyModule(m, i);
            return Results.NoContent();
        }));

        p.MapDelete("/modules/{mid:int}", (Guid id, int mid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var m = s.Modules.FirstOrDefault(x => x.Id == mid);
            if (m is null) return Results.NotFound();
            s.Modules.Remove(m); s.Subs.RemoveAll(x => x.ModuleId == mid); s.RoleMenus.RemoveWhere(x => x.Module == mid);
            return Results.NoContent();
        }));

        p.MapGet("/modules/{mid:int}/roles", (Guid id, int mid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            s.Modules.Any(m => m.Id == mid) ? Results.Ok(s.RoleMenus.Where(x => x.Module == mid).Select(x => x.Role).ToList()) : Results.NotFound()));

        p.MapPut("/modules/{mid:int}/roles", (Guid id, int mid, RolesInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            if (!s.Modules.Any(m => m.Id == mid)) return Results.NotFound();
            var wanted = (i.RoleIds ?? []).Distinct().ToList();
            if (wanted.Any(r => s.Roles.All(x => x.Id != r))) return Bad("One or more roles do not exist.");
            s.RoleMenus.RemoveWhere(x => x.Module == mid);
            foreach (var r in wanted) s.RoleMenus.Add((r, mid));
            return Results.NoContent();
        }));

        // ---- sub-modules ----
        p.MapGet("/modules/{mid:int}/submodules", (Guid id, int mid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            Results.Ok(s.Subs.Where(x => x.ModuleId == mid).OrderBy(x => x.Order).ThenBy(x => x.Name).Select(x => SubDto(s, x)).ToList())));

        p.MapGet("/submodules/{sid:int}", (Guid id, int sid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            s.Subs.FirstOrDefault(x => x.Id == sid) is { } x ? Results.Ok(SubDto(s, x)) : Results.NotFound()));

        p.MapPost("/modules/{mid:int}/submodules", (Guid id, int mid, SubmoduleInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            if (!s.Modules.Any(m => m.Id == mid)) return Results.NotFound();
            if (ValidateSub(i) is { } err) return Bad(err);
            if (s.Subs.Count >= MaxSubmodules) return Bad($"Preview is limited to {MaxSubmodules} sub-modules.");
            var x = new Sub { Id = s.NextId++, ModuleId = mid };
            ApplySub(x, i); s.Subs.Add(x);
            return Results.Created($"/preview/{id}/api/submodules/{x.Id}", SubDto(s, x));
        }));

        p.MapPut("/submodules/{sid:int}", (Guid id, int sid, SubmoduleInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var x = s.Subs.FirstOrDefault(y => y.Id == sid);
            if (x is null) return Results.NotFound();
            if (ValidateSub(i) is { } err) return Bad(err);
            ApplySub(x, i);
            return Results.NoContent();
        }));

        p.MapDelete("/submodules/{sid:int}", (Guid id, int sid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            s.Subs.RemoveAll(x => x.Id == sid) > 0 ? Results.NoContent() : Results.NotFound()));

        // ---- permissions ----
        p.MapGet("/submodules/{sid:int}/permissions", (Guid id, int sid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var sub = s.Subs.FirstOrDefault(x => x.Id == sid);
            if (sub is null) return Results.NotFound();
            return Results.Ok(s.Perms.Where(x => x.Name.StartsWith(sub.AccessName + ".", StringComparison.Ordinal)).OrderBy(x => x.Name).Select(x => PermDto(s, x)).ToList());
        }));

        p.MapPost("/submodules/{sid:int}/permissions", (Guid id, int sid, PermissionInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var sub = s.Subs.FirstOrDefault(x => x.Id == sid);
            if (sub is null) return Results.NotFound();
            if (i.Name is null || !PermRx().IsMatch(i.Name) || string.IsNullOrWhiteSpace(i.DisplayName)) return Bad("Name and display name are required.");
            if (!i.Name.StartsWith(sub.AccessName + ".", StringComparison.Ordinal)) return Bad($"The name must start with '{sub.AccessName}.' so it belongs to this sub-module.");
            if (s.Perms.Any(x => x.Name == i.Name)) return Conflict("That name, slug or access name is already used.");
            if (s.Perms.Count >= MaxPermissions) return Bad($"Preview is limited to {MaxPermissions} permissions.");
            var perm = new Perm { Id = s.NextId++, Name = i.Name, DisplayName = i.DisplayName.Trim(), Module = sub.Name, IsActive = i.IsActive };
            s.Perms.Add(perm);
            return Results.Created($"/preview/{id}/api/permissions/{perm.Id}", PermDto(s, perm));
        }));

        p.MapPost("/submodules/{sid:int}/permissions/bulk", (Guid id, int sid, BulkInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var sub = s.Subs.FirstOrDefault(x => x.Id == sid);
            if (sub is null) return Results.NotFound();
            var names = (i.Names ?? []).Select(n => n.Trim()).Where(n => n.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (names.Count == 0 || names.Count > 30) return Bad("Give between 1 and 30 permission names.");
            foreach (var n in names)
                if (n.Length > 50 || !ActionRx().IsMatch(n)) return Bad($"'{n}' is not a valid permission name (letters, digits and spaces).");

            var created = new List<object>(); var skipped = new List<string>();
            foreach (var n in names)
            {
                var code = sub.AccessName + "." + n.ToLowerInvariant().Replace(' ', '-');
                if (s.Perms.Any(x => x.Name == code)) { skipped.Add(code); continue; }
                if (s.Perms.Count >= MaxPermissions) return Bad($"Preview is limited to {MaxPermissions} permissions.");
                var perm = new Perm { Id = s.NextId++, Name = code, DisplayName = n + " " + sub.Name, Module = sub.Name };
                s.Perms.Add(perm);
                created.Add(PermDto(s, perm));
            }
            return Results.Ok(new { Created = created, Skipped = skipped });
        }));

        p.MapPut("/permissions/{pid:int}", (Guid id, int pid, PermissionInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var perm = s.Perms.FirstOrDefault(x => x.Id == pid);
            if (perm is null) return Results.NotFound();
            if (i.Name is null || !PermRx().IsMatch(i.Name) || string.IsNullOrWhiteSpace(i.DisplayName)) return Bad("Name and display name are required.");
            if (s.Perms.Any(x => x.Id != pid && x.Name == i.Name)) return Conflict("That name, slug or access name is already used.");
            perm.Name = i.Name; perm.DisplayName = i.DisplayName.Trim(); perm.IsActive = i.IsActive;
            return Results.NoContent();
        }));

        p.MapDelete("/permissions/{pid:int}", (Guid id, int pid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            if (s.Perms.RemoveAll(x => x.Id == pid) == 0) return Results.NotFound();
            s.RolePerms.RemoveWhere(x => x.Perm == pid);
            return Results.NoContent();
        }));

        p.MapGet("/access-tree", (Guid id, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var used = new HashSet<int>();
            var modules = s.Modules.OrderBy(m => m.SortOrder).ThenBy(m => m.Name).Select(m => new
            {
                m.Id, m.Name, m.Icon,
                Submodules = s.Subs.Where(x => x.ModuleId == m.Id).OrderBy(x => x.Order).ThenBy(x => x.Name).Select(x =>
                {
                    var perms = s.Perms.Where(q => q.Name.StartsWith(x.AccessName + ".", StringComparison.Ordinal)).OrderBy(q => q.Name).ToList();
                    foreach (var q in perms) used.Add(q.Id);
                    return new { x.Id, x.Name, x.Route, x.AccessName, Permissions = perms.Select(q => new { q.Id, q.Name, q.DisplayName }).ToList() };
                }).ToList()
            }).ToList();
            var other = s.Perms.Where(q => !used.Contains(q.Id)).OrderBy(q => q.Name).Select(q => new { q.Id, q.Name, q.DisplayName }).ToList();
            return Results.Ok(new { Modules = modules, Other = other });
        }));

        // ---- roles ----
        p.MapGet("/roles", (Guid id, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            Results.Ok(s.Roles.OrderBy(r => r.Name).Select(r => RoleDto(s, r)).ToList())));

        p.MapGet("/roles/{rid}", (Guid id, string rid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
            s.Roles.FirstOrDefault(r => r.Id == rid) is { } r ? Results.Ok(RoleDto(s, r)) : Results.NotFound()));

        p.MapPost("/roles", (Guid id, RoleInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            if (i.Name is null || i.Name.Trim().Length is 0 or > 50 || !RoleNameRx().IsMatch(i.Name.Trim())) return Bad("Role names use letters and spaces.");
            if (s.Roles.Any(r => r.Name.Equals(i.Name.Trim(), StringComparison.OrdinalIgnoreCase))) return Bad($"Role name '{i.Name.Trim()}' is already taken.");
            if (s.Roles.Count >= MaxRoles) return Bad($"Preview is limited to {MaxRoles} roles.");
            var r = new RoleRec { Name = i.Name.Trim(), Type = Clean(i.Type), Level = Clean(i.Level) };
            s.Roles.Add(r);
            return Results.Created($"/preview/{id}/api/roles/{r.Id}", RoleDto(s, r));
        }));

        p.MapPut("/roles/{rid}", (Guid id, string rid, RoleInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var r = s.Roles.FirstOrDefault(x => x.Id == rid);
            if (r is null) return Results.NotFound();
            var name = i.Name?.Trim() ?? "";
            if (name.Length is 0 or > 50 || !RoleNameRx().IsMatch(name)) return Bad("Role names use letters and spaces.");
            if (r.BuiltIn && name != r.Name) return Bad("The built-in roles cannot be renamed.");
            if (s.Roles.Any(x => x.Id != rid && x.Name.Equals(name, StringComparison.OrdinalIgnoreCase))) return Bad($"Role name '{name}' is already taken.");
            r.Name = name; r.Type = Clean(i.Type); r.Level = Clean(i.Level);
            return Results.NoContent();
        }));

        p.MapDelete("/roles/{rid}", (Guid id, string rid, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var r = s.Roles.FirstOrDefault(x => x.Id == rid);
            if (r is null) return Results.NotFound();
            if (r.BuiltIn) return Bad("The built-in roles cannot be deleted.");
            s.Roles.Remove(r); s.RoleMenus.RemoveWhere(x => x.Role == rid); s.RolePerms.RemoveWhere(x => x.Role == rid);
            return Results.NoContent();
        }));

        p.MapPut("/roles/{rid}/menus", (Guid id, string rid, MenusInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var r = s.Roles.FirstOrDefault(x => x.Id == rid);
            if (r is null) return Results.NotFound();
            if (r.Name == "Admin") return Bad("Admin always sees every menu.");
            var wanted = (i.ModuleIds ?? []).Distinct().ToList();
            if (wanted.Any(m => s.Modules.All(x => x.Id != m))) return Bad("One or more menus do not exist.");
            s.RoleMenus.RemoveWhere(x => x.Role == rid);
            foreach (var m in wanted) s.RoleMenus.Add((rid, m));
            return Results.NoContent();
        }));

        p.MapPut("/roles/{rid}/permissions", (Guid id, string rid, PermsInput i, ClaimsPrincipal u, ProjectStore st) => Run(st, u, id, s =>
        {
            var r = s.Roles.FirstOrDefault(x => x.Id == rid);
            if (r is null) return Results.NotFound();
            if (r.Name == "Admin") return Bad("Admin always has every permission.");
            var wanted = (i.PermissionIds ?? []).Distinct().ToList();
            if (wanted.Any(pp => s.Perms.All(x => x.Id != pp))) return Bad("One or more permissions do not exist.");
            s.RolePerms.RemoveWhere(x => x.Role == rid);
            foreach (var pp in wanted) s.RolePerms.Add((rid, pp));
            return Results.NoContent();
        }));
    }

    /// <summary>The menu for the previewed user (an Admin): every active module with its active sub-modules.</summary>
    public static IResult Menu(ProjectStore store, ClaimsPrincipal u, Guid id) => Run(store, u, id, s =>
    {
        var nodes = new List<object> { new { Label = "Dashboard", Route = "/", Icon = "home", Children = (object?)null } };
        foreach (var m in s.Modules.Where(x => x.IsActive).OrderBy(x => x.SortOrder).ThenBy(x => x.Name))
        {
            var kids = s.Subs.Where(x => x.ModuleId == m.Id && x.IsActive).OrderBy(x => x.Order).ThenBy(x => x.Name)
                .Select(x => new { Label = x.Name, Route = x.Route, Icon = x.Icon, Children = (object?)null }).ToList();
            if (kids.Count > 0) nodes.Add(new { Label = m.Name, Route = (string?)null, Icon = m.Icon, Children = (object?)kids });
        }
        return Results.Ok(nodes);
    });

    private static void ApplyModule(Module m, ModuleInput i)
    {
        m.Name = i.Name!.Trim(); m.Slugname = i.Slugname!; m.Icon = Clean(i.Icon) ?? "table";
        m.Description = Clean(i.Description); m.AccessName = Clean(i.AccessName); m.SortOrder = i.SortOrder; m.IsActive = i.IsActive;
    }

    private static void ApplySub(Sub x, SubmoduleInput i)
    {
        x.Name = i.Name!.Trim(); x.Icon = i.Icon!; x.Route = i.Route!; x.AccessName = i.AccessName!; x.Order = i.Order; x.IsActive = i.IsActive;
    }
}
