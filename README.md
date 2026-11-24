# ProjectBuilder

Open-source, no-code builder that generates **production-style C# systems** from a visual design: an ASP.NET Core
Web API with Swagger and JWT login, an **Angular** web app, your choice of database, and Docker files. Download the
result and deploy it anywhere. The output has no dependency on ProjectBuilder, so you own it completely.
A Flutter mobile app is on the roadmap.

> **Status: early alpha (Phase 1).** Working today: Studio designer, a live preview of the real web app and API, the
> Enrolment template, API generation for SQLite / SQL Server / PostgreSQL with login and Admin/User roles, a modern
> Angular web app (light/dark, responsive), an optional database-driven **dynamic menu**, and ZIP download.
> Not yet: migrations, per-entity permissions, multi-language UI, Flutter app. Do not expose the Studio publicly yet
> (no accounts). See the [roadmap](docs/ROADMAP.md).

## Quick start
Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download) and Node.js 20.19+ / 22.12+ / 24+ (for the Angular Studio).

```
# 1. Build the Studio web app and the web-app preview (once, and after changing src/studio-web or the Angular template;
#    the first run installs packages and takes a few minutes)
cd src/studio-web
npm install
npm run build

# 2. Run the Studio
cd ../..
dotnet run --project src/ProjectBuilder.Studio --urls http://localhost:5230
```
Open http://localhost:5230 → pick the **Enrolment System** template → tweak → **Preview** (your real web app running on a
demo API, plus Swagger and the generated code) → **Download**.

**Dynamic menu:** switch it on in the designer and the generated system gets a `MenuItems` table, `GET /api/menu`
(filtered by the user's roles) and an Admin "Menu" screen to add, reorder, hide or remove entries without redeploying.

Working on the Studio UI itself? Run `dotnet run` as above and, in `src/studio-web`, `npm start`
(live reload at http://localhost:4200, proxied to the .NET server on port 5230).

### Run what you downloaded
```
cd EnrolmentSystem
docker compose up --build      # API http://localhost:8080/swagger, web app http://localhost:8081
```
or without Docker: `cd api && dotnet run --urls http://localhost:5000`, then `cd web && npm install && npm start`.
The first admin login is in `api/appsettings.json` (generated uniquely for every download); the download's README explains the rest.

## How it works
The designer edits one JSON file (the `AppDefinition`). Generators turn it into plain source code.

```
src/ProjectBuilder.Core        definition model, JSON, validation
src/ProjectBuilder.Generator   Scriban generators (C# API) + Angular template + ZIP packager
src/ProjectBuilder.Studio      ASP.NET Core API serving the Studio, preview and downloads
src/studio-web                 Angular app: template gallery, designer, preview
templates/                     starter systems (JSON)
tests/                         unit tests + tests that build and run the generated projects
```

## Docs
- [Roadmap & architecture](docs/ROADMAP.md)
- [Project plan](docs/PROJECT_PLAN.md)
- [Contributing](CONTRIBUTING.md)

## License
[MIT](LICENSE)
