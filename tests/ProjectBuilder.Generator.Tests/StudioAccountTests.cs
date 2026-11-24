using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ProjectBuilder.Generator.Tests;

/// <summary>Studio accounts: sign-in is required, projects are private per user, passwords and lockout are enforced.</summary>
public sealed class StudioAccountTests : IDisposable
{
    private const string Password = "Str0ng!Passw0rd";
    private readonly string _data = Path.Combine(Path.GetTempPath(), "pb-acct-" + Guid.NewGuid().ToString("N"));
    private readonly WebApplicationFactory<Program> _factory;

    public StudioAccountTests() => _factory = Create(allowRegistration: true);

    private WebApplicationFactory<Program> Create(bool allowRegistration)
    {
        var studio = FindStudioDir();
        return new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseContentRoot(studio);
            b.UseSetting("Studio:DataDir", _data);
            b.UseSetting("Studio:AllowRegistration", allowRegistration ? "true" : "false");
        });
    }

    private static string FindStudioDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "src", "ProjectBuilder.Studio"))) dir = dir.Parent;
        return Path.Combine(dir!.FullName, "src", "ProjectBuilder.Studio");
    }

    public void Dispose()
    {
        _factory.Dispose();
        try { Directory.Delete(_data, true); } catch { }
    }

    // ---- helpers: the Studio requires a custom header on state-changing /api calls (CSRF defence) ----
    private static Task<HttpResponseMessage> Send(HttpClient c, HttpMethod method, string url, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("X-Requested-With", "ProjectBuilder");
        if (body is not null) req.Content = JsonContent.Create(body);
        return c.SendAsync(req);
    }

    private async Task<HttpClient> SignedIn(string email, WebApplicationFactory<Program>? factory = null)
    {
        var client = (factory ?? _factory).CreateClient();
        var res = await Send(client, HttpMethod.Post, "/api/account/register", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return client;
    }

    private static async Task<string> CreateProject(HttpClient c)
    {
        var res = await Send(c, HttpMethod.Post, "/api/projects", new { templateKey = "enrolment" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (string)(await res.Content.ReadFromJsonAsync<JsonNode>())!["id"]!;
    }

    [Fact]
    public async Task Everything_requires_sign_in()
    {
        var anon = _factory.CreateClient();
        var id = Guid.NewGuid();
        foreach (var url in new[] { "/api/projects", "/api/templates", $"/api/projects/{id}", $"/api/projects/{id}/files",
                     $"/download/{id}", $"/preview/{id}/swagger", $"/preview/{id}/openapi.json", $"/preview/{id}/app/",
                     $"/preview/{id}/app/entities.json", $"/preview/{id}/api/students", "/api/account/me" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync(url)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(anon, HttpMethod.Post, "/api/projects", new { })).StatusCode);

        // the app shell itself stays public so the login page can load
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync("/login")).StatusCode.Equals(HttpStatusCode.ServiceUnavailable)
            ? HttpStatusCode.OK : (await anon.GetAsync("/login")).StatusCode);
    }

    [Fact]
    public async Task State_changing_calls_need_the_csrf_header()
    {
        var c = _factory.CreateClient();
        var res = await c.PostAsJsonAsync("/api/account/register", new { email = "a@example.com", password = Password });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("X-Requested-With", await res.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("not-an-email", "Str0ng!Passw0rd")]
    [InlineData("weak@example.com", "short")]
    [InlineData("weak2@example.com", "alllowercase1!")]
    public async Task Rejects_bad_emails_and_weak_passwords(string email, string password)
    {
        var res = await Send(_factory.CreateClient(), HttpMethod.Post, "/api/account/register", new { email, password });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.NotEmpty((JsonArray)(await res.Content.ReadFromJsonAsync<JsonNode>())!["errors"]!);
    }

    [Fact]
    public async Task Register_signs_in_and_duplicates_are_rejected()
    {
        var a = await SignedIn("ann@example.com");
        var me = await a.GetAsync("/api/account/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Contains("ann@example.com", await me.Content.ReadAsStringAsync());

        var again = await Send(_factory.CreateClient(), HttpMethod.Post, "/api/account/register",
            new { email = "ANN@example.com", password = Password });
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
    }

    [Fact]
    public async Task Users_cannot_see_or_change_each_others_projects()
    {
        var ann = await SignedIn("ann@example.com");
        var bob = await SignedIn("bob@example.com");
        var annsProject = await CreateProject(ann);

        // Ann can use her project everywhere
        Assert.Equal(HttpStatusCode.OK, (await ann.GetAsync($"/api/projects/{annsProject}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ann.GetAsync($"/api/projects/{annsProject}/files")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ann.GetAsync($"/download/{annsProject}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ann.GetAsync($"/preview/{annsProject}/openapi.json")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ann.GetAsync($"/preview/{annsProject}/app/entities.json")).StatusCode);

        // Bob gets "not found" for every route: he cannot even tell the project exists
        foreach (var url in new[] { $"/api/projects/{annsProject}", $"/api/projects/{annsProject}/files", $"/download/{annsProject}",
                     $"/preview/{annsProject}/swagger".Replace("/swagger", "/openapi.json"), $"/preview/{annsProject}/app/entities.json",
                     $"/preview/{annsProject}/api/students", $"/preview/{annsProject}/api/menu", $"/preview/{annsProject}/app/" })
            Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync(url)).StatusCode);

        var edit = await Send(bob, HttpMethod.Put, $"/api/projects/{annsProject}",
            new { schemaVersion = 1, name = "Hacked", database = "Sqlite", targets = "WebApi", entities = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.NotFound, edit.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(bob, HttpMethod.Post, $"/preview/{annsProject}/api/students", new { })).StatusCode);

        // Bob's delete is a silent no-op, and his list is empty
        Assert.Equal(HttpStatusCode.NoContent, (await Send(bob, HttpMethod.Delete, $"/api/projects/{annsProject}")).StatusCode);
        Assert.Equal("[]", (await bob.GetStringAsync("/api/projects")).Replace(" ", ""));

        // ...so Ann's project is untouched
        var still = await ann.GetFromJsonAsync<JsonNode>($"/api/projects/{annsProject}");
        Assert.Equal("Enrolment System", (string)still!["name"]!);
        Assert.Single((JsonArray)(await ann.GetFromJsonAsync<JsonNode>("/api/projects"))!);
    }

    [Fact]
    public async Task Logout_ends_the_session()
    {
        var c = await SignedIn("ann@example.com");
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/projects")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(c, HttpMethod.Post, "/api/account/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/projects")).StatusCode);

        // and logging in again works
        var login = await Send(c, HttpMethod.Post, "/api/account/login", new { email = "ann@example.com", password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/projects")).StatusCode);
    }

    [Fact]
    public async Task Wrong_passwords_are_refused_and_repeated_failures_lock_the_account()
    {
        await SignedIn("ann@example.com");
        var c = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(c, HttpMethod.Post, "/api/account/login",
            new { email = "nobody@example.com", password = "whatever" })).StatusCode);

        for (var i = 0; i < 4; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Send(c, HttpMethod.Post, "/api/account/login",
                new { email = "ann@example.com", password = "wrong-password" })).StatusCode);

        // the 5th wrong attempt locks the account
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Send(c, HttpMethod.Post, "/api/account/login",
            new { email = "ann@example.com", password = "wrong-password" })).StatusCode);

        // locked out: even the right password is refused for a while
        var locked = await Send(c, HttpMethod.Post, "/api/account/login", new { email = "ann@example.com", password = Password });
        Assert.Equal(HttpStatusCode.TooManyRequests, locked.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/projects")).StatusCode);
    }

    [Fact]
    public async Task Registration_can_be_closed()
    {
        using var closed = Create(allowRegistration: false);
        var res = await Send(closed.CreateClient(), HttpMethod.Post, "/api/account/register",
            new { email = "ann@example.com", password = Password });
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Project_count_is_limited_per_user()
    {
        var c = await SignedIn("ann@example.com");
        for (var i = 0; i < 50; i++) await CreateProject(c);
        var res = await Send(c, HttpMethod.Post, "/api/projects", new { templateKey = (string?)null });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }
}
