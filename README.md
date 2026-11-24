# ProjectBuilder

Open-source, no-code builder that generates **production-style C# systems** from a visual design: an ASP.NET Core
Web API with Swagger and JWT login, an **Angular** web app, your choice of database, and Docker files. Download the
result and deploy it anywhere. The output has no dependency on ProjectBuilder, so you own it completely.
A Flutter mobile app is on the roadmap.

> **Status: early alpha (Phase 1).** Working today: Studio designer, a live preview of the real web app and API, the
> Enrolment and School Management templates (the latter with preset Teacher, Registrar and Bursar roles), API generation for SQLite / SQL Server / PostgreSQL with login and Admin/User roles, a modern
> Angular web app (light/dark, responsive), optional **access control** (modules, sub-modules, permissions and roles,
> enforced by the API) or a simpler **dynamic menu**, Studio **accounts** (sign up, private projects) and ZIP download.
> Not yet: migrations, multi-language UI, email verification / password reset, Flutter app.
> See the [roadmap](docs/ROADMAP.md) and [running the Studio online](#running-the-studio-for-other-people).

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
Open http://localhost:5230 → pick a template (**Enrolment System** or **School Management**) → tweak → **Preview** (your real web app running on a
demo API, plus Swagger and the generated code) → **Download**.

**Access control:** switch it on in the designer and the generated system gets database tables for **system modules**
(the menu), **sub-modules** (the submenu), **permissions** (like `students.create`), **roles** (with a Type and Level),
**role menus** and **role permissions**. The web app gets Administration screens where tables have *View details*,
*Menu permission* and *Role permission* actions, permissions can be added in bulk, and a role's menus and permissions are
assigned on one page, and a Users screen adds people, changes their roles, resets passwords and deactivates accounts.
The API enforces the permissions and each user's menu comes from the modules assigned to their roles; role changes and
deactivation take effect immediately, even for people who are signed in.

**Dynamic menu:** a lighter option (without roles and permissions): a `MenuItems` table, `GET /api/menu` filtered by the
user's roles, and an Admin "Menu" screen to add, reorder, hide or remove entries without redeploying.

Working on the Studio UI itself? Run `dotnet run` as above and, in `src/studio-web`, `npm start`
(live reload at http://localhost:4200, proxied to the .NET server on port 5230).

### Run what you downloaded
```
cd EnrolmentSystem
docker compose up --build      # API http://localhost:8080/swagger, web app http://localhost:8081
```
or without Docker: `cd api && dotnet run --urls http://localhost:5000`, then `cd web && npm install && npm start`.
The first admin login is in `api/appsettings.json` (generated uniquely for every download); the download's README explains the rest.

## Running the Studio for other people
The Studio has accounts: people sign up with an email and password, and every project (plus its preview and download)
is private to its owner. Before putting it on the internet:

- **Use HTTPS.** The sign-in cookie is `HttpOnly` and `SameSite=Lax`, and is marked `Secure` whenever the request is HTTPS.
  Behind a reverse proxy that terminates TLS, set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` so the app knows the original scheme.
- **Keep your data somewhere persistent.** Accounts (`studio.db`) and projects live in the folder given by `STUDIO_DATA_DIR`
  (default `src/ProjectBuilder.Studio/App_Data`). Mount it as a volume and back it up.
- **Decide who may register.** Sign-up is open by default. Set `Studio__AllowRegistration=false` to close it
  (existing users can still sign in; create accounts before closing, or temporarily re-open it).
- Passwords need 8+ characters with upper and lower case letters, a digit and a symbol; five wrong attempts lock an account for
  10 minutes, and sign-in/sign-up are limited to 20 requests a minute per address.
- Each user can keep up to 50 projects. Email verification and password reset are not built yet.

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

## Adding your own template
A template is one JSON file in `templates/` (it appears in the Studio automatically). Copy `templates/school-management.json`
and edit: `entities` (fields and links), `targets`, `accessControl`, and optional preset `roles`:

```json
"roles": [ { "name": "Teacher", "type": "Staff", "level": "Standard",
             "grants": { "students": ["View"], "attendancerecords": ["View", "Create", "Edit"] } } ]
```
A grant key is the entity's plural in lowercase (`students`); actions are View, Create, Edit, Delete. The tests in
`TemplateTests` check that every template is valid and generates, so a mistake is caught when you run `dotnet test`.

## Languages
The Studio and every generated web app speak English, French, Portuguese, Spanish, Swahili and Shona. A language picker
sits in the header (and on the sign-in page); the choice is remembered in the browser.

- Texts live in `public/i18n/<code>.json` (`src/studio-web` for the Studio, `src/ProjectBuilder.Generator/AngularTemplate` for generated apps). The English text is the key; `{0}` marks a value to insert.
- **Add a language:** copy `fr.json` to `<code>.json`, translate the values, and add `{ "code": "...", "name": "..." }` to `languages.json`.
- Entity and field names you type yourself show as typed unless you add them to the language files; anything missing falls back to English.
- `TranslationTests` fails if a text in the pages has no translation in any language.
- **Please review the translations.** They were machine-written; Shona and Swahili especially need a native speaker's check. Pull requests welcome.

## Docs
- [Roadmap & architecture](docs/ROADMAP.md)
- [Project plan](docs/PROJECT_PLAN.md)
- [Contributing](CONTRIBUTING.md)

## License
[MIT](LICENSE)
