namespace ProjectBuilder.Generator;

/// <summary>C# templates for the generated access-control feature (system modules, sub-modules, permissions, roles).</summary>
internal static class AcTpl
{
    /// <summary>Always generated: the application role, which carries a Type and Level next to the Identity fields.</summary>
    public const string RoleEntity = """
        using Microsoft.AspNetCore.Identity;

        namespace {{ Ns }}.Domain;

        public class Role : IdentityRole
        {
            public string? Type { get; set; }
            public string? Level { get; set; }
            {{~ if AccessControl ~}}
            public ICollection<RoleMenu> RoleMenus { get; set; } = new List<RoleMenu>();
            public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
            {{~ end ~}}
        }
        """;

    public const string Domain = """
        using System.ComponentModel.DataAnnotations;
        using System.ComponentModel.DataAnnotations.Schema;

        namespace {{ Ns }}.Domain;

        /// <summary>A top-level menu entry. Roles see it through RoleMenu; it groups sub-modules (the submenu).</summary>
        public class SystemModule
        {
            public int Id { get; set; }
            [Required, MaxLength(100)] public string Name { get; set; } = string.Empty;
            [Required, MaxLength(100)] public string Slugname { get; set; } = string.Empty;
            [MaxLength(50)] public string Icon { get; set; } = string.Empty;
            [MaxLength(500)] public string? Description { get; set; }
            [MaxLength(100)] public string? AccessName { get; set; }
            public ICollection<Submodule> childrens { get; set; } = new List<Submodule>();
            public int SortOrder { get; set; }
            public bool IsActive { get; set; } = true;
            public ICollection<RoleMenu> RoleMenus { get; set; } = new List<RoleMenu>();
        }

        /// <summary>A submenu entry: one screen in the web app. Its permissions are the ones named "{AccessName}.*".</summary>
        public class Submodule
        {
            public int Id { get; set; }

            [Required, MaxLength(100)]
            public string? Name { get; set; }

            public int ModuleId { get; set; }

            [Required, MaxLength(50)]
            public string? Icon { get; set; }

            /// <summary>Internal path in the web app, e.g. /e/students.</summary>
            [Required, MaxLength(200)]
            public string? Route { get; set; }

            [Required, MaxLength(100)]
            public string? AccessName { get; set; }

            public int Order { get; set; }
            public bool IsActive { get; set; } = true;

            [ForeignKey(nameof(ModuleId))]
            public SystemModule? module { get; set; }
        }

        /// <summary>Something a role may be allowed to do, e.g. Name "events.create", DisplayName "Create Events", Module "Events".</summary>
        public class Permission
        {
            public int Id { get; set; }
            [Required, MaxLength(150)] public string Name { get; set; } = string.Empty;
            [Required, MaxLength(150)] public string DisplayName { get; set; } = string.Empty;
            [MaxLength(100)] public string Module { get; set; } = string.Empty;

            public bool IsActive { get; set; } = true;
            public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
        }

        /// <summary>Lets a role see a menu (system module) and its sub-modules.</summary>
        public class RoleMenu
        {
            /// <summary>String FK matching IdentityRole.Id (GUID string)</summary>
            public string RoleId { get; set; } = string.Empty;

            [ForeignKey(nameof(RoleId))]
            public Role Role { get; set; } = null!;

            public int SystemModuleId { get; set; }

            [ForeignKey(nameof(SystemModuleId))]
            public SystemModule Menu { get; set; } = null!;
        }

        /// <summary>Grants a permission to a role.</summary>
        public class RolePermission
        {
            /// <summary>String FK matching IdentityRole.Id (GUID string)</summary>
            public string RoleId { get; set; } = string.Empty;

            [ForeignKey(nameof(RoleId))]
            public Role Role { get; set; } = null!;

            public int PermissionId { get; set; }

            [ForeignKey(nameof(PermissionId))]
            public Permission Permission { get; set; } = null!;
        }
        """;

