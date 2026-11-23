using ProjectBuilder.Core;
using Scriban;
using Scriban.Runtime;

namespace ProjectBuilder.Generator;

/// <summary>Scriban rendering with PascalCase member access (no snake_case renaming).</summary>
internal static class Tpl
{
    public static string Render(string template, object model)
    {
        var parsed = Template.Parse(template);
        if (parsed.HasErrors) throw new InvalidOperationException(string.Join("; ", parsed.Messages));
        var so = new ScriptObject();
        so.Import(model, renamer: m => m.Name);
        var ctx = new TemplateContext { MemberRenamer = m => m.Name, StrictVariables = true };
        ctx.PushGlobal(so);
        return parsed.Render(ctx);
    }

    public const string DbContext = """
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Domain;

        namespace {{ Ns }}.Data;

        public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
        {
        {{~ for e in Entities ~}}
            public DbSet<{{ e.Name }}> {{ e.Plural }} => Set<{{ e.Name }}>();
        {{~ end ~}}

            protected override void OnModelCreating(ModelBuilder modelBuilder)
            {
                base.OnModelCreating(modelBuilder);
        {{~ for e in Entities ~}}
        {{~ for u in e.UniqueFields ~}}
                modelBuilder.Entity<{{ e.Name }}>().HasIndex(x => x.{{ u }}).IsUnique();
        {{~ end ~}}
        {{~ end ~}}
        {{~ for e in Entities ~}}
        {{~ for dec in e.DecimalFields ~}}
                modelBuilder.Entity<{{ e.Name }}>().Property(x => x.{{ dec }}).HasPrecision(18, 2);
        {{~ end ~}}
        {{~ end ~}}
            }
        }
        """;

    public const string Controller = """
        using Microsoft.AspNetCore.Mvc;
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Data;
        using {{ Ns }}.Domain;

        namespace {{ Ns }}.Controllers;

        [ApiController]
        [Route("api/{{ Route }}")]
        public class {{ Plural }}Controller(AppDbContext db) : ControllerBase
        {
            [HttpGet]
            public async Task<ActionResult<PagedResult<{{ Name }}>>> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
            {
                page = Math.Max(page, 1);
                pageSize = Math.Clamp(pageSize, 1, 200);
                var total = await db.{{ Plural }}.CountAsync();
                var items = await db.{{ Plural }}.AsNoTracking().OrderBy(x => x.Id)
                    .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
                return new PagedResult<{{ Name }}>(items, total, page, pageSize);
            }

            [HttpGet("{id:guid}")]
            public async Task<ActionResult<{{ Name }}>> Get(Guid id)
            {
                var item = await db.{{ Plural }}.FindAsync(id);
                return item is null ? NotFound() : item;
            }

            [HttpPost]
            public async Task<ActionResult<{{ Name }}>> Create({{ Name }} item)
            {
                item.Id = Guid.NewGuid();
                db.{{ Plural }}.Add(item);
                await db.SaveChangesAsync();
                return CreatedAtAction(nameof(Get), new { id = item.Id }, item);
            }

            [HttpPut("{id:guid}")]
            public async Task<IActionResult> Update(Guid id, {{ Name }} item)
            {
                if (!await db.{{ Plural }}.AnyAsync(x => x.Id == id)) return NotFound();
                item.Id = id;
                db.Update(item);
                await db.SaveChangesAsync();
                return NoContent();
            }

            [HttpDelete("{id:guid}")]
            public async Task<IActionResult> Delete(Guid id)
            {
                var item = await db.{{ Plural }}.FindAsync(id);
                if (item is null) return NotFound();
                db.{{ Plural }}.Remove(item);
                await db.SaveChangesAsync();
                return NoContent();
            }
        }
        """;

    public const string PagedResult = """
        namespace {{ Ns }};

        public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);
        """;

    public const string Program = """
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Data;

        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddDbContext<AppDbContext>(o =>
            o.{{ UseCall }}(builder.Configuration.GetConnectionString("Default")));
        builder.Services.AddControllers().AddJsonOptions(o =>
            o.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles);
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();

        var app = builder.Build();

        // First run: create the database. Switch to EF migrations before going to production (see README).
        using (var scope = app.Services.CreateScope())
            scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();

        app.UseSwagger();
        app.UseSwaggerUI();
        app.MapControllers();
        app.MapGet("/", () => Results.Redirect("/swagger"));
        app.Run();
        """;

    public const string Csproj = """
        <Project Sdk="Microsoft.NET.Sdk.Web">
          <PropertyGroup>
            <TargetFramework>net10.0</TargetFramework>
            <Nullable>enable</Nullable>
            <ImplicitUsings>enable</ImplicitUsings>
            <RootNamespace>{{ Ns }}</RootNamespace>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="{{ ProviderPackage }}" Version="{{ ProviderVersion }}" />
            <PackageReference Include="Swashbuckle.AspNetCore" Version="9.*" />
          </ItemGroup>
        </Project>
        """;

    public const string Dockerfile = """
        FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
        WORKDIR /src
        COPY . .
        RUN dotnet publish -c Release -o /app

        FROM mcr.microsoft.com/dotnet/aspnet:10.0
        WORKDIR /app
        COPY --from=build /app .
        ENV ASPNETCORE_URLS=http://+:8080
        EXPOSE 8080
        ENTRYPOINT ["dotnet", "{{ Ns }}.dll"]
        """;
}
