using ProjectBuilder.Core;
using ProjectBuilder.Generator;

namespace ProjectBuilder.Generator.Tests;

public class EntityGeneratorTests
{
    [Fact]
    public void Generates_entity_with_fields_and_relation()
    {
        var app = new AppDefinition
        {
            Name = "Enrolment System",
            Entities =
            [
                new EntityDefinition { Name = "Student", Fields = [new FieldDefinition { Name = "FullName", Required = true }] },
                new EntityDefinition
                {
                    Name = "Enrolment",
                    Relations = [new RelationDefinition { Name = "Student", TargetEntity = "Student" }]
                }
            ]
        };

        var files = new EntityGenerator().Generate(app).ToList();

        Assert.Equal(2, files.Count);
        Assert.Contains("public string FullName { get; set; } = default!;", files[0].Content);
        Assert.Contains("public Guid StudentId { get; set; }", files[1].Content);
        Assert.Contains("namespace EnrolmentSystem.Domain;", files[1].Content);
    }
}
