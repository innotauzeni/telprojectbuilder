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
        using Microsoft.AspNetCore.Identity;
        using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Domain;

        namespace {{ Ns }}.Data;

        public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<IdentityUser>(options)
        {
        {{~ for e in Entities ~}}
            public DbSet<{{ e.Name }}> {{ e.Plural }} => Set<{{ e.Name }}>();
        {{~ end ~}}
        {{~ if DynamicMenu ~}}
            public DbSet<MenuItem> MenuItems => Set<MenuItem>();
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

    public const string Dto = """
        using System.ComponentModel.DataAnnotations;
        using {{ Ns }}.Domain;

        namespace {{ Ns }}.Dtos;

        /// <summary>What API clients send and receive for {{ Name }} (never the raw database entity).</summary>
        public class {{ Name }}Dto
        {
            public Guid Id { get; set; }
        {{~ for p in Props ~}}
        {{~ for a in p.Attrs ~}}
            {{ a }}
        {{~ end ~}}
            {{ p.Decl }}
        {{~ end ~}}

            public static {{ Name }}Dto From({{ Name }} e) => new()
            {
                Id = e.Id,
        {{~ for p in Props ~}}
                {{ p.Name }} = e.{{ p.Name }},
        {{~ end ~}}
            };

            public void ApplyTo({{ Name }} e)
            {
        {{~ for p in Props ~}}
                e.{{ p.Name }} = {{ p.Name }};
        {{~ end ~}}
            }
        }
        """;

    public const string Controller = """
        using Microsoft.AspNetCore.Authorization;
        using Microsoft.AspNetCore.Mvc;
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Data;
        using {{ Ns }}.Domain;
        using {{ Ns }}.Dtos;

        namespace {{ Ns }}.Controllers;

        [ApiController]
        [Authorize]
        [Route("api/{{ Route }}")]
        public class {{ Plural }}Controller(AppDbContext db) : ControllerBase
        {
            private const string SaveError = "Could not save: a unique value is duplicated or a linked record does not exist.";

            [HttpGet]
            public async Task<ActionResult<PagedResult<{{ Name }}Dto>>> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
            {
                page = Math.Max(page, 1);
                pageSize = Math.Clamp(pageSize, 1, 200);
                var total = await db.{{ Plural }}.CountAsync();
                var items = await db.{{ Plural }}.AsNoTracking().OrderBy(x => x.Id)
                    .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
                return new PagedResult<{{ Name }}Dto>(items.Select({{ Name }}Dto.From).ToList(), total, page, pageSize);
            }

            [HttpGet("{id:guid}")]
            public async Task<ActionResult<{{ Name }}Dto>> Get(Guid id)
            {
                var item = await db.{{ Plural }}.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
                return item is null ? NotFound() : {{ Name }}Dto.From(item);
            }

            [HttpPost]
            public async Task<ActionResult<{{ Name }}Dto>> Create({{ Name }}Dto dto)
            {
                var item = new {{ Name }} { Id = Guid.NewGuid() };
                dto.ApplyTo(item);
                db.{{ Plural }}.Add(item);
                try { await db.SaveChangesAsync(); }
                catch (DbUpdateException) { return Problem(SaveError, statusCode: StatusCodes.Status409Conflict); }
                return CreatedAtAction(nameof(Get), new { id = item.Id }, {{ Name }}Dto.From(item));
            }

            [HttpPut("{id:guid}")]
            public async Task<IActionResult> Update(Guid id, {{ Name }}Dto dto)
            {
                var item = await db.{{ Plural }}.FindAsync(id);
                if (item is null) return NotFound();
                dto.ApplyTo(item);
                try { await db.SaveChangesAsync(); }
                catch (DbUpdateException) { return Problem(SaveError, statusCode: StatusCodes.Status409Conflict); }
                return NoContent();
            }

            [HttpDelete("{id:guid}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> Delete(Guid id)
            {
                var item = await db.{{ Plural }}.FindAsync(id);
                if (item is null) return NotFound();
                db.{{ Plural }}.Remove(item);
                try { await db.SaveChangesAsync(); }
                catch (DbUpdateException) { return Problem("Could not delete: other records still depend on this one.", statusCode: StatusCodes.Status409Conflict); }
                return NoContent();
            }
        }
        """;

    public const string PagedResult = """
        namespace {{ Ns }};

        public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);
        """;

    public const string AuthController = """
        using System.Security.Claims;
        using System.ComponentModel.DataAnnotations;
        using System.Text;
        using Microsoft.AspNetCore.Authorization;
        using Microsoft.AspNetCore.Identity;
        using Microsoft.AspNetCore.Mvc;
        using Microsoft.IdentityModel.JsonWebTokens;
        using Microsoft.IdentityModel.Tokens;

        namespace {{ Ns }}.Controllers;

        public record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
        public record RegisterRequest([Required, EmailAddress] string Email, [Required] string Password, string Role = "User");
        public record AuthResponse(string Token, DateTime ExpiresUtc, string Email, IList<string> Roles);

        [ApiController]
        [Route("api/auth")]
        public class AuthController(UserManager<IdentityUser> users, IConfiguration config) : ControllerBase
        {
            private static readonly string[] AllowedRoles = ["Admin", "User"];

            /// <summary>Log in and receive a JWT. In Swagger, click Authorize and paste the token.</summary>
            [HttpPost("login")]
            [AllowAnonymous]
            public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
            {
                var user = await users.FindByEmailAsync(request.Email);
                if (user is null) return Unauthorized();
                if (await users.IsLockedOutAsync(user))
                    return Problem("Too many failed attempts. Try again later.", statusCode: StatusCodes.Status429TooManyRequests);
                if (!await users.CheckPasswordAsync(user, request.Password))
                {
                    await users.AccessFailedAsync(user);
                    return Unauthorized();
                }
                await users.ResetAccessFailedCountAsync(user);
                var roles = await users.GetRolesAsync(user);
                return CreateToken(user, roles);
            }

            /// <summary>Create a user. Admins only.</summary>
            [HttpPost("register")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> Register(RegisterRequest request)
            {
                if (!AllowedRoles.Contains(request.Role)) return BadRequest("Role must be Admin or User.");
                var user = new IdentityUser { UserName = request.Email, Email = request.Email, EmailConfirmed = true };
                var result = await users.CreateAsync(user, request.Password);
                if (!result.Succeeded) return BadRequest(result.Errors.Select(e => e.Description));
                await users.AddToRoleAsync(user, request.Role);
                return Created(string.Empty, new { user.Email, request.Role });
            }

            [HttpGet("me")]
            [Authorize]
            public IActionResult Me() => Ok(new
            {
                Email = User.FindFirstValue("email"),
                Roles = User.FindAll("role").Select(c => c.Value)
            });

            private AuthResponse CreateToken(IdentityUser user, IList<string> roles)
            {
                var jwt = config.GetSection("Jwt");
                var expires = DateTime.UtcNow.AddHours(8);
                var claims = new List<Claim>
                {
                    new("sub", user.Id),
                    new("email", user.Email ?? ""),
                    new("name", user.UserName ?? "")
                };
                claims.AddRange(roles.Select(r => new Claim("role", r)));

                var descriptor = new SecurityTokenDescriptor
                {
                    Subject = new ClaimsIdentity(claims),
                    Expires = expires,
                    Issuer = jwt["Issuer"],
                    Audience = jwt["Audience"],
                    SigningCredentials = new SigningCredentials(
                        new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!)), SecurityAlgorithms.HmacSha256)
                };
                var token = new JsonWebTokenHandler().CreateToken(descriptor);
                return new AuthResponse(token, expires, user.Email ?? "", roles);
            }
        }
        """;

    public const string MenuItem = """
        using System.ComponentModel.DataAnnotations;

        namespace {{ Ns }}.Domain;

        /// <summary>One entry of the navigation menu. Stored in the database so admins can change the menu without redeploying.</summary>
        public class MenuItem
        {
            public Guid Id { get; set; }
            [Required, MaxLength(100)] public string Label { get; set; } = default!;
            /// <summary>Internal path in the web app, e.g. /e/students.</summary>
            [Required, MaxLength(200)] public string Route { get; set; } = default!;
            [MaxLength(50)] public string? Icon { get; set; }
            public int SortOrder { get; set; }
            /// <summary>Comma-separated role names allowed to see the entry. Empty = everyone who is logged in.</summary>
            [MaxLength(200)] public string? Roles { get; set; }
            public bool IsVisible { get; set; } = true;
        }
        """;

    public const string MenuController = """
        using System.ComponentModel.DataAnnotations;
        using Microsoft.AspNetCore.Authorization;
        using Microsoft.AspNetCore.Mvc;
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Data;
        using {{ Ns }}.Domain;

        namespace {{ Ns }}.Controllers;

        public record MenuEntry(string Label, string Route, string? Icon);

        public class MenuItemDto
        {
            public Guid Id { get; set; }
            [Required, MaxLength(100)] public string Label { get; set; } = default!;
            // Internal paths only: stops javascript: URLs and links to other sites being injected through the menu.
            [Required, MaxLength(200), RegularExpression(@"^/[A-Za-z0-9/_\-]*$", ErrorMessage = "Route must be an internal path such as /e/students.")]
            public string Route { get; set; } = default!;
            [MaxLength(50), RegularExpression(@"^[a-z0-9\-]*$", ErrorMessage = "Icon must be a lowercase icon name such as home.")]
            public string? Icon { get; set; }
            public int SortOrder { get; set; }
            [MaxLength(200), RegularExpression(@"^[A-Za-z, ]*$", ErrorMessage = "Roles must be role names separated by commas.")]
            public string? Roles { get; set; }
            public bool IsVisible { get; set; } = true;

            public static MenuItemDto From(MenuItem e) => new()
            {
                Id = e.Id, Label = e.Label, Route = e.Route, Icon = e.Icon, SortOrder = e.SortOrder, Roles = e.Roles, IsVisible = e.IsVisible
            };

            public void ApplyTo(MenuItem e)
            {
                e.Label = Label; e.Route = Route; e.Icon = string.IsNullOrWhiteSpace(Icon) ? null : Icon;
                e.SortOrder = SortOrder; e.Roles = string.IsNullOrWhiteSpace(Roles) ? null : Roles; e.IsVisible = IsVisible;
            }
        }

        [ApiController]
        [Authorize]
        public class MenuController(AppDbContext db) : ControllerBase
        {
            /// <summary>The menu for the current user: visible entries whose Roles include one of the user's roles (or are empty).</summary>
            [HttpGet("/api/menu")]
            public async Task<ActionResult<List<MenuEntry>>> Mine()
            {
                var roles = User.FindAll("role").Select(c => c.Value).ToHashSet(StringComparer.OrdinalIgnoreCase);
                var items = await db.MenuItems.AsNoTracking().Where(x => x.IsVisible)
                    .OrderBy(x => x.SortOrder).ThenBy(x => x.Label).ToListAsync();
                return items
                    .Where(x => string.IsNullOrWhiteSpace(x.Roles)
                        || x.Roles.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Any(roles.Contains))
                    .Select(x => new MenuEntry(x.Label, x.Route, x.Icon)).ToList();
            }

            [HttpGet("/api/menu-items")]
            [Authorize(Roles = "Admin")]
            public async Task<List<MenuItemDto>> All() =>
                (await db.MenuItems.AsNoTracking().OrderBy(x => x.SortOrder).ThenBy(x => x.Label).ToListAsync())
                    .Select(MenuItemDto.From).ToList();

            [HttpPost("/api/menu-items")]
            [Authorize(Roles = "Admin")]
            public async Task<ActionResult<MenuItemDto>> Create(MenuItemDto dto)
            {
                var item = new MenuItem { Id = Guid.NewGuid() };
                dto.ApplyTo(item);
                db.MenuItems.Add(item);
                await db.SaveChangesAsync();
                return Created($"/api/menu-items/{item.Id}", MenuItemDto.From(item));
            }

            [HttpPut("/api/menu-items/{id:guid}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> Update(Guid id, MenuItemDto dto)
            {
                var item = await db.MenuItems.FindAsync(id);
                if (item is null) return NotFound();
                dto.ApplyTo(item);
                await db.SaveChangesAsync();
                return NoContent();
            }

            [HttpDelete("/api/menu-items/{id:guid}")]
            [Authorize(Roles = "Admin")]
            public async Task<IActionResult> Delete(Guid id)
            {
                var item = await db.MenuItems.FindAsync(id);
                if (item is null) return NotFound();
                db.MenuItems.Remove(item);
                await db.SaveChangesAsync();
                return NoContent();
            }
        }
        """;

    public const string DbSeeder = """
        using Microsoft.AspNetCore.Identity;
        using Microsoft.EntityFrameworkCore;
        using {{ Ns }}.Domain;

        namespace {{ Ns }}.Data;

        /// <summary>Creates the Admin/User roles, the first admin account (from the Seed section of appsettings) and the default menu.</summary>
        public static class DbSeeder
        {
            public static async Task SeedAsync(IServiceProvider services, IConfiguration config)
            {
                var roles = services.GetRequiredService<RoleManager<IdentityRole>>();
                foreach (var role in new[] { "Admin", "User" })
                    if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole(role));
        {{~ if DynamicMenu ~}}

                var db = services.GetRequiredService<AppDbContext>();
                if (!await db.MenuItems.AnyAsync())
                {
                    db.MenuItems.AddRange(
        {{~ for m in MenuItems ~}}
                        new MenuItem { Id = Guid.NewGuid(), Label = "{{ m.Label }}", Route = "{{ m.Route }}", Icon = "{{ m.Icon }}", SortOrder = {{ m.SortOrder }}, Roles = {{ if m.Roles == "" }}null{{ else }}"{{ m.Roles }}"{{ end }}, IsVisible = true }{{ if for.last }});{{ else }},{{ end }}
        {{~ end ~}}
                    await db.SaveChangesAsync();
                }
        {{~ end ~}}

                var email = config["Seed:AdminEmail"];
                var password = config["Seed:AdminPassword"];
                if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

                var users = services.GetRequiredService<UserManager<IdentityUser>>();
                if (await users.FindByEmailAsync(email) is not null) return;

                var admin = new IdentityUser { UserName = email, Email = email, EmailConfirmed = true };
                var result = await users.CreateAsync(admin, password);
                if (!result.Succeeded)
                    throw new InvalidOperationException("Could not create the admin user: " + string.Join("; ", result.Errors.Select(e => e.Description)));
                await users.AddToRoleAsync(admin, "Admin");
            }
        }
        """;

    public const string Program = """
        using System.Text;
        using Microsoft.AspNetCore.Identity;
        using Microsoft.EntityFrameworkCore;
        using Microsoft.IdentityModel.Tokens;
        using Microsoft.OpenApi.Models;
        using {{ Ns }}.Data;

        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddDbContext<AppDbContext>(o =>
            o.{{ UseCall }}(builder.Configuration.GetConnectionString("Default")));

        builder.Services.AddIdentityCore<IdentityUser>(o =>
            {
                o.Password.RequiredLength = 8;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<AppDbContext>();

        var jwt = builder.Configuration.GetSection("Jwt");
        builder.Services.AddAuthentication("Bearer").AddJwtBearer(o =>
        {
            o.MapInboundClaims = false;
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true, ValidIssuer = jwt["Issuer"],
                ValidateAudience = true, ValidAudience = jwt["Audience"],
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!)),
                ValidateLifetime = true,
                NameClaimType = "name",
                RoleClaimType = "role"
            };
        });
        builder.Services.AddAuthorization();

        builder.Services.AddControllers();
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(c =>
        {
            c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Name = "Authorization", Type = SecuritySchemeType.Http, Scheme = "bearer",
                BearerFormat = "JWT", In = ParameterLocation.Header,
                Description = "Log in via POST /api/auth/login, then paste the token here."
            });
            c.AddSecurityRequirement(new OpenApiSecurityRequirement
            {
                { new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }, Array.Empty<string>() }
            });
        });

        var app = builder.Build();

        // First run: create the database and the first admin. Switch to EF migrations before production (see README).
        using (var scope = app.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
            await DbSeeder.SeedAsync(scope.ServiceProvider, builder.Configuration);
        }

        app.UseSwagger();
        app.UseSwaggerUI();
        app.UseAuthentication();
        app.UseAuthorization();
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
            <PackageReference Include="Microsoft.AspNetCore.Identity.EntityFrameworkCore" Version="10.*" />
            <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="10.*" />
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
