using System.Text.Json.Nodes;

namespace ProjectBuilder.Generator.Tests;

public class OpenApiGeneratorTests
{
    [Fact]
    public void Describes_every_entity_with_crud_paths_and_required_fields()
    {
        var json = OpenApiGenerator.Generate(ProjectGeneratorTests.Enrolment(), "/x");
        var doc = JsonNode.Parse(json)!;

        Assert.Equal("3.0.1", (string?)doc["openapi"]);
        Assert.NotNull(doc["paths"]!["/api/students"]!["get"]);
        Assert.NotNull(doc["paths"]!["/api/students"]!["post"]);
        Assert.NotNull(doc["paths"]!["/api/students/{id}"]!["delete"]);

        var student = doc["components"]!["schemas"]!["Student"]!;
        Assert.Contains("firstName", student["required"]!.AsArray().Select(x => (string?)x));
        Assert.Equal("uuid", (string?)doc["components"]!["schemas"]!["Enrolment"]!["properties"]!["studentId"]!["format"]);
    }
}
