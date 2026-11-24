using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ProjectBuilder.Studio.Services;

/// <summary>The Studio's own accounts database (SQLite, next to the project files).</summary>
public sealed class StudioDb(DbContextOptions<StudioDb> options) : IdentityDbContext<IdentityUser>(options);
