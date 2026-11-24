using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json.Nodes;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator.Tests;

/// <summary>The starter templates that ship with ProjectBuilder (templates/*.json).</summary>
public class TemplateTests
{
    private static string TemplatesDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "templates"))) dir = dir.Parent;
        return Path.Combine(dir!.FullName, "templates");
    }

    public static IEnumerable<object[]> Templates() =>
        Directory.GetFiles(TemplatesDir(), "*.json").Select(f => new object[] { Path.GetFileNameWithoutExtension(f) });

    private static AppDefinition Load(string key) => AppDefinitionSerializer.FromJson(File.ReadAllText(Path.Combine(TemplatesDir(), key + ".json")));

    [Theory]
    [MemberData(nameof(Templates))]
    public void Every_template_is_valid_and_generates(string key)
    {
        var app = Load(key);
        Assert.Empty(AppDefinitionValidator.Validate(app));

        var files = new ProjectGenerator().Generate(app);
        foreach (var e in app.Entities)
        {
            Assert.Contains(files, f => f.Path == $"api/Controllers/{Naming.Plural(e.Name)}Controller.cs");
            Assert.Contains(files, f => f.Path == $"api/Dtos/{e.Name}Dto.cs");
        }
        Assert.Contains(files, f => f.Path == "web/public/entities.json");

        // preset roles reach the seeder with their permissions spelled out
        var seeder = files.Single(f => f.Path == "api/Data/DbSeeder.cs").Content;
        foreach (var role in app.Roles) Assert.Contains($"(\"{role.Name}\"", seeder);
    }

    [Fact]
    public void School_template_has_the_expected_shape()
    {
        var app = Load("school-management");
        Assert.True(app.AccessControl);
        Assert.Equal(13, app.Entities.Count);
        Assert.Equal(new[] { "Teacher", "Registrar", "Bursar" }, app.Roles.Select(r => r.Name).ToArray());

        var seed = AccessControlSeed.ExtraRoles(app);
        Assert.Equal(13, seed.Single(r => r.Name == "Teacher").Grants.Count);
        Assert.Contains("attendancerecords.create", seed.Single(r => r.Name == "Teacher").Grants);
        Assert.DoesNotContain("invoices.view", seed.Single(r => r.Name == "Teacher").Grants);
        Assert.Contains("feepayments.create", seed.Single(r => r.Name == "Bursar").Grants);
    }

    // ---------- role definitions are validated ----------

    private static AppDefinition WithRoles(bool accessControl, params RoleDefinition[] roles) => new()
    {
        Name = "Demo",
        AccessControl = accessControl,
        Entities = [new EntityDefinition { Name = "Student" }],
        Roles = roles.ToList()
    };

    [Fact]
    public void Roles_need_access_control() =>
        Assert.Contains(AppDefinitionValidator.Validate(WithRoles(false, new RoleDefinition { Name = "Teacher" })), e => e.Contains("Access control"));

    [Theory]
    [InlineData("Admin")]        // built-in
    [InlineData("user")]         // built-in, any case
    [InlineData("Bad<Role>")]    // unsafe characters
    public void Rejects_bad_role_names(string name) =>
        Assert.NotEmpty(AppDefinitionValidator.Validate(WithRoles(true, new RoleDefinition { Name = name })));

    [Fact]
    public void Rejects_grants_to_unknown_entities_or_actions()
    {
        var unknownEntity = WithRoles(true, new RoleDefinition { Name = "Teacher", Grants = new() { ["nothing"] = ["View"] } });
        Assert.Contains(AppDefinitionValidator.Validate(unknownEntity), e => e.Contains("unknown entity"));

        var unknownAction = WithRoles(true, new RoleDefinition { Name = "Teacher", Grants = new() { ["students"] = ["Fly"] } });
        Assert.Contains(AppDefinitionValidator.Validate(unknownAction), e => e.Contains("not an action"));

        var ok = WithRoles(true, new RoleDefinition { Name = "Teacher", Grants = new() { ["students"] = ["view", "Create"] } });
        Assert.Empty(AppDefinitionValidator.Validate(ok));
    }

    [Fact]
    public void Rejects_duplicate_roles() =>
        Assert.NotEmpty(AppDefinitionValidator.Validate(WithRoles(true, new RoleDefinition { Name = "Teacher" }, new RoleDefinition { Name = "teacher" })));

    // ---------- the School Management system, running for real ----------

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

    private static async Task<HttpClient> SignedIn(string baseUrl, string email, string password)
    {
        using var anon = Client(baseUrl);
        var res = await anon.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return Client(baseUrl, (string)(await res.Content.ReadFromJsonAsync<JsonNode>())!["token"]!);
    }

    private static async Task<string> Create(HttpClient c, string route, object body)
    {
        var res = await c.PostAsJsonAsync("/api/" + route, body);
        Assert.True(res.StatusCode == HttpStatusCode.Created, $"POST /api/{route} -> {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return (string)(await res.Content.ReadFromJsonAsync<JsonNode>())!["id"]!;
    }

    private static async Task<List<string>> MenuChildren(HttpClient c) =>
        (await c.GetFromJsonAsync<JsonArray>("/api/menu"))!
            .SelectMany(n => (n!["children"] as JsonArray)?.Select(x => (string)x!["label"]!) ?? []).ToList();

    [Fact]
    [Trait("Category", "Integration")]
    public async Task School_management_runs_with_its_preset_roles()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pb-school-" + Guid.NewGuid().ToString("N"));
        Process? proc = null;
        try
        {
            new ProjectGenerator().WriteTo(Load("school-management"), dir);
            var settings = JsonNode.Parse(File.ReadAllText(Path.Combine(dir, "api", "appsettings.json")))!;
            var baseUrl = $"http://127.0.0.1:{FreePort()}";
            proc = Process.Start(new ProcessStartInfo("dotnet", $"run --no-launch-profile --urls {baseUrl}")
            {
                WorkingDirectory = Path.Combine(dir, "api"), UseShellExecute = false, CreateNoWindow = true
            })!;
            using (var probe = Client(baseUrl)) await GeneratedAppEndToEndTests.WaitUntilUp(probe, proc);

            using var admin = await SignedIn(baseUrl, (string)settings["Seed"]!["AdminEmail"]!, (string)settings["Seed"]!["AdminPassword"]!);

            // ---- the preset roles exist, with their permissions ----
            var roles = (await admin.GetFromJsonAsync<JsonArray>("/api/roles"))!;
            int Grants(string role) => ((JsonArray)roles.First(r => (string)r!["name"]! == role)!["permissionIds"]!).Count;
            Assert.Equal(new[] { "Admin", "Bursar", "Registrar", "Teacher", "User" }, roles.Select(r => (string)r!["name"]!).Order().ToArray());
            Assert.Equal(13, Grants("Teacher"));
            Assert.Equal(11, Grants("Registrar"));
            Assert.Equal(11, Grants("Bursar"));
            Assert.Equal("Senior", (string)roles.First(r => (string)r!["name"]! == "Registrar")!["level"]!);

            // ---- a realistic chain of records through every relationship ----
            var year = await Create(admin, "academicyears", new { name = "2026", startDate = "2026-01-12", endDate = "2026-12-04", isCurrent = true });
            var teacher = await Create(admin, "teachers", new { firstName = "Grace", lastName = "Dube", employeeNumber = "T-001", isActive = true, hireDate = "2020-01-06", email = "grace@school.example" });
            var subject = await Create(admin, "subjects", new { code = "MATH", name = "Mathematics" });
            var klass = await Create(admin, "schoolclasses", new { name = "Form 1A", level = "Form 1", capacity = 35, academicYearId = year, classTeacherId = teacher });
            var student = await Create(admin, "students", new { firstName = "Tendai", lastName = "Moyo", dateOfBirth = "2011-03-04", studentNumber = "S-1001", gender = "Female", schoolClassId = klass });
            await Create(admin, "guardians", new { fullName = "Mrs Moyo", phone = "0771234567", relationship = "Mother", studentId = student });
            await Create(admin, "timetableentries", new { day = "Monday", startTime = "08:00", endTime = "08:40", room = "R1", schoolClassId = klass, subjectId = subject, teacherId = teacher });
            await Create(admin, "attendancerecords", new { date = "2026-02-02", status = "Present", studentId = student });
            var assessment = await Create(admin, "assessments", new { title = "Term 1 test", date = "2026-04-10", maxScore = 100, weight = 30, schoolClassId = klass, subjectId = subject });
            await Create(admin, "results", new { score = 78.5, comment = "Good work", assessmentId = assessment, studentId = student });
            var fees = await Create(admin, "feestructures", new { name = "Term 1 fees", amount = 450.00, academicYearId = year });
            var invoice = await Create(admin, "invoices", new { number = "INV-0001", issuedOn = "2026-01-05", dueOn = "2026-02-05", amount = 450.00, status = "Open", studentId = student, feeStructureId = fees });
            await Create(admin, "feepayments", new { amount = 200.00, paidOn = "2026-01-20", method = "Cash", reference = "R-1", invoiceId = invoice });

            var results = (await admin.GetFromJsonAsync<JsonNode>("/api/results"))!;
            Assert.Equal(78.5m, (decimal)results["items"]![0]!["score"]!);
            Assert.Equal(StatusCode(HttpStatusCode.Conflict), StatusCode((await admin.PostAsJsonAsync("/api/students",
                new { firstName = "Dup", lastName = "Licate", dateOfBirth = "2011-01-01", studentNumber = "S-1001" })).StatusCode));   // unique student number

            // ---- Teacher: marks attendance and enters results, cannot touch fees or delete ----
            foreach (var (email, role) in new[] { ("teacher@school.example", "Teacher"), ("registrar@school.example", "Registrar"), ("bursar@school.example", "Bursar") })
                Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/auth/register", new { email, password = "School#12345", role })).StatusCode);

            using var teach = await SignedIn(baseUrl, "teacher@school.example", "School#12345");
            Assert.Equal(HttpStatusCode.OK, (await teach.GetAsync("/api/attendancerecords")).StatusCode);
            Assert.Equal(HttpStatusCode.Created, (await teach.PostAsJsonAsync("/api/attendancerecords", new { date = "2026-02-03", status = "Late", studentId = student })).StatusCode);
            Assert.Equal(HttpStatusCode.Created, (await teach.PostAsJsonAsync("/api/results", new { score = 64, assessmentId = assessment, studentId = student })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await teach.GetAsync("/api/invoices")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await teach.PostAsJsonAsync("/api/students", new { firstName = "X", lastName = "Y", dateOfBirth = "2011-01-01", studentNumber = "S-9" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await teach.DeleteAsync($"/api/students/{student}")).StatusCode);
            var teacherMenu = await MenuChildren(teach);
            Assert.Contains("Attendance Records", teacherMenu);
            Assert.Contains("Results", teacherMenu);
            Assert.DoesNotContain("Invoices", teacherMenu);
            Assert.DoesNotContain("Roles", teacherMenu);

            // ---- Registrar: admissions, no marks or fees ----
            using var reg = await SignedIn(baseUrl, "registrar@school.example", "School#12345");
            Assert.Equal(HttpStatusCode.Created, (await reg.PostAsJsonAsync("/api/students", new { firstName = "Rudo", lastName = "Ncube", dateOfBirth = "2012-06-01", studentNumber = "S-1002", schoolClassId = klass })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await reg.GetAsync("/api/results")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await reg.GetAsync("/api/invoices")).StatusCode);
            Assert.Contains("Teachers", await MenuChildren(reg));
            Assert.DoesNotContain("Results", await MenuChildren(reg));

            // ---- Bursar: fees only ----
            using var bursar = await SignedIn(baseUrl, "bursar@school.example", "School#12345");
            Assert.Equal(HttpStatusCode.OK, (await bursar.GetAsync("/api/invoices")).StatusCode);
            Assert.Equal(HttpStatusCode.Created, (await bursar.PostAsJsonAsync("/api/feepayments", new { amount = 250.00, paidOn = "2026-02-01", method = "EcoCash", invoiceId = invoice })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await bursar.GetAsync("/api/attendancerecords")).StatusCode);
            var bursarMenu = await MenuChildren(bursar);
            Assert.Contains("Invoices", bursarMenu);
            Assert.DoesNotContain("Attendance Records", bursarMenu);
        }
        finally
        {
            try { proc?.Kill(entireProcessTree: true); } catch { }
            await Task.Delay(500);
            try { Directory.Delete(dir, true); } catch { }
        }
    }

    private static int StatusCode(HttpStatusCode c) => (int)c;
}