    public const string Infrastructure = """
        using Microsoft.AspNetCore.Authorization;
        using Microsoft.AspNetCore.Identity;
        using Microsoft.EntityFrameworkCore;
        using Microsoft.Extensions.Caching.Memory;
        using Microsoft.Extensions.Options;
        using {{ Ns }}.Data;

        namespace {{ Ns }}.Security;

        /// <summary>Looks up which permission names a set of roles holds (cached briefly; cleared whenever permissions change).</summary>
        public class PermissionService(AppDbContext db, IMemoryCache cache)
        {
            private static int _version;
            public static void Invalidate() => Interlocked.Increment(ref _version);

            public async Task<HashSet<string>> CodesForRolesAsync(IEnumerable<string> roleNames)
            {
                var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var role in roleNames.Distinct())
                {
                    var codes = await cache.GetOrCreateAsync($"perm:{_version}:{role}", async entry =>
                    {
                        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
                        return await (from rp in db.RolePermissions
                                      join r in db.Roles on rp.RoleId equals r.Id
                                      where r.Name == role && rp.Permission.IsActive
                                      select rp.Permission.Name).ToListAsync();
                    });
                    result.UnionWith(codes!);
                }
                return result;
            }
        }

        /// <summary>
        /// What the database says about a signed-in user right now: still active, and which roles they hold.
        /// Checked on every request (cached for a few seconds, and cleared whenever an admin changes a user), so deactivating a user
        /// or changing their roles takes effect immediately instead of when their token expires.
        /// </summary>
        public class UserSessionService(UserManager<IdentityUser> users, IMemoryCache cache)
        {
            public sealed record Snapshot(bool Active, string[] Roles);

            private static int _version;
            public static void Invalidate() => Interlocked.Increment(ref _version);

            public async Task<Snapshot?> GetAsync(string userId) =>
                await cache.GetOrCreateAsync($"user:{_version}:{userId}", async entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(15);
                    var user = await users.FindByIdAsync(userId);
                    if (user is null) return null;
                    var locked = await users.IsLockedOutAsync(user);
                    return new Snapshot(!locked, (await users.GetRolesAsync(user)).ToArray());
                });
        }

        /// <summary>[HasPermission("students.create")]: the caller's roles must hold that permission (Admin always passes).</summary>
        public class HasPermissionAttribute : AuthorizeAttribute
        {
            public HasPermissionAttribute(string code) => Policy = PermissionPolicyProvider.Prefix + code;
        }

        public class PermissionRequirement(string code) : IAuthorizationRequirement
        {
            public string Code { get; } = code;
        }

        public class PermissionPolicyProvider(IOptions<AuthorizationOptions> options) : DefaultAuthorizationPolicyProvider(options)
        {
            public const string Prefix = "perm:";

            public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
            {
                if (policyName.StartsWith(Prefix, StringComparison.Ordinal))
                    return new AuthorizationPolicyBuilder().RequireAuthenticatedUser()
                        .AddRequirements(new PermissionRequirement(policyName[Prefix.Length..])).Build();
                return await base.GetPolicyAsync(policyName);
            }
        }

        public class PermissionHandler(PermissionService permissions) : AuthorizationHandler<PermissionRequirement>
        {
            protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
            {
                if (context.User.IsInRole("Admin")) { context.Succeed(requirement); return; }
                var roles = context.User.FindAll("role").Select(c => c.Value);
                if ((await permissions.CodesForRolesAsync(roles)).Contains(requirement.Code)) context.Succeed(requirement);
            }
        }
        """;

