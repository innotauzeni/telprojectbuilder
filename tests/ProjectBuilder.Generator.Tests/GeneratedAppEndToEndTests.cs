using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ProjectBuilder.Generator.Tests;

/// <summary>Generates the Enrolment system, runs it for real (SQLite) and exercises auth + CRUD over HTTP.</summary>
public class GeneratedAppEndToEndTests
{
    private static int FreePort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Generated_api_requires_login_and_enforces_roles()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pb-e2e-" + Guid.NewGuid().ToString("N"));
        Process? proc = null;
        try
        {
            new ProjectGenerator().WriteTo(ProjectGeneratorTests.Enrolment(), dir);
            var settings = JsonNode.Parse(File.ReadAllText(Path.Combine(dir, "api", "appsettings.json")))!;
            var adminEmail = (string)settings["Seed"]!["AdminEmail"]!;
            var adminPassword = (string)settings["Seed"]!["AdminPassword"]!;

            var port = FreePort();
            var baseUrl = $"http://127.0.0.1:{port}";
            proc = Process.Start(new ProcessStartInfo("dotnet", $"run --no-launch-profile --urls {baseUrl}")
            {
                WorkingDirectory = Path.Combine(dir, "api"), UseShellExecute = false, CreateNoWindow = true
            })!;

            using var http = new HttpClient { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(30) };
            await WaitUntilUp(http, proc);

            // 1. No token -> 401
            Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/students")).StatusCode);

            // 2. Wrong password -> 401, right password -> token
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await http.PostAsJsonAsync("/api/auth/login", new { email = adminEmail, password = "wrong" })).StatusCode);
            var login = await http.PostAsJsonAsync("/api/auth/login", new { email = adminEmail, password = adminPassword });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            var adminToken = (string)(await login.Content.ReadFromJsonAsync<JsonNode>())!["token"]!;
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

            // 3. Validation: missing required fields -> 400
            Assert.Equal(HttpStatusCode.BadRequest,
                (await http.PostAsJsonAsync("/api/students", new { firstName = "Ann" })).StatusCode);

            // 4. Create + read back as DTO (no navigation noise)
            var created = await http.PostAsJsonAsync("/api/students", new
            {
                firstName = "Ann", lastName = "Moyo", dateOfBirth = "2010-05-01", studentNumber = "S001"
            });
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            var student = (await created.Content.ReadFromJsonAsync<JsonNode>())!;
            var id = (string)student["id"]!;
            Assert.Equal("Ann", (string)student["firstName"]!);

            // 5. Duplicate unique value -> 409, not a 500
            Assert.Equal(HttpStatusCode.Conflict, (await http.PostAsJsonAsync("/api/students", new
            {
                firstName = "Bob", lastName = "Dube", dateOfBirth = "2011-01-01", studentNumber = "S001"
            })).StatusCode);

            // 6. Bad foreign key -> 409
            Assert.Equal(HttpStatusCode.Conflict, (await http.PostAsJsonAsync("/api/guardians", new
            {
                fullName = "Mr Moyo", phone = "0770000000", studentId = Guid.NewGuid()
            })).StatusCode);

            // 7. Admin creates a plain user; that user can read but cannot delete
            Assert.Equal(HttpStatusCode.Created, (await http.PostAsJsonAsync("/api/auth/register",
                new { email = "clerk@example.com", password = "Clerk#12345", role = "User" })).StatusCode);
            var clerkLogin = await http.PostAsJsonAsync("/api/auth/login", new { email = "clerk@example.com", password = "Clerk#12345" });
            var clerkToken = (string)(await clerkLogin.Content.ReadFromJsonAsync<JsonNode>())!["token"]!;

            using var clerk = new HttpClient { BaseAddress = http.BaseAddress };
            clerk.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", clerkToken);
            Assert.Equal(HttpStatusCode.OK, (await clerk.GetAsync($"/api/students/{id}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.DeleteAsync($"/api/students/{id}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.PostAsJsonAsync("/api/auth/register",
                new { email = "x@example.com", password = "Xx#123456", role = "Admin" })).StatusCode);

            // 7b. Dynamic menu: stored in the database, filtered by role, editable by admins only
            var adminMenu = (await http.GetFromJsonAsync<JsonArray>("/api/menu"))!.Select(x => (string)x!["label"]!).ToList();
            var clerkMenu = (await clerk.GetFromJsonAsync<JsonArray>("/api/menu"))!.Select(x => (string)x!["label"]!).ToList();
            Assert.Contains("Dashboard", adminMenu);
            Assert.Contains("Students", adminMenu);
            Assert.Contains("Menu", adminMenu);          // Admin-only entry
            Assert.Contains("Students", clerkMenu);
            Assert.DoesNotContain("Menu", clerkMenu);    // hidden from the User role
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.GetAsync("/api/menu-items")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await clerk.PostAsJsonAsync("/api/menu-items",
                new { label = "X", route = "/x" })).StatusCode);

            // unsafe routes are rejected (no javascript: links or other sites through the menu)
            Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsJsonAsync("/api/menu-items",
                new { label = "Evil", route = "javascript:alert(1)", sortOrder = 5 })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsJsonAsync("/api/menu-items",
                new { label = "Evil", route = "https://evil.example", sortOrder = 5 })).StatusCode);

            var newItem = await http.PostAsJsonAsync("/api/menu-items",
                new { label = "Reports", route = "/e/students", icon = "chart", sortOrder = 5, roles = "Admin, User", isVisible = true });
            Assert.Equal(HttpStatusCode.Created, newItem.StatusCode);
            var newId = (string)(await newItem.Content.ReadFromJsonAsync<JsonNode>())!["id"]!;
            Assert.Contains("Reports", (await clerk.GetFromJsonAsync<JsonArray>("/api/menu"))!.Select(x => (string)x!["label"]!));

            // hide it again -> disappears for everyone without redeploying
            Assert.Equal(HttpStatusCode.NoContent, (await http.PutAsJsonAsync($"/api/menu-items/{newId}",
                new { id = newId, label = "Reports", route = "/e/students", icon = "chart", sortOrder = 5, roles = "Admin, User", isVisible = false })).StatusCode);
            Assert.DoesNotContain("Reports", (await clerk.GetFromJsonAsync<JsonArray>("/api/menu"))!.Select(x => (string)x!["label"]!));
            Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"/api/menu-items/{newId}")).StatusCode);

            // 8. Admin can delete
            Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"/api/students/{id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/students/{id}")).StatusCode);
        }
        finally
        {
            try { proc?.Kill(entireProcessTree: true); } catch { }
            await Task.Delay(500);
            try { Directory.Delete(dir, true); } catch { }
        }
    }

    private static async Task WaitUntilUp(HttpClient http, Process proc)
    {
        var deadline = DateTime.UtcNow.AddMinutes(4); // first run restores + compiles
        while (DateTime.UtcNow < deadline)
        {
            if (proc.HasExited) throw new Exception("Generated app exited early with code " + proc.ExitCode);
            try
            {
                var r = await http.GetAsync("/swagger/v1/swagger.json");
                if (r.IsSuccessStatusCode) return;
            }
            catch { /* not up yet */ }
            await Task.Delay(1000);
        }
        throw new TimeoutException("Generated app did not start in time.");
    }
}
