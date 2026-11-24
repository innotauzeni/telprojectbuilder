using System.Text.Json;
using System.Text.Json.Nodes;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator;

/// <summary>
/// Builds an OpenAPI 3 document describing the API that <see cref="ProjectGenerator"/> will generate.
/// Used by the Studio preview so users can explore their design before downloading it.
/// </summary>
public static class OpenApiGenerator
{
    public static string CamelCase(string name) => char.ToLowerInvariant(name[0]) + name[1..];

    public static string Generate(AppDefinition app, string serverUrl)
    {
        var errors = AppDefinitionValidator.Validate(app);
        if (errors.Count > 0) throw new InvalidDefinitionException(errors);

        var schemas = new JsonObject();
        var paths = new JsonObject();

        foreach (var e in app.Entities)
        {
            schemas[e.Name] = EntitySchema(e);
            var route = "/api/" + Naming.Plural(e.Name).ToLowerInvariant();
            var tag = Naming.Plural(e.Name);
            var itemRef = Ref(e.Name);

            paths[route] = new JsonObject
            {
                ["get"] = Op(tag, $"List {tag}", null, ListResponse(itemRef),
                    Query("page", "integer"), Query("pageSize", "integer")),
                ["post"] = Op(tag, $"Create {e.Name}", itemRef, Response("201", "Created", itemRef))
            };
            var idParam = new JsonObject
            {
                ["name"] = "id", ["in"] = "path", ["required"] = true,
                ["schema"] = new JsonObject { ["type"] = "string", ["format"] = "uuid" }
            };
            paths[route + "/{id}"] = new JsonObject
            {
                ["get"] = Op(tag, $"Get {e.Name}", null, Response("200", "OK", itemRef), idParam),
                ["put"] = Op(tag, $"Update {e.Name}", itemRef, Response("204", "No content", null), idParam),
                ["delete"] = Op(tag, $"Delete {e.Name}", null, Response("204", "No content", null), idParam)
            };
        }

        if (app.DynamicMenu) AddMenu(schemas, paths);

        var doc = new JsonObject
        {
            ["openapi"] = "3.0.1",
            ["info"] = new JsonObject { ["title"] = app.Name + " API", ["version"] = "v1" },
            ["servers"] = new JsonArray(new JsonObject { ["url"] = serverUrl }),
            ["paths"] = paths,
            ["components"] = new JsonObject { ["schemas"] = schemas }
        };
        return doc.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    /// <summary>Menu endpoints that exist when the project has a dynamic menu.</summary>
    private static void AddMenu(JsonObject schemas, JsonObject paths)
    {
        schemas["MenuItem"] = new JsonObject
        {
            ["type"] = "object",
            ["required"] = new JsonArray("label", "route"),
            ["properties"] = new JsonObject
            {
                ["id"] = new JsonObject { ["type"] = "string", ["format"] = "uuid", ["readOnly"] = true },
                ["label"] = new JsonObject { ["type"] = "string", ["maxLength"] = 100 },
                ["route"] = new JsonObject { ["type"] = "string", ["maxLength"] = 200, ["example"] = "/e/students" },
                ["icon"] = new JsonObject { ["type"] = "string", ["nullable"] = true, ["example"] = "home" },
                ["sortOrder"] = new JsonObject { ["type"] = "integer", ["format"] = "int32" },
                ["roles"] = new JsonObject { ["type"] = "string", ["nullable"] = true, ["example"] = "Admin" },
                ["isVisible"] = new JsonObject { ["type"] = "boolean" }
            }
        };
        var item = Ref("MenuItem");
        var idParam = new JsonObject
        {
            ["name"] = "id", ["in"] = "path", ["required"] = true,
            ["schema"] = new JsonObject { ["type"] = "string", ["format"] = "uuid" }
        };
        paths["/api/menu"] = new JsonObject
        {
            ["get"] = Op("Menu", "Menu for the current user", null, Response("200", "OK", new JsonObject
            {
                ["type"] = "array",
                ["items"] = new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["label"] = new JsonObject { ["type"] = "string" },
                        ["route"] = new JsonObject { ["type"] = "string" },
                        ["icon"] = new JsonObject { ["type"] = "string", ["nullable"] = true }
                    }
                }
            }))
        };
        paths["/api/menu-items"] = new JsonObject
        {
            ["get"] = Op("Menu", "List all menu items (Admin)", null,
                Response("200", "OK", new JsonObject { ["type"] = "array", ["items"] = item.DeepClone() })),
            ["post"] = Op("Menu", "Create a menu item (Admin)", item, Response("201", "Created", item))
        };
        paths["/api/menu-items/{id}"] = new JsonObject
        {
            ["put"] = Op("Menu", "Update a menu item (Admin)", item, Response("204", "No content", null), idParam),
            ["delete"] = Op("Menu", "Delete a menu item (Admin)", null, Response("204", "No content", null), idParam)
        };
    }

    private static JsonObject EntitySchema(EntityDefinition e)
    {
        var props = new JsonObject
        {
            ["id"] = new JsonObject { ["type"] = "string", ["format"] = "uuid", ["readOnly"] = true }
        };
        var required = new JsonArray();

        foreach (var f in e.Fields)
        {
            props[CamelCase(f.Name)] = FieldSchema(f);
            if (f.Required) required.Add(CamelCase(f.Name));
        }
        foreach (var r in e.Relations)
        {
            props[CamelCase(r.Name) + "Id"] = new JsonObject { ["type"] = "string", ["format"] = "uuid", ["nullable"] = !r.Required };
            if (r.Required) required.Add(CamelCase(r.Name) + "Id");
        }

        var schema = new JsonObject { ["type"] = "object", ["properties"] = props };
        if (required.Count > 0) schema["required"] = required;
        return schema;
    }

    private static JsonObject FieldSchema(FieldDefinition f)
    {
        var s = f.Type switch
        {
            FieldType.Int => new JsonObject { ["type"] = "integer", ["format"] = "int32" },
            FieldType.Long => new JsonObject { ["type"] = "integer", ["format"] = "int64" },
            FieldType.Decimal => new JsonObject { ["type"] = "number" },
            FieldType.Bool => new JsonObject { ["type"] = "boolean" },
            FieldType.Date => new JsonObject { ["type"] = "string", ["format"] = "date" },
            FieldType.DateTime => new JsonObject { ["type"] = "string", ["format"] = "date-time" },
            FieldType.Guid => new JsonObject { ["type"] = "string", ["format"] = "uuid" },
            FieldType.Email => new JsonObject { ["type"] = "string", ["format"] = "email" },
            _ => new JsonObject { ["type"] = "string" }
        };
        if (f.MaxLength is > 0 && s["type"]!.GetValue<string>() == "string") s["maxLength"] = f.MaxLength;
        if (!f.Required) s["nullable"] = true;
        return s;
    }

    private static JsonObject Ref(string name) => new() { ["$ref"] = $"#/components/schemas/{name}" };

    private static JsonObject Query(string name, string type) => new()
    {
        ["name"] = name, ["in"] = "query", ["schema"] = new JsonObject { ["type"] = type }
    };

    private static JsonObject Response(string code, string description, JsonObject? schema)
    {
        var resp = new JsonObject { ["description"] = description };
        if (schema is not null)
            resp["content"] = new JsonObject
            {
                ["application/json"] = new JsonObject { ["schema"] = schema.DeepClone() }
            };
        return new JsonObject { [code] = resp };
    }

    private static JsonObject ListResponse(JsonObject itemRef) => Response("200", "OK", new JsonObject
    {
        ["type"] = "object",
        ["properties"] = new JsonObject
        {
            ["items"] = new JsonObject { ["type"] = "array", ["items"] = itemRef.DeepClone() },
            ["total"] = new JsonObject { ["type"] = "integer" },
            ["page"] = new JsonObject { ["type"] = "integer" },
            ["pageSize"] = new JsonObject { ["type"] = "integer" }
        }
    });

    private static JsonObject Op(string tag, string summary, JsonObject? body, JsonObject responses, params JsonObject[] parameters)
    {
        var op = new JsonObject
        {
            ["tags"] = new JsonArray(tag),
            ["summary"] = summary,
            ["responses"] = responses
        };
        if (parameters.Length > 0)
        {
            var arr = new JsonArray();
            foreach (var p in parameters) arr.Add(p.DeepClone());
            op["parameters"] = arr;
        }
        if (body is not null)
            op["requestBody"] = new JsonObject
            {
                ["required"] = true,
                ["content"] = new JsonObject { ["application/json"] = new JsonObject { ["schema"] = body.DeepClone() } }
            };
        return op;
    }
}
