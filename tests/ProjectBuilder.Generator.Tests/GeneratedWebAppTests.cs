using System.Diagnostics;
using System.Text.Json.Nodes;

namespace ProjectBuilder.Generator.Tests;

public class GeneratedWebAppTests
{
    [Fact]
    public void Web_app_files_describe_the_entities()
    {
        var files = new ProjectGenerator().Generate(ProjectGeneratorTests.Enrolment());

        Assert.Contains(files, f => f.Path == "web/package.json");
        Assert.Contains(files, f => f.Path == "web/src/app/pages/entity-list.ts");
        Assert.Contains(files, f => f.Path == "docker-compose.yml" && f.Content.Contains("build: ./web"));

        var entities = files.Single(f => f.Path == "web/public/entities.json").Content;
        Assert.Contains("\"appName\": \"Enrolment System\"", entities);
        Assert.Contains("\"accessControl\": true", entities);
        Assert.Contains(files, x => x.Path == "web/src/app/pages/access/roles.ts");
        Assert.Contains(files, x => x.Path == "web/src/app/pages/access/users.ts");
        Assert.Contains(files, x => x.Path == "api/Controllers/AccessControlController.cs");
        Assert.Contains(files, x => x.Path == "api/Domain/AccessControl.cs" && x.Content.Contains("class Submodule") && x.Content.Contains("childrens"));
        Assert.Contains(files, x => x.Path == "api/Domain/Role.cs" && x.Content.Contains("RoleMenus"));
        Assert.Contains("\"route\": \"students\"", entities);
        Assert.Contains("\"icon\": \"graduation-cap\"", entities);
        Assert.Contains("\"label\": \"Date Of Birth\"", entities);
        Assert.Contains("\"key\": \"studentId\"", entities);
        Assert.DoesNotContain("__APP_NAME__", string.Concat(files.Where(f => f.Path.StartsWith("web/")).Select(f => f.Content)));
        Assert.Contains("\"name\": \"enrolment-system-web\"", files.Single(f => f.Path == "web/package.json").Content);
    }

    [Fact]
    public void Web_app_is_omitted_when_not_selected()
    {
        var def = ProjectGeneratorTests.Enrolment();
        var apiOnly = new ProjectBuilder.Core.AppDefinition
        {
            Name = def.Name, Database = def.Database, Entities = def.Entities,
            Targets = ProjectBuilder.Core.Targets.WebApi
        };
        var files = new ProjectGenerator().Generate(apiOnly);
        Assert.DoesNotContain(files, f => f.Path.StartsWith("web/"));
        Assert.DoesNotContain(files, f => f.Path == "docker-compose.yml");
    }

    /// <summary>The quality bar for the web target: the generated Angular app must install and compile. Needs Node + internet.</summary>
    [Fact]
    [Trait("Category", "Integration")]
    public void Generated_angular_app_builds()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pb-web-" + Guid.NewGuid().ToString("N"));
        try
        {
            new ProjectGenerator().WriteTo(ProjectGeneratorTests.Enrolment(), dir);
            var web = Path.Combine(dir, "web");
            Run(web, "npm install --no-audit --no-fund");
            Run(web, "npm run build");
            Assert.True(File.Exists(Path.Combine(web, "dist", "web", "browser", "index.html")));
            // config.json must ship so the API address can be changed without rebuilding
            var cfg = JsonNode.Parse(File.ReadAllText(Path.Combine(web, "dist", "web", "browser", "config.json")))!;
            Assert.Equal("/api", (string)cfg["apiBaseUrl"]!);
        }
        finally { try { Directory.Delete(dir, true); } catch { } }
    }

    private static void Run(string dir, string command)
    {
        var windows = OperatingSystem.IsWindows();
        var psi = new ProcessStartInfo(windows ? "cmd" : "sh", windows ? $"/c {command}" : $"-c \"{command}\"")
        {
            WorkingDirectory = dir, RedirectStandardOutput = true, RedirectStandardError = true
        };
        using var p = Process.Start(psi)!;
        var stdout = p.StandardOutput.ReadToEndAsync();
        var stderr = p.StandardError.ReadToEndAsync();
        p.WaitForExit();
        Assert.True(p.ExitCode == 0, $"`{command}` failed:\n{stdout.Result}\n{stderr.Result}");
    }
}
