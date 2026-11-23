namespace ProjectBuilder.Generator.Tests;

/// <summary>Manual helper: set PB_EMIT=&lt;dir&gt; to write the generated Enrolment project there for hands-on testing.</summary>
public class EmitTests
{
    [Fact]
    [Trait("Category", "Manual")]
    public void Emit()
    {
        var dir = Environment.GetEnvironmentVariable("PB_EMIT");
        if (dir is null) return;
        new ProjectGenerator().WriteTo(ProjectGeneratorTests.Enrolment(), dir);
    }
}
