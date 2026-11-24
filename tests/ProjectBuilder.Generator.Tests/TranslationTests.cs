using System.Text.Json;
using System.Text.RegularExpressions;
using ProjectBuilder.Core;

namespace ProjectBuilder.Generator.Tests;

/// <summary>
/// Keeps the language files complete. English text in the pages is the translation key, so these tests read the page sources
/// and check that every text has an entry in every language, with the same {0} placeholders.
/// </summary>
public partial class TranslationTests
{
    private static readonly string[] Languages = ["fr", "pt", "es", "sw", "sn"];

    private static string Repo()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "src", "studio-web"))) dir = dir.Parent;
        return dir!.FullName;
    }

    private static string AppRoot => Path.Combine(Repo(), "src", "ProjectBuilder.Generator", "AngularTemplate");
    private static string StudioRoot => Path.Combine(Repo(), "src", "studio-web");

    private static Dictionary<string, string> Load(string root, string code) =>
        JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(Path.Combine(root, "public", "i18n", code + ".json")))!;

    // ---------- finding the English texts in the sources (mirrors how the pages are written) ----------

    [GeneratedRegex(@"'((?:[^'\\]|\\.)*)'\s*\|\s*t\b")] private static partial Regex PipeLiteral();
    [GeneratedRegex(@"\bi18n\.t\('((?:[^'\\]|\\.)*)'")] private static partial Regex ServiceCall();
    [GeneratedRegex(@"toast\.(?:success|error)\('((?:[^'\\]|\\.)*)'")] private static partial Regex Toast();
    [GeneratedRegex(@"toast\.success\([^'\n]*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'")] private static partial Regex ToastTernary();
    [GeneratedRegex(@"(?:title|confirmText):\s*'((?:[^'\\]|\\.)*)'")] private static partial Regex ConfirmOption();
    [GeneratedRegex(@"\.ask\('((?:[^'\\]|\\.)*)'")] private static partial Regex Ask();
    [GeneratedRegex(@"error\.set\('((?:[^'\\]|\\.)*)'\)")] private static partial Regex ErrorSet();
    [GeneratedRegex(@"'((?:[^'\\]|\\.)*)'")] private static partial Regex Quoted();
    [GeneratedRegex(@"\)\s*\|\s*t\b")] private static partial Regex ParenPipe();
    [GeneratedRegex(@"\s+")] private static partial Regex Spaces();

    private static string Clean(string s) => Spaces().Replace(s.Replace("\\'", "'"), " ").Trim();
    private static void Add(HashSet<string> keys, string s)
    {
        var k = Clean(s);
        if (Regex.IsMatch(Regex.Replace(k, @"\{\d+\}", ""), "[A-Za-z]")) keys.Add(k);
    }

    /// <summary>All texts written as 'English' | t, in whole-phrase ternaries, or passed to the toast and confirm services.</summary>
    private static HashSet<string> TextsIn(string srcDir)
    {
        var keys = new HashSet<string>();
        foreach (var file in Directory.EnumerateFiles(srcDir, "*.ts", SearchOption.AllDirectories))
        {
            var src = File.ReadAllText(file);
            foreach (Match m in PipeLiteral().Matches(src)) Add(keys, m.Groups[1].Value);
            foreach (Match m in ServiceCall().Matches(src)) Add(keys, m.Groups[1].Value);
            foreach (Match m in Toast().Matches(src)) Add(keys, m.Groups[1].Value);
            foreach (Match m in ToastTernary().Matches(src)) { Add(keys, m.Groups[1].Value); Add(keys, m.Groups[2].Value); }
            foreach (Match m in ConfirmOption().Matches(src)) Add(keys, m.Groups[1].Value);
            foreach (Match m in Ask().Matches(src)) Add(keys, m.Groups[1].Value);
            foreach (Match m in ErrorSet().Matches(src)) Add(keys, m.Groups[1].Value);

            // (cond ? 'A' : 'B') | t  -> the shown strings, not the ones that are compared or passed to functions
            foreach (Match m in ParenPipe().Matches(src))
            {
                int depth = 0, i = m.Index;
                for (; i >= 0; i--)
                {
                    if (src[i] == ')') depth++;
                    else if (src[i] == '(' && --depth == 0) break;
                }
                var inner = src[(i + 1)..m.Index];
                foreach (Match q in Quoted().Matches(inner))
                {
                    var before = inner[Math.Max(0, q.Index - 5)..q.Index];
                    if (Regex.IsMatch(before, @"(===|!==|==)\s*$") || Regex.IsMatch(before, @"\(\s*$")) continue;
                    Add(keys, q.Groups[1].Value);
                }
            }
            if (file.EndsWith("api.service.ts"))
                foreach (Match m in Regex.Matches(src, "return '((?:[^'\\\\]|\\\\.)*)';")) Add(keys, m.Groups[1].Value);
            if (file.EndsWith("confirm.service.ts"))
                foreach (Match m in Regex.Matches(src, @"\?\? '((?:[^'\\]|\\.)*)'")) Add(keys, m.Groups[1].Value);
        }
        return keys;
    }

    /// <summary>Entity names, plurals, field and link labels of every bundled template, plus the built-in menu and action words.</summary>
    private static HashSet<string> TemplateLabels()
    {
        var keys = new HashSet<string> { "Dashboard", "Data", "Administration", "Modules", "Roles", "Users", "Menu" };
        foreach (var a in AccessControlSeed.CrudActions.Concat(["Export", "Print", "Approve", "Archive"])) keys.Add(a);
        foreach (var file in Directory.GetFiles(Path.Combine(Repo(), "templates"), "*.json"))
        {
            var app = AppDefinitionSerializer.FromJson(File.ReadAllText(file));
            foreach (var e in app.Entities)
            {
                keys.Add(Naming.Humanize(e.Name));
                keys.Add(Naming.Humanize(Naming.Plural(e.Name)));
                foreach (var f in e.Fields) keys.Add(Naming.Humanize(f.Name));
                foreach (var r in e.Relations) keys.Add(Naming.Humanize(r.Name));
            }
        }
        return keys;
    }

    private static readonly string[] StudioServerMessages =
    [
        "Add at least one entity.", "App name must start with a letter and contain only letters, digits and spaces (max 64).",
        "Enter a valid email address.", "Invalid email or password.", "Too many failed attempts. Try again in a few minutes.",
        "Registration is closed on this server.", "Passwords must be at least 8 characters.",
        "Passwords must have at least one non alphanumeric character.", "Passwords must have at least one digit ('0'-'9').",
        "Passwords must have at least one lowercase ('a'-'z').", "Passwords must have at least one uppercase ('A'-'Z').",
        "Cannot reach the Studio server.", "Something went wrong.", "Unknown template.", "Project saved.", "Project deleted."
    ];

    // ---------- the tests ----------

    [Theory]
    [InlineData("app")]
    [InlineData("studio")]
    public void Every_language_is_listed_and_has_a_file(string which)
    {
        var root = which == "app" ? AppRoot : StudioRoot;
        var listed = JsonSerializer.Deserialize<List<Dictionary<string, string>>>(File.ReadAllText(Path.Combine(root, "public", "i18n", "languages.json")))!;
        Assert.Equal(new[] { "en", "fr", "pt", "es", "sw", "sn" }, listed.Select(l => l["code"]).ToArray());
        Assert.All(listed, l => Assert.False(string.IsNullOrWhiteSpace(l["name"])));
        foreach (var code in Languages) Assert.True(File.Exists(Path.Combine(root, "public", "i18n", code + ".json")), $"{which}: {code}.json is missing");
    }

    [Fact]
    public void Generated_web_app_contains_the_language_files()
    {
        var files = new ProjectGenerator().Generate(ProjectGeneratorTests.Enrolment());
        Assert.Contains(files, f => f.Path == "web/public/i18n/languages.json");
        foreach (var code in Languages) Assert.Contains(files, f => f.Path == $"web/public/i18n/{code}.json");
    }

    [Theory]
    [InlineData("fr")] [InlineData("pt")] [InlineData("es")] [InlineData("sw")] [InlineData("sn")]
    public void Web_app_texts_are_all_translated(string code)
    {
        var dict = Load(AppRoot, code);
        var needed = TextsIn(Path.Combine(AppRoot, "src")).Concat(TemplateLabels()).ToHashSet();
        var missing = needed.Where(k => !dict.ContainsKey(k)).OrderBy(k => k).ToList();
        Assert.True(missing.Count == 0, $"{code}: {missing.Count} text(s) missing a translation:\n  " + string.Join("\n  ", missing));
    }

    [Theory]
    [InlineData("fr")] [InlineData("pt")] [InlineData("es")] [InlineData("sw")] [InlineData("sn")]
    public void Studio_texts_are_all_translated(string code)
    {
        var dict = Load(StudioRoot, code);
        var needed = TextsIn(Path.Combine(StudioRoot, "src")).Concat(StudioServerMessages).ToHashSet();
        var missing = needed.Where(k => !dict.ContainsKey(k)).OrderBy(k => k).ToList();
        Assert.True(missing.Count == 0, $"{code}: {missing.Count} text(s) missing a translation:\n  " + string.Join("\n  ", missing));
    }

    [Theory]
    [InlineData("app")]
    [InlineData("studio")]
    public void Translations_keep_placeholders_and_are_not_empty(string which)
    {
        var root = which == "app" ? AppRoot : StudioRoot;
        var problems = new List<string>();
        foreach (var code in Languages)
            foreach (var (en, tr) in Load(root, code))
            {
                if (string.IsNullOrWhiteSpace(tr)) problems.Add($"{code}: empty translation for '{en}'");
                var a = string.Join(",", Regex.Matches(en, @"\{\d+\}").Select(m => m.Value).Order());
                var b = string.Join(",", Regex.Matches(tr, @"\{\d+\}").Select(m => m.Value).Order());
                if (a != b) problems.Add($"{code}: placeholders differ in '{en}' -> '{tr}'");
            }
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    [Fact]
    public void All_languages_cover_the_same_texts()
    {
        foreach (var root in new[] { AppRoot, StudioRoot })
        {
            var baseline = Load(root, "fr").Keys.ToHashSet();
            foreach (var code in Languages.Skip(1))
                Assert.True(baseline.SetEquals(Load(root, code).Keys), $"{Path.GetFileName(root)}: {code} does not cover the same texts as fr");
        }
    }
}
