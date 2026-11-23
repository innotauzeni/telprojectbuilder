# ProjectBuilder

Open-source, no-code builder that generates **production-style C# systems** (ASP.NET Core Web API + Swagger, your
choice of database, Docker files) from a visual design. Download the result and deploy it anywhere. The output has
no dependency on ProjectBuilder, so you own it completely. A web app and Flutter mobile app are on the roadmap.

> **Status: early alpha (Phase 1).** Working today: Studio designer, Enrolment template, API generation for
> SQLite / SQL Server / PostgreSQL, ZIP download. Generated APIs include JWT login with Admin/User roles. Not yet: migrations, per-entity permissions, web/mobile UI.
> Do not expose the Studio publicly yet (no accounts). See the [roadmap](docs/ROADMAP.md).

## Quick start
Requires the .NET 10 SDK.

```
dotnet run --project src/ProjectBuilder.Studio
```
Open the printed URL → pick the **Enrolment System** template → tweak → **Preview** (live API + code) → **Download**. Unzip, then:

```
cd EnrolmentSystem
dotnet run          # Swagger UI at the printed URL
# or
docker compose up --build
```

## How it works
The designer edits one JSON file (the `AppDefinition`). Generators turn it into plain C# source.

```
src/ProjectBuilder.Core        definition model, JSON, validation
src/ProjectBuilder.Generator   Scriban-based generators + ZIP packager
src/ProjectBuilder.Studio      Blazor designer
templates/                     starter systems (JSON)
tests/                         unit tests + "generated project builds" tests
```

## Docs
- [Roadmap & architecture](docs/ROADMAP.md)
- [Project plan](docs/PROJECT_PLAN.md)
- [Contributing](CONTRIBUTING.md)

## License
[MIT](LICENSE)
