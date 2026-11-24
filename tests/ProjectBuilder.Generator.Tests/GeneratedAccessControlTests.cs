using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json.Nodes;

namespace ProjectBuilder.Generator.Tests;

/// <summary>
/// Generates the Enrolment system with access control, runs it for real and checks that menus and API calls follow the
/// permissions of the caller's roles, and that the admin APIs (modules, sub-modules, bulk permissions, roles) behave.
/// </summary>
public class GeneratedAccessControlTests
{
    private static int FreePort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }

    private static HttpClient Client(string baseUrl, string? token = null)
    {
        var c = new HttpClient { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(30) };
        if (token is not null) c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return c;
    }

    private static async Task<string> Login(string baseUrl, string email, string password)
    {
        using var c = Client(baseUrl);
        var res = await c.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (string)(await res.Content.ReadFromJsonAsync<JsonNode>())!["token"]!;
    }

    private static async Task<List<string>> MenuLabels(HttpClient c, bool children = false)
    {
        var menu = (await c.GetFromJsonAsync<JsonArray>("/api/menu"))!;
        return children
            ? menu.SelectMany(n => (n!["children"] as JsonArray)?.Select(x => (string)x!["label"]!) ?? []).ToList()
            : menu.Select(n => (string)n!["label"]!).ToList();
    }

    private static async Task<JsonNode> Json(HttpResponseMessage r) => (await r.Content.ReadFromJsonAsync<JsonNode>())!;

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Menu_and_api_follow_role_permissions()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pb-ac-" + Guid.NewGuid().ToString("N"));
        Process? proc = null;
        try
        {
            new ProjectGenerator().WriteTo(ProjectGeneratorTests.Enrolment(), dir);
            var settings = JsonNode.Parse(File.ReadAllText(Path.Combine(dir, "api", "appsettings.json")))!;
            var adminEmail = (string)settings["Seed"]!["AdminEmail"]!;
            var adminPassword = (string)settings["Seed"]!["AdminPassword"]!;

            var baseUrl = $"http://127.0.0.1:{FreePort()}";
            proc = Process.Start(new ProcessStartInfo("dotnet", $"run --no-launch-profile --urls {baseUrl}")
            {
                WorkingDirectory = Path.Combine(dir, "api"), UseShellExecute = false, CreateNoWindow = true
            })!;
            using (var probe = Client(baseUrl))
                await GeneratedAppEndToEndTests.WaitUntilUp(probe, proc);

            using var admin = Client(baseUrl, await Login(baseUrl, adminEmail, adminPassword));

            // ---- seeded structure: modules -> sub-modules -> permissions ----
            var modules = (await admin.GetFromJsonAsync<JsonArray>("/api/modules"))!;
            Assert.Contains("Data", modules.Select(m => (string)m!["name"]!));
            Assert.Contains("Administration", modules.Select(m => (string)m!["name"]!));
            var dataId = (int)modules.First(m => (string)m!["name"]! == "Data")!["id"]!;
            var subs = (await admin.GetFromJsonAsync<JsonArray>($"/api/modules/{dataId}/submodules"))!;
            var studentsSub = subs.First(s => (string)s!["accessName"]! == "students")!;
            Assert.Equal(4, (int)studentsSub["permissionCount"]!);   // View, Create, Edit, Delete
            var studentPerms = (await admin.GetFromJsonAsync<JsonArray>($"/api/submodules/{(int)studentsSub["id"]!}/permissions"))!;
            Assert.Equal(new[] { "students.create", "students.delete", "students.edit", "students.view" },
                studentPerms.Select(p => (string)p!["name"]!).OrderBy(x => x).ToArray());
            Assert.Equal("Create Students", (string)studentPerms.First(p => (string)p!["name"]! == "students.create")!["displayName"]!);

            // ---- admin sees everything in the menu ----
            var adminMenu = await MenuLabels(admin);
            Assert.Contains("Dashboard", adminMenu);
            Assert.Contains("Data", adminMenu);
            Assert.Contains("Administration", adminMenu);
            Assert.Contains("Roles", await MenuLabels(admin, children: true));

            // ---- built-in User role: Data menu; view/create/edit but not delete; no admin screens ----
            Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/auth/register",
                new { email = "clerk@example.com", password = "Clerk#12345", role = "User" })).StatusCode);
            using var clerk = Client(baseUrl, await Login(baseUrl, "clerk@example.com", "Clerk#12345"));

            Assert.DoesNotContain("Administration", await MenuLabels(clerk));
            Assert.Contains("Data", await MenuLabels(clerk));
            Assert.Contains("Students", await MenuLabels(clerk, children: true));

            var mine = await Json(await clerk.GetAsync("/api/me/permissions"));
            Assert.False((bool)mine["isAdmin"]!);
            var clerkCodes = ((JsonArray)mine["codes"]!).Select(x => (string)x!).ToList();
            Assert.Contains("students.view", clerkCodes);
            Assert.DoesNotContain("students.delete", clerkCodes);

            Assert.Equal(HttpStatusCode.OK, (await clerk.GetAsync("/api/students")).StatusCode);
            var created = await clerk.PostAsJsonAsync("/api/students", new { firstName = "Ann", lastName = "Moyo", dateOfBirth = "2010-05-01", studentNumber = "S001" });
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            var studentId = (string)(await Json(created))["id"]!;
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.DeleteAsync($"/api/students/{studentId}")).StatusCode);

            // admin screens are Admin-only, whatever permissions a role holds
            foreach (var url in new[] { "/api/modules", "/api/roles", "/api/access-tree", "/api/permissions" })
                Assert.True((await clerk.GetAsync(url)).StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound, url);
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.GetAsync("/api/modules")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.PostAsJsonAsync("/api/roles", new { name = "Sneaky" })).StatusCode);

            // ---- custom role: a "Registrar" may view and DELETE students but not create ----
            var roleRes = await admin.PostAsJsonAsync("/api/roles", new { name = "Registrar", type = "Staff", level = "Senior" });
            Assert.Equal(HttpStatusCode.Created, roleRes.StatusCode);
            var roleId = (string)(await Json(roleRes))["id"]!;

            var viewId = (int)studentPerms.First(p => (string)p!["name"]! == "students.view")!["id"]!;
            var deleteId = (int)studentPerms.First(p => (string)p!["name"]! == "students.delete")!["id"]!;

            // "menu permission": which menus the role sees; "role permission": what it may do
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/roles/{roleId}/menus", new { moduleIds = new[] { dataId } })).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/roles/{roleId}/permissions", new { permissionIds = new[] { viewId, deleteId } })).StatusCode);

            var role = await Json(await admin.GetAsync($"/api/roles/{roleId}"));
            Assert.Equal("Staff", (string)role["type"]!);
            Assert.Equal(new[] { dataId }, ((JsonArray)role["menuIds"]!).Select(x => (int)x!).ToArray());
            Assert.Equal(2, ((JsonArray)role["permissionIds"]!).Count);

            Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/auth/register",
                new { email = "registrar@example.com", password = "Regist#12345", role = "Registrar" })).StatusCode);
            using var registrar = Client(baseUrl, await Login(baseUrl, "registrar@example.com", "Regist#12345"));

            var registrarMenu = await MenuLabels(registrar, children: true);
            Assert.Equal(new[] { "Students" }, registrarMenu);                 // only sub-modules she may view
            Assert.Equal(HttpStatusCode.OK, (await registrar.GetAsync("/api/students")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await registrar.GetAsync("/api/guardians")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await registrar.PostAsJsonAsync("/api/students",
                new { firstName = "X", lastName = "Y", dateOfBirth = "2010-01-01", studentNumber = "S9" })).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await registrar.DeleteAsync($"/api/students/{studentId}")).StatusCode);

            // revoking takes effect immediately
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/roles/{roleId}/permissions", new { permissionIds = Array.Empty<int>() })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await registrar.GetAsync("/api/students")).StatusCode);
            Assert.Empty(await MenuLabels(registrar, children: true));

            // ---- new module + sub-module + permissions added in bulk ----
            var newModule = await admin.PostAsJsonAsync("/api/modules", new { name = "Reports", slugname = "reports", icon = "chart", sortOrder = 50, isActive = true });
            Assert.Equal(HttpStatusCode.Created, newModule.StatusCode);
            var reportsModuleId = (int)(await Json(newModule))["id"]!;
            Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/api/modules",
                new { name = "Reports 2", slugname = "reports", icon = "chart" })).StatusCode);          // slug must be unique

            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/modules/{reportsModuleId}/submodules",
                new { name = "Evil", icon = "table", route = "javascript:alert(1)", accessName = "evil" })).StatusCode);
            var newSub = await admin.PostAsJsonAsync($"/api/modules/{reportsModuleId}/submodules",
                new { name = "Reports", icon = "chart", route = "/reports", accessName = "reports", order = 1 });
            Assert.Equal(HttpStatusCode.Created, newSub.StatusCode);
            var reportsSubId = (int)(await Json(newSub))["id"]!;

            var bulk = await admin.PostAsJsonAsync($"/api/submodules/{reportsSubId}/permissions/bulk", new { names = new[] { "View", "Export", "Print Report" } });
            Assert.Equal(HttpStatusCode.OK, bulk.StatusCode);
            var bulkBody = await Json(bulk);
            Assert.Equal(new[] { "reports.export", "reports.print-report", "reports.view" },
                ((JsonArray)bulkBody["created"]!).Select(x => (string)x!["name"]!).OrderBy(x => x).ToArray());
            Assert.Equal("Print Report Reports", (string)((JsonArray)bulkBody["created"]!).First(x => (string)x!["name"]! == "reports.print-report")!["displayName"]!);

            var again = await Json(await admin.PostAsJsonAsync($"/api/submodules/{reportsSubId}/permissions/bulk", new { names = new[] { "view", "Approve" } }));
            Assert.Single((JsonArray)again["created"]!);                                              // only Approve is new
            Assert.Equal(new[] { "reports.view" }, ((JsonArray)again["skipped"]!).Select(x => (string)x!).ToArray());

            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/submodules/{reportsSubId}/permissions/bulk",
                new { names = new[] { "Bad<script>" } })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/submodules/{reportsSubId}/permissions",
                new { name = "other.view", displayName = "Wrong prefix" })).StatusCode);

            // grant the Registrar the new module's menu + view permission -> the menu appears for her
            var reportsView = ((JsonArray)(await admin.GetFromJsonAsync<JsonArray>($"/api/submodules/{reportsSubId}/permissions"))!)
                .First(p => (string)p!["name"]! == "reports.view")!;
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/modules/{reportsModuleId}/roles", new { roleIds = new[] { roleId } })).StatusCode);
            Assert.Equal(new[] { roleId }, (await admin.GetFromJsonAsync<JsonArray>($"/api/modules/{reportsModuleId}/roles"))!.Select(x => (string)x!).ToArray());
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/roles/{roleId}/permissions", new { permissionIds = new[] { (int)reportsView["id"]! } })).StatusCode);
            Assert.Equal(new[] { "Reports" }, await MenuLabels(registrar, children: true));

            // the access tree lists the new module with its permissions
            var tree = await Json(await admin.GetAsync("/api/access-tree"));
            var reportsNode = ((JsonArray)tree["modules"]!).First(m => (string)m!["name"]! == "Reports")!;
            Assert.Equal(4, ((JsonArray)reportsNode["submodules"]![0]!["permissions"]!).Count);

            // ---- guard rails ----
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.DeleteAsync($"/api/roles/{(await Roles(admin)).First(r => r.Name == "Admin").Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/roles/{(await Roles(admin)).First(r => r.Name == "Admin").Id}/permissions",
                new { permissionIds = Array.Empty<int>() })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/roles/{(await Roles(admin)).First(r => r.Name == "User").Id}",
                new { name = "Renamed" })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/roles/{roleId}")).StatusCode);     // registrar still has it
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/roles", new { name = "Bad<Name>" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/roles/{roleId}/permissions", new { permissionIds = new[] { 999999 } })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/auth/register",
                new { email = "x@example.com", password = "Xx#123456", role = "NoSuchRole" })).StatusCode);

            // ---- users: list, add, roles and deactivation apply at once, password reset, guard rails ----
            var userList = (await admin.GetFromJsonAsync<JsonArray>("/api/users"))!;
            var adminRow = userList.First(u => (string)u!["email"]! == adminEmail)!;
            var clerkRow = userList.First(u => (string)u!["email"]! == "clerk@example.com")!;
            var adminId = (string)adminRow["id"]!;
            var clerkId = (string)clerkRow["id"]!;
            Assert.True((bool)adminRow["isMe"]!);
            Assert.False((bool)clerkRow["isMe"]!);
            Assert.Contains("Admin", ((JsonArray)adminRow["roles"]!).Select(x => (string)x!));
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.GetAsync("/api/users")).StatusCode);

            var hire = await admin.PostAsJsonAsync("/api/users", new { email = "new.hire@example.com", password = "Hire#12345", roles = new[] { "Registrar" } });
            Assert.Equal(HttpStatusCode.Created, hire.StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/users", new { email = "new.hire@example.com", password = "Hire#12345", roles = Array.Empty<string>() })).StatusCode);   // duplicate
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/users", new { email = "weak@example.com", password = "weak", roles = Array.Empty<string>() })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/users", new { email = "ghost@example.com", password = "Ghost#12345", roles = new[] { "NoSuchRole" } })).StatusCode);

            // a role change reaches someone who is already signed in (same token): the User role may read students, Registrar may not
            Assert.Equal(HttpStatusCode.OK, (await clerk.GetAsync("/api/students")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/users/{clerkId}/roles", new { roles = new[] { "Registrar" } })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.GetAsync("/api/students")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/users/{clerkId}/roles", new { roles = new[] { "User" } })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await clerk.GetAsync("/api/students")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/users/{clerkId}/roles", new { roles = new[] { "NoSuchRole" } })).StatusCode);

            // deactivating signs the user out of everything straight away, and sign-in explains why
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/users/{clerkId}/status", new { active = false })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await clerk.GetAsync("/api/students")).StatusCode);
            using (var anon = Client(baseUrl))
            {
                var blocked = await anon.PostAsJsonAsync("/api/auth/login", new { email = "clerk@example.com", password = "Clerk#12345" });
                Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
                Assert.Contains("deactivated", await blocked.Content.ReadAsStringAsync());
            }
            Assert.False((bool)(await admin.GetFromJsonAsync<JsonArray>("/api/users"))!.First(u => (string)u!["email"]! == "clerk@example.com")!["active"]!);
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/users/{clerkId}/status", new { active = true })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await clerk.GetAsync("/api/students")).StatusCode);

            // an admin password reset: the old password stops working, the new one works; weak ones are refused
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/users/{clerkId}/password", new { newPassword = "weak" })).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync($"/api/users/{clerkId}/password", new { newPassword = "NewClerk#9876" })).StatusCode);
            using (var anon = Client(baseUrl))
            {
                Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/auth/login", new { email = "clerk@example.com", password = "Clerk#12345" })).StatusCode);
                Assert.Equal(HttpStatusCode.OK, (await anon.PostAsJsonAsync("/api/auth/login", new { email = "clerk@example.com", password = "NewClerk#9876" })).StatusCode);
            }

            // guard rails: nobody can lock themselves out
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/users/{adminId}/status", new { active = false })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/users/{adminId}/roles", new { roles = new[] { "User" } })).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync("/api/users/nobody/status", new { active = false })).StatusCode);

            // a role that users hold cannot be deleted until they change role (the new hire is a Registrar)
            Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/roles/{roleId}")).StatusCode);

            // deleting a module removes its sub-modules and permissions
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/modules/{reportsModuleId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/submodules/{reportsSubId}")).StatusCode);
            Assert.Empty(await MenuLabels(registrar, children: true));
        }
        finally
        {
            try { proc?.Kill(entireProcessTree: true); } catch { }
            await Task.Delay(500);
            try { Directory.Delete(dir, true); } catch { }
        }
    }

    private sealed record RoleRow(string Id, string Name);
    private static async Task<List<RoleRow>> Roles(HttpClient admin) =>
        (await admin.GetFromJsonAsync<JsonArray>("/api/roles"))!.Select(r => new RoleRow((string)r!["id"]!, (string)r["name"]!)).ToList();
}
