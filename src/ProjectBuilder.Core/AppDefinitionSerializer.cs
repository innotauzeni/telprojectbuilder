using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProjectBuilder.Core;

public static class AppDefinitionSerializer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public static string ToJson(AppDefinition app) => JsonSerializer.Serialize(app, Options);

    public static AppDefinition FromJson(string json) =>
        JsonSerializer.Deserialize<AppDefinition>(json, Options)
        ?? throw new JsonException("Empty app definition.");
}