    public const string Controller = """
        using System.ComponentModel.DataAnnotations;
        using Microsoft.AspNetCore.Authorization;
        using Microsoft.AspNetCore.Identity;
        using Microsoft.AspNetCore.Mvc;
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Data;
        using {{ Ns }}.Domain;
        using {{ Ns }}.Security;

        namespace {{ Ns }}.Controllers;

        // ---- shapes accepted and returned by the access-control API ----
        public record ModuleDto(int Id, string Name, string Slugname, string Icon, string? Description, string? AccessName, int SortOrder, bool IsActive, int SubmoduleCount, int RoleCount);
        public class ModuleInput
        {
            [Required, MaxLength(100)] public string Name { get; set; } = default!;
            [Required, MaxLength(100), RegularExpression(@"^[a-z0-9\-]+$", ErrorMessage = "Slug may use lowercase letters, digits and dashes.")] public string Slugname { get; set; } = default!;
            [MaxLength(50), RegularExpression(@"^[a-z0-9\-]*$", ErrorMessage = "Icon must be a lowercase icon name such as home.")] public string? Icon { get; set; }
            [MaxLength(500)] public string? Description { get; set; }
            [MaxLength(100), RegularExpression(@"^[a-z0-9\-_.]*$", ErrorMessage = "Access name may use lowercase letters, digits, dash, underscore and dot.")] public string? AccessName { get; set; }
            public int SortOrder { get; set; }
            public bool IsActive { get; set; } = true;
        }

        public record SubmoduleDto(int Id, int ModuleId, string Name, string Icon, string Route, string AccessName, int Order, bool IsActive, int PermissionCount);
        public class SubmoduleInput
        {
            [Required, MaxLength(100)] public string Name { get; set; } = default!;
            [Required, MaxLength(50), RegularExpression(@"^[a-z0-9\-]+$", ErrorMessage = "Icon must be a lowercase icon name such as home.")] public string Icon { get; set; } = default!;
            // Internal paths only: stops javascript: URLs and links to other sites being injected through the menu.
            [Required, MaxLength(200), RegularExpression(@"^/[A-Za-z0-9/_\-]*$", ErrorMessage = "Route must be an internal path such as /e/students.")] public string Route { get; set; } = default!;
            [Required, MaxLength(100), RegularExpression(@"^[a-z0-9\-_]+$", ErrorMessage = "Access name may use lowercase letters, digits, dash and underscore.")] public string AccessName { get; set; } = default!;
            public int Order { get; set; }
            public bool IsActive { get; set; } = true;
        }

        public record PermissionDto(int Id, string Name, string DisplayName, string Module, bool IsActive, int RoleCount);
        public class PermissionInput
        {
            [Required, MaxLength(150), RegularExpression(@"^[a-z0-9._\-]+$", ErrorMessage = "Name may use lowercase letters, digits, dot, dash and underscore.")] public string Name { get; set; } = default!;
            [Required, MaxLength(150)] public string DisplayName { get; set; } = default!;
            public bool IsActive { get; set; } = true;
        }
        public class BulkPermissionInput
        {
            [Required, MinLength(1), MaxLength(30)] public List<string> Names { get; set; } = [];
        }
        public record BulkPermissionResult(List<PermissionDto> Created, List<string> Skipped);

        public record RoleDto(string Id, string Name, string? Type, string? Level, bool BuiltIn, int UserCount, List<int> MenuIds, List<int> PermissionIds);
        public class RoleInput
        {
            [Required, MaxLength(50), RegularExpression(@"^[A-Za-z][A-Za-z ]*$", ErrorMessage = "Role names use letters and spaces.")] public string Name { get; set; } = default!;
            [MaxLength(50)] public string? Type { get; set; }
            [MaxLength(50)] public string? Level { get; set; }
        }
        public class AssignMenusInput { [MaxLength(1000)] public List<int> ModuleIds { get; set; } = []; }
        public class AssignPermissionsInput { [MaxLength(5000)] public List<int> PermissionIds { get; set; } = []; }
        public class AssignRolesInput { [MaxLength(500)] public List<string> RoleIds { get; set; } = []; }

        public record TreePermission(int Id, string Name, string DisplayName);
        public record TreeSubmodule(int Id, string Name, string Route, string AccessName, List<TreePermission> Permissions);
        public record TreeModule(int Id, string Name, string Icon, List<TreeSubmodule> Submodules);
        public record AccessTree(List<TreeModule> Modules, List<TreePermission> Other);

        public record UserDto(string Id, string Email, List<string> Roles, bool Active, bool IsMe);
        public class NewUserInput
        {
            [Required, EmailAddress, MaxLength(200)] public string Email { get; set; } = default!;
            [Required, MaxLength(100)] public string Password { get; set; } = default!;
            [MaxLength(20)] public List<string> Roles { get; set; } = [];
        }
        public class UserRolesInput { [MaxLength(20)] public List<string> Roles { get; set; } = []; }
        public class UserStatusInput { public bool Active { get; set; } }
        public class ResetPasswordInput { [Required, MaxLength(100)] public string NewPassword { get; set; } = default!; }

        public record MenuNode(string Label, string? Route, string? Icon, List<MenuNode>? Children);
        public record MyPermissions(bool IsAdmin, List<string> Codes);

        /// <summary>
        /// System modules (menu) -> sub-modules (submenu) -> permissions, roles, role menus and role permissions.
        /// Everything except the menu and "my permissions" is for Admins only, so a custom role can never grant itself more access.
        /// </summary>
        [ApiController]
        [Authorize]
        public class AccessControlController(AppDbContext db, RoleManager<Role> roles, UserManager<IdentityUser> users, PermissionService perms) : ControllerBase
        {
            private static readonly string[] BuiltInRoles = ["Admin", "User"];
            private const string InUse = "That name, slug or access name is already used.";

            // =============== menu and the caller's own permissions ===============

            /// <summary>The menu for the current user: the modules assigned to their roles (Admin sees all), hiding sub-modules whose View permission they lack.</summary>
            [HttpGet("/api/menu")]
            public async Task<List<MenuNode>> Menu()
            {
                var isAdmin = User.IsInRole("Admin");
                var roleNames = User.FindAll("role").Select(c => c.Value).ToList();

                var query = db.SystemModules.AsNoTracking().Where(m => m.IsActive);
                if (!isAdmin) query = query.Where(m => m.RoleMenus.Any(rm => roleNames.Contains(rm.Role.Name!)));
                var modules = await query.Include(m => m.childrens.Where(s => s.IsActive)).OrderBy(m => m.SortOrder).ThenBy(m => m.Name).ToListAsync();

                var codes = isAdmin ? new HashSet<string>() : await perms.CodesForRolesAsync(roleNames);
                // A sub-module is "governed" when a "{AccessName}.view" permission exists for it.
                var governed = (await db.Permissions.AsNoTracking().Where(p => p.IsActive && p.Name.EndsWith(".view")).Select(p => p.Name).ToListAsync())
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                var menu = new List<MenuNode> { new("Dashboard", "/", "home", null) };
                foreach (var m in modules)
                {
                    var children = m.childrens.OrderBy(s => s.Order).ThenBy(s => s.Name)
                        .Where(s => isAdmin || !governed.Contains(s.AccessName + ".view") || codes.Contains(s.AccessName + ".view"))
                        .Select(s => new MenuNode(s.Name!, s.Route, s.Icon, null)).ToList();
                    if (children.Count > 0) menu.Add(new MenuNode(m.Name, null, m.Icon, children));
                }
                return menu;
            }

            [HttpGet("/api/me/permissions")]
            public async Task<MyPermissions> Mine()
            {
                if (User.IsInRole("Admin"))
                    return new MyPermissions(true, await db.Permissions.AsNoTracking().Where(p => p.IsActive).Select(p => p.Name).ToListAsync());
                return new MyPermissions(false, (await perms.CodesForRolesAsync(User.FindAll("role").Select(c => c.Value))).ToList());
            }

            // =============== system modules (menu) ===============

            [HttpGet("/api/modules")]
            [Authorize(Roles = "Admin")]
            public async Task<List<ModuleDto>> Modules() =>
                await db.SystemModules.AsNoTracking().OrderBy(m => m.SortOrder).ThenBy(m => m.Name)
                    .Select(m => new ModuleDto(m.Id, m.Name, m.Slugname, m.Icon, m.Description, m.AccessName, m.SortOrder, m.IsActive, m.childrens.Count, m.RoleMenus.Count)).ToListAsync();

            [HttpGet("/api/modules/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<ModuleDto>> GetModule(int id)
            {
                var dto = await db.SystemModules.AsNoTracking().Where(x => x.Id == id)
                    .Select(m => new ModuleDto(m.Id, m.Name, m.Slugname, m.Icon, m.Description, m.AccessName, m.SortOrder, m.IsActive, m.childrens.Count, m.RoleMenus.Count)).FirstOrDefaultAsync();
                return dto is null ? NotFound() : dto;
            }

            [HttpPost("/api/modules")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<ModuleDto>> CreateModule(ModuleInput input)
            {
                var m = new SystemModule();
                Apply(m, input);
                db.SystemModules.Add(m);
                if (!await TrySave()) return Problem(InUse, statusCode: StatusCodes.Status409Conflict);
                return Created($"/api/modules/{m.Id}", new ModuleDto(m.Id, m.Name, m.Slugname, m.Icon, m.Description, m.AccessName, m.SortOrder, m.IsActive, 0, 0));
            }

            [HttpPut("/api/modules/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> UpdateModule(int id, ModuleInput input)
            {
                var m = await db.SystemModules.FindAsync(id);
                if (m is null) return NotFound();
                Apply(m, input);
                return await TrySave() ? NoContent() : Problem(InUse, statusCode: StatusCodes.Status409Conflict);
            }

            [HttpDelete("/api/modules/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> DeleteModule(int id)
            {
                var m = await db.SystemModules.FindAsync(id);
                if (m is null) return NotFound();
                db.SystemModules.Remove(m); // its sub-modules and role menus go with it
                await db.SaveChangesAsync();
                PermissionService.Invalidate();
                return NoContent();
            }

            /// <summary>"Menu permission": which roles can see this menu.</summary>
            [HttpGet("/api/modules/{id:int}/roles")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<List<string>>> ModuleRoles(int id)
            {
                if (!await db.SystemModules.AnyAsync(m => m.Id == id)) return NotFound();
                return await db.RoleMenus.Where(rm => rm.SystemModuleId == id).Select(rm => rm.RoleId).ToListAsync();
            }

            [HttpPut("/api/modules/{id:int}/roles")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> SetModuleRoles(int id, AssignRolesInput input)
            {
                if (!await db.SystemModules.AnyAsync(m => m.Id == id)) return NotFound();
                var wanted = input.RoleIds.Distinct().ToList();
                var valid = await roles.Roles.Where(r => wanted.Contains(r.Id)).Select(r => r.Id).ToListAsync();
                if (valid.Count != wanted.Count) return BadRequest(new { errors = new[] { "One or more roles do not exist." } });

                db.RoleMenus.RemoveRange(db.RoleMenus.Where(rm => rm.SystemModuleId == id));
                db.RoleMenus.AddRange(valid.Select(rid => new RoleMenu { RoleId = rid, SystemModuleId = id }));
                await db.SaveChangesAsync();
                return NoContent();
            }

            // =============== sub-modules (submenu) ===============

            [HttpGet("/api/modules/{moduleId:int}/submodules")]
            [Authorize(Roles = "Admin")]
            public async Task<List<SubmoduleDto>> Submodules(int moduleId)
            {
                var subs = await db.Submodules.AsNoTracking().Where(s => s.ModuleId == moduleId).OrderBy(s => s.Order).ThenBy(s => s.Name).ToListAsync();
                var names = await db.Permissions.AsNoTracking().Select(p => p.Name).ToListAsync();
                return subs.Select(s => ToDto(s, names)).ToList();
            }

            [HttpGet("/api/submodules/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<SubmoduleDto>> GetSubmodule(int id)
            {
                var s = await db.Submodules.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
                if (s is null) return NotFound();
                return ToDto(s, await db.Permissions.AsNoTracking().Select(p => p.Name).ToListAsync());
            }

            [HttpPost("/api/modules/{moduleId:int}/submodules")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<SubmoduleDto>> CreateSubmodule(int moduleId, SubmoduleInput input)
            {
                if (!await db.SystemModules.AnyAsync(m => m.Id == moduleId)) return NotFound();
                var s = new Submodule { ModuleId = moduleId };
                Apply(s, input);
                db.Submodules.Add(s);
                await db.SaveChangesAsync();
                PermissionService.Invalidate();
                return Created($"/api/submodules/{s.Id}", ToDto(s, []));
            }

            [HttpPut("/api/submodules/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> UpdateSubmodule(int id, SubmoduleInput input)
            {
                var s = await db.Submodules.FindAsync(id);
                if (s is null) return NotFound();
                Apply(s, input);
                await db.SaveChangesAsync();
                PermissionService.Invalidate();
                return NoContent();
            }

            [HttpDelete("/api/submodules/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> DeleteSubmodule(int id)
            {
                var s = await db.Submodules.FindAsync(id);
                if (s is null) return NotFound();
                db.Submodules.Remove(s);
                await db.SaveChangesAsync();
                PermissionService.Invalidate();
                return NoContent();
            }

            // =============== permissions ===============

            /// <summary>All permissions of one sub-module, i.e. those named "{AccessName}.*".</summary>
            [HttpGet("/api/submodules/{subId:int}/permissions")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<List<PermissionDto>>> Permissions(int subId)
            {
                var sub = await db.Submodules.AsNoTracking().FirstOrDefaultAsync(s => s.Id == subId);
                if (sub is null) return NotFound();
                var prefix = sub.AccessName + ".";
                return await db.Permissions.AsNoTracking().Where(p => p.Name.StartsWith(prefix)).OrderBy(p => p.Name)
                    .Select(p => new PermissionDto(p.Id, p.Name, p.DisplayName, p.Module, p.IsActive, p.RolePermissions.Count)).ToListAsync();
            }

            [HttpPost("/api/submodules/{subId:int}/permissions")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<PermissionDto>> CreatePermission(int subId, PermissionInput input)
            {
                var sub = await db.Submodules.AsNoTracking().FirstOrDefaultAsync(s => s.Id == subId);
                if (sub is null) return NotFound();
                if (!input.Name.StartsWith(sub.AccessName + ".", StringComparison.Ordinal))
                    return BadRequest(new { errors = new[] { $"The name must start with '{sub.AccessName}.' so it belongs to this sub-module." } });

                var p = new Permission { Name = input.Name, DisplayName = input.DisplayName.Trim(), Module = sub.Name!, IsActive = input.IsActive };
                db.Permissions.Add(p);
                if (!await TrySave()) return Problem(InUse, statusCode: StatusCodes.Status409Conflict);
                return Created($"/api/permissions/{p.Id}", new PermissionDto(p.Id, p.Name, p.DisplayName, p.Module, p.IsActive, 0));
            }

            /// <summary>Adds many permissions to a sub-module at once, e.g. View, Create, Edit, Delete, Export. Existing ones are skipped.</summary>
            [HttpPost("/api/submodules/{subId:int}/permissions/bulk")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<BulkPermissionResult>> BulkPermissions(int subId, BulkPermissionInput input)
            {
                var sub = await db.Submodules.AsNoTracking().FirstOrDefaultAsync(s => s.Id == subId);
                if (sub is null) return NotFound();

                var wanted = new List<(string Action, string Name)>();
                foreach (var raw in input.Names.Select(n => n.Trim()).Where(n => n.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    if (raw.Length > 50 || !System.Text.RegularExpressions.Regex.IsMatch(raw, "^[A-Za-z][A-Za-z0-9 ]*$"))
                        return BadRequest(new { errors = new[] { $"'{raw}' is not a valid permission name (letters, digits and spaces)." } });
                    wanted.Add((raw, sub.AccessName + "." + raw.ToLowerInvariant().Replace(' ', '-')));
                }

                var names = wanted.Select(w => w.Name).ToList();
                var existing = await db.Permissions.Where(p => names.Contains(p.Name)).Select(p => p.Name).ToListAsync();
                var created = wanted.Where(w => !existing.Contains(w.Name))
                    .Select(w => new Permission { Name = w.Name, DisplayName = w.Action + " " + sub.Name, Module = sub.Name!, IsActive = true }).ToList();

                db.Permissions.AddRange(created);
                await db.SaveChangesAsync();
                PermissionService.Invalidate();
                return new BulkPermissionResult(created.Select(p => new PermissionDto(p.Id, p.Name, p.DisplayName, p.Module, p.IsActive, 0)).ToList(), existing);
            }

            [HttpPut("/api/permissions/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> UpdatePermission(int id, PermissionInput input)
            {
                var p = await db.Permissions.FindAsync(id);
                if (p is null) return NotFound();
                p.Name = input.Name; p.DisplayName = input.DisplayName.Trim(); p.IsActive = input.IsActive;
                return await TrySave() ? NoContent() : Problem(InUse, statusCode: StatusCodes.Status409Conflict);
            }

            [HttpDelete("/api/permissions/{id:int}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> DeletePermission(int id)
            {
                var p = await db.Permissions.FindAsync(id);
                if (p is null) return NotFound();
                db.Permissions.Remove(p);
                await db.SaveChangesAsync();
                PermissionService.Invalidate();
                return NoContent();
            }

            /// <summary>Modules with their sub-modules and each sub-module's permissions, for the screens that assign access to roles.</summary>
            [HttpGet("/api/access-tree")]
            [Authorize(Roles = "Admin")]
            public async Task<AccessTree> Tree()
            {
                var modules = await db.SystemModules.AsNoTracking().Include(m => m.childrens).OrderBy(m => m.SortOrder).ThenBy(m => m.Name).ToListAsync();
                var all = await db.Permissions.AsNoTracking().OrderBy(p => p.Name).ToListAsync();
                var used = new HashSet<int>();

                var tree = modules.Select(m => new TreeModule(m.Id, m.Name, m.Icon,
                    m.childrens.OrderBy(s => s.Order).ThenBy(s => s.Name).Select(s =>
                    {
                        var prefix = s.AccessName + ".";
                        var perms = all.Where(p => p.Name.StartsWith(prefix)).ToList();
                        foreach (var p in perms) used.Add(p.Id);
                        return new TreeSubmodule(s.Id, s.Name!, s.Route!, s.AccessName!, perms.Select(p => new TreePermission(p.Id, p.Name, p.DisplayName)).ToList());
                    }).ToList())).ToList();

                return new AccessTree(tree, all.Where(p => !used.Contains(p.Id)).Select(p => new TreePermission(p.Id, p.Name, p.DisplayName)).ToList());
            }

            // =============== roles ===============

            [HttpGet("/api/roles")]
            [Authorize(Roles = "Admin")]
            public async Task<List<RoleDto>> Roles()
            {
                var all = await roles.Roles.AsNoTracking().OrderBy(r => r.Name).ToListAsync();
                var counts = await db.UserRoles.GroupBy(ur => ur.RoleId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);
                var menus = (await db.RoleMenus.AsNoTracking().Select(x => new { x.RoleId, x.SystemModuleId }).ToListAsync())
                    .GroupBy(x => x.RoleId).ToDictionary(g => g.Key, g => g.Select(x => x.SystemModuleId).ToList());
                var grants = (await db.RolePermissions.AsNoTracking().Select(x => new { x.RoleId, x.PermissionId }).ToListAsync())
                    .GroupBy(x => x.RoleId).ToDictionary(g => g.Key, g => g.Select(x => x.PermissionId).ToList());
                return all.Select(r => new RoleDto(r.Id, r.Name!, r.Type, r.Level, BuiltInRoles.Contains(r.Name), counts.GetValueOrDefault(r.Id),
                    menus.GetValueOrDefault(r.Id) ?? [], grants.GetValueOrDefault(r.Id) ?? [])).ToList();
            }

            [HttpGet("/api/roles/{id}")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<RoleDto>> GetRole(string id)
            {
                var r = await roles.FindByIdAsync(id);
                if (r is null) return NotFound();
                return new RoleDto(r.Id, r.Name!, r.Type, r.Level, BuiltInRoles.Contains(r.Name), await db.UserRoles.CountAsync(ur => ur.RoleId == id),
                    await db.RoleMenus.Where(x => x.RoleId == id).Select(x => x.SystemModuleId).ToListAsync(),
                    await db.RolePermissions.Where(x => x.RoleId == id).Select(x => x.PermissionId).ToListAsync());
            }

            [HttpPost("/api/roles")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<RoleDto>> CreateRole(RoleInput input)
            {
                var role = new Role { Name = input.Name.Trim(), Type = Clean(input.Type), Level = Clean(input.Level) };
                var result = await roles.CreateAsync(role);
                if (!result.Succeeded) return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
                return Created($"/api/roles/{role.Id}", new RoleDto(role.Id, role.Name!, role.Type, role.Level, false, 0, [], []));
            }

            [HttpPut("/api/roles/{id}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> UpdateRole(string id, RoleInput input)
            {
                var role = await roles.FindByIdAsync(id);
                if (role is null) return NotFound();
                if (BuiltInRoles.Contains(role.Name) && role.Name != input.Name.Trim())
                    return BadRequest(new { errors = new[] { "The built-in roles cannot be renamed." } });
                role.Name = input.Name.Trim(); role.Type = Clean(input.Type); role.Level = Clean(input.Level);
                var result = await roles.UpdateAsync(role);
                if (!result.Succeeded) return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
                PermissionService.Invalidate();
                return NoContent();
            }

            [HttpDelete("/api/roles/{id}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> DeleteRole(string id)
            {
                var role = await roles.FindByIdAsync(id);
                if (role is null) return NotFound();
                if (BuiltInRoles.Contains(role.Name)) return BadRequest(new { errors = new[] { "The built-in roles cannot be deleted." } });
                if (await db.UserRoles.AnyAsync(ur => ur.RoleId == id))
                    return Problem("Users still have this role. Change their role first.", statusCode: StatusCodes.Status409Conflict);
                await roles.DeleteAsync(role);
                PermissionService.Invalidate();
                return NoContent();
            }

            /// <summary>"Menu permission": replaces the menus (system modules) a role can see with exactly the given list.</summary>
            [HttpPut("/api/roles/{id}/menus")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> AssignMenus(string id, AssignMenusInput input)
            {
                var role = await roles.FindByIdAsync(id);
                if (role is null) return NotFound();
                if (role.Name == "Admin") return BadRequest(new { errors = new[] { "Admin always sees every menu." } });

                var wanted = input.ModuleIds.Distinct().ToList();
                var valid = await db.SystemModules.Where(m => wanted.Contains(m.Id)).Select(m => m.Id).ToListAsync();
                if (valid.Count != wanted.Count) return BadRequest(new { errors = new[] { "One or more menus do not exist." } });

                db.RoleMenus.RemoveRange(db.RoleMenus.Where(x => x.RoleId == id));
                db.RoleMenus.AddRange(valid.Select(mid => new RoleMenu { RoleId = id, SystemModuleId = mid }));
                await db.SaveChangesAsync();
                return NoContent();
            }

            /// <summary>"Role permission": replaces the permissions of a role with exactly the given list (assigning in bulk).</summary>
            [HttpPut("/api/roles/{id}/permissions")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> AssignPermissions(string id, AssignPermissionsInput input)
            {
                var role = await roles.FindByIdAsync(id);
                if (role is null) return NotFound();
                if (role.Name == "Admin") return BadRequest(new { errors = new[] { "Admin always has every permission." } });

                var wanted = input.PermissionIds.Distinct().ToList();
                var valid = await db.Permissions.Where(p => wanted.Contains(p.Id)).Select(p => p.Id).ToListAsync();
                if (valid.Count != wanted.Count) return BadRequest(new { errors = new[] { "One or more permissions do not exist." } });

                db.RolePermissions.RemoveRange(db.RolePermissions.Where(x => x.RoleId == id));
                db.RolePermissions.AddRange(valid.Select(pid => new RolePermission { RoleId = id, PermissionId = pid }));
                await db.SaveChangesAsync();
                PermissionService.Invalidate();
                return NoContent();
            }

            // =============== users ===============

            [HttpGet("/api/users")]
            [Authorize(Roles = "Admin")]
            public async Task<List<UserDto>> Users()
            {
                var all = await users.Users.AsNoTracking().OrderBy(u => u.Email).Take(500).ToListAsync();
                var byUser = (await (from ur in db.UserRoles join r in db.Roles on ur.RoleId equals r.Id select new { ur.UserId, r.Name }).ToListAsync())
                    .GroupBy(x => x.UserId).ToDictionary(g => g.Key, g => g.Select(x => x.Name!).OrderBy(n => n).ToList());
                var me = CurrentUserId();
                return all.Select(u => new UserDto(u.Id, u.Email ?? u.UserName ?? "", byUser.GetValueOrDefault(u.Id) ?? [], IsActive(u), u.Id == me)).ToList();
            }

            [HttpPost("/api/users")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<UserDto>> CreateUser(NewUserInput input)
            {
                var wanted = input.Roles.Distinct().ToList();
                if (!await RolesExist(wanted)) return BadRequest(new { errors = new[] { "One or more roles do not exist." } });

                var user = new IdentityUser { UserName = input.Email.Trim(), Email = input.Email.Trim(), EmailConfirmed = true };
                var result = await users.CreateAsync(user, input.Password);
                if (!result.Succeeded) return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
                if (wanted.Count > 0) await users.AddToRolesAsync(user, wanted);
                UserSessionService.Invalidate();
                return Created($"/api/users/{user.Id}", new UserDto(user.Id, user.Email!, wanted, true, false));
            }

            /// <summary>Replaces the roles of a user. Takes effect immediately, even for a user who is signed in.</summary>
            [HttpPut("/api/users/{id}/roles")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> SetUserRoles(string id, UserRolesInput input)
            {
                var user = await users.FindByIdAsync(id);
                if (user is null) return NotFound();
                var wanted = input.Roles.Distinct().ToList();
                if (!await RolesExist(wanted)) return BadRequest(new { errors = new[] { "One or more roles do not exist." } });

                var isAdminNow = await users.IsInRoleAsync(user, "Admin");
                if (isAdminNow && !wanted.Contains("Admin"))
                {
                    if (id == CurrentUserId()) return BadRequest(new { errors = new[] { "You cannot remove your own Admin role." } });
                    if (await ActiveAdminCount(except: id) == 0) return BadRequest(new { errors = new[] { "At least one active Admin is required." } });
                }

                var current = await users.GetRolesAsync(user);
                await users.RemoveFromRolesAsync(user, current.Except(wanted));
                await users.AddToRolesAsync(user, wanted.Except(current));
                UserSessionService.Invalidate();
                return NoContent();
            }

            /// <summary>Deactivates or reactivates an account. A deactivated user is signed out of everything straight away.</summary>
            [HttpPut("/api/users/{id}/status")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> SetUserStatus(string id, UserStatusInput input)
            {
                var user = await users.FindByIdAsync(id);
                if (user is null) return NotFound();
                if (!input.Active)
                {
                    if (id == CurrentUserId()) return BadRequest(new { errors = new[] { "You cannot deactivate your own account." } });
                    if (await users.IsInRoleAsync(user, "Admin") && await ActiveAdminCount(except: id) == 0)
                        return BadRequest(new { errors = new[] { "At least one active Admin is required." } });
                }

                await users.SetLockoutEnabledAsync(user, true);
                await users.SetLockoutEndDateAsync(user, input.Active ? null : DateTimeOffset.MaxValue);
                if (input.Active) await users.ResetAccessFailedCountAsync(user);
                UserSessionService.Invalidate();
                return NoContent();
            }

            [HttpPost("/api/users/{id}/password")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> ResetPassword(string id, ResetPasswordInput input)
            {
                var user = await users.FindByIdAsync(id);
                if (user is null) return NotFound();
                var token = await users.GeneratePasswordResetTokenAsync(user);
                var result = await users.ResetPasswordAsync(user, token, input.NewPassword);
                return result.Succeeded ? NoContent() : BadRequest(new { errors = result.Errors.Select(e => e.Description) });
            }

            // =============== helpers ===============

            private string? CurrentUserId() => User.FindFirst("sub")?.Value;

            private static bool IsActive(IdentityUser u) => !(u.LockoutEnd is { } end && end > DateTimeOffset.UtcNow);

            private async Task<bool> RolesExist(List<string> names) =>
                names.Count == 0 || await roles.Roles.CountAsync(r => names.Contains(r.Name!)) == names.Count;

            private async Task<int> ActiveAdminCount(string except) =>
                (await users.GetUsersInRoleAsync("Admin")).Count(u => u.Id != except && IsActive(u));


            private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

            private static void Apply(SystemModule m, ModuleInput i)
            {
                m.Name = i.Name.Trim(); m.Slugname = i.Slugname; m.Icon = Clean(i.Icon) ?? "table";
                m.Description = Clean(i.Description); m.AccessName = Clean(i.AccessName);
                m.SortOrder = i.SortOrder; m.IsActive = i.IsActive;
            }

            private static void Apply(Submodule s, SubmoduleInput i)
            {
                s.Name = i.Name.Trim(); s.Icon = i.Icon; s.Route = i.Route; s.AccessName = i.AccessName; s.Order = i.Order; s.IsActive = i.IsActive;
            }

            private static SubmoduleDto ToDto(Submodule s, List<string> permissionNames) =>
                new(s.Id, s.ModuleId, s.Name!, s.Icon!, s.Route!, s.AccessName!, s.Order, s.IsActive,
                    permissionNames.Count(n => n.StartsWith(s.AccessName + ".", StringComparison.Ordinal)));

            private async Task<bool> TrySave()
            {
                try { await db.SaveChangesAsync(); PermissionService.Invalidate(); return true; }
                catch (DbUpdateException) { return false; }
            }
        }
        """;
}
