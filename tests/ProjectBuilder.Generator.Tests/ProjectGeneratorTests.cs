using System.Diagnostics;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator.Tests;

public class ProjectGeneratorTests
{
    private static string TemplatePath(string file)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "templates"))) dir = dir.Parent;
        return Path.Combine(dir!.FullName, "templates", file);
    }

    public static AppDefinition Enrolment(DbProvider db = DbProvider.Sqlite)
    {
        var json = File.ReadAllText(TemplatePath("enrolment.json"));
        var app = AppDefinitionSerializer.FromJson(json);
        return new AppDefinition { Name = app.Name, Database = db, Targets = app.Targets, DynamicMenu = app.DynamicMenu, AccessControl = app.AccessControl, Entities = app.Entities };
    }

    /// <summary>The Enrolment system with the simple database menu (no roles/permissions screens).</summary>
    public static AppDefinition EnrolmentSimpleMenu()
    {
        var app = Enrolment();
        return new AppDefinition { Name = app.Name, Database = app.Database, Targets = app.Targets, DynamicMenu = true, AccessControl = false, Entities = app.Entities };
    }

    [Fact]
    public void Enrolment_template_is_valid()
        => Assert.Empty(AppDefinitionValidator.Validate(Enrolment()));

    [Theory]
    [InlineData("class")]
    [InlineData("Bad Name")]
    [InlineData("x;System.IO.File.Delete(\"a\")")]
    [InlineData("1abc")]
    public void Rejects_unsafe_entity_names(string name)
    {
        var app = new AppDefinition { Name = "Demo", Entities = [new EntityDefinition { Name = name }] };
        Assert.NotEmpty(AppDefinitionValidator.Validate(app));
        Assert.Throws<InvalidDefinitionException>(() => new ProjectGenerator().Generate(app));
    }

    [Fact]
    public void Rejects_relation_to_unknown_entity()
    {
        var app = new AppDefinition
        {
            Name = "Demo",
            Entities = [new EntityDefinition { Name = "A", Relations = [new RelationDefinition { Name = "B", TargetEntity = "Nope" }] }]
        };
        Assert.Contains(AppDefinitionValidator.Validate(app), e => e.Contains("unknown entity"));
    }

    [Fact]
    public void Generates_expected_files_and_zip()
    {
        var gen = new ProjectGenerator();
        var files = gen.Generate(Enrolment());
        Assert.Contains(files, f => f.Path == "api/Controllers/StudentsController.cs");
        Assert.Contains(files, f => f.Path == "api/Data/AppDbContext.cs");
        Assert.Contains(files, f => f.Path == "api/EnrolmentSystem.csproj");
        Assert.Contains(files, f => f.Path == "api/Dockerfile");
        Assert.True(gen.ToZip(Enrolment()).Length > 1000);
    }

    /// <summary>
    /// The quality bar: the generated project must restore and compile. Needs network (NuGet).
    /// </summary>
    [Theory]
    [InlineData(DbProvider.Sqlite)]
    [InlineData(DbProvider.SqlServer)]
    [InlineData(DbProvider.PostgreSql)]
    [Trait("Category", "Integration")]
    public void Generated_project_builds(DbProvider db)
    {
        var dir = Path.Combine(Path.GetTempPath(), "pb-gen-" + Guid.NewGuid().ToString("N"));
        try
        {
            new ProjectGenerator().WriteTo(Enrolment(db), dir);
            var psi = new ProcessStartInfo("dotnet", "build --nologo -v q")
            {
                WorkingDirectory = Path.Combine(dir, "api"), RedirectStandardOutput = true, RedirectStandardError = true
            };
            using var p = Process.Start(psi)!;
            var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
            p.WaitForExit();
            Assert.True(p.ExitCode == 0, output);
        }
        finally { try { Directory.Delete(dir, true); } catch { } }
    }
}
