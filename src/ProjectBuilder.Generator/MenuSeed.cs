using System.Text.RegularExpressions;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator;

/// <summary>One row of the database-driven menu (the "dynamic menu" feature).</summary>
public sealed record MenuSeedItem(string Label, string Route, string Icon, int SortOrder, string Roles);

/// <summary>
/// The menu a new system starts with: Dashboard, one entry per entity, and an Admin-only "Menu" editor.
/// Used by the generated database seeder and by the Studio's live preview, so both always match.
/// </summary>
public static class MenuSeed
{
    public static IReadOnlyList<MenuSeedItem> Default(AppDefinition app)
    {
        var items = new List<MenuSeedItem> { new("Dashboard", "/", "home", 0, "") };
        var order = 10;
        foreach (var e in app.Entities)
        {
            items.Add(new(
                Naming.Humanize(Naming.Plural(e.Name)),
                "/e/" + Naming.Plural(e.Name).ToLowerInvariant(),
                IconFor(e.Name),
                order,
                ""));
            order += 10;
        }
        items.Add(new("Menu", "/admin/menu", "settings", 900, "Admin"));
        return items;
    }

    /// <summary>Picks a sensible icon from the entity name; the Angular app ships the matching SVGs.</summary>
    public static string IconFor(string entityName)
    {
        var n = entityName.ToLowerInvariant();
        static bool Has(string n, params string[] words) => words.Any(n.Contains);
        if (Has(n, "student", "pupil", "learner", "graduate")) return "graduation-cap";
        if (Has(n, "guardian", "parent", "user", "person", "teacher", "staff", "employee", "customer", "member", "client", "patient", "contact")) return "users";
        if (Has(n, "course", "subject", "class", "book", "lesson", "library", "module")) return "book";
        if (Has(n, "term", "semester", "calendar", "schedule", "attendance", "event", "appointment", "timetable")) return "calendar";
        if (Has(n, "payment", "fee", "invoice", "price", "billing", "receipt", "expense", "salary")) return "credit-card";
        if (Has(n, "enrol", "enroll", "registration", "application", "order")) return "clipboard";
        if (Has(n, "product", "item", "stock", "inventory")) return "box";
        if (Has(n, "report", "grade", "result", "score", "exam")) return "chart";
        return "table";
    }
}
