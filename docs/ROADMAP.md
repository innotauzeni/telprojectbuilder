# ProjectBuilder – Vision, Architecture & Roadmap

## 1. Vision
A no-code platform where a user designs a business system (enrolment, school management, clinic, inventory…)
in a browser and downloads a **real, production-ready C# solution** (API + web app + DB scripts + optional
Flutter mobile app) that they own and can deploy anywhere. No lock-in: the output has no runtime dependency on us.

## 2. Core idea (the one decision that makes this feasible)
**Metadata-driven code generation.**

```
 Studio (visual designer)  ──edits──▶  AppDefinition (JSON)  ──▶  Generators  ──▶  ZIP download
        Blazor                          single source of truth     Scriban/Roslyn     C# solution, Docker,
                                                                                      SQL, Flutter app
```

We do NOT build a generic "runtime engine" that hosts users' apps (that is lock-in and a scaling nightmare).
We generate plain, readable, conventional C# that a developer could have written by hand.

## 3. What gets generated per project
| Target | Output |
|---|---|
| Domain/Data | Entities, EF Core DbContext, migrations, seed data |
| Web API | ASP.NET Core minimal/controller API, DTOs, validation, JWT auth + roles, **Swagger/OpenAPI** |
| Web App | Blazor admin UI (list/create/edit/detail, search, paging) calling the API |
| Mobile | Flutter app generated from the OpenAPI spec (login + CRUD screens) |
| Ops | Dockerfile, docker-compose (app + db), `appsettings`, deployment README, SQL script |
| Tests | Generated smoke/API tests so the output is verified |

**Databases (via EF Core providers):** SQL Server, PostgreSQL, MySQL/MariaDB, SQLite, Oracle. Chosen per project.
MongoDB/other NoSQL is deliberately out of scope until v2 (different data model, doubles generator work).

## 4. Platform architecture
```
src/
  ProjectBuilder.Core        AppDefinition model, validation, versioning of the schema
  ProjectBuilder.Generator   IGenerator implementations + template packs (Entities, Api, Blazor, Flutter, Docker)
  ProjectBuilder.Studio      Blazor web app: designer, template gallery, preview, download, accounts
  (later) ProjectBuilder.Api   Platform API (projects, billing, generation jobs)
  (later) ProjectBuilder.Worker Background generation + "compile check" sandbox
tests/
  ProjectBuilder.Generator.Tests   Golden-file tests + "generated code compiles" tests
templates/                  Starter AppDefinitions: Enrolment, School Management, ...
```
Key engineering rules:
1. **Every generated project must compile and pass its own tests in CI.** This is the product's quality bar.
2. Generators are small, composable, and individually tested (golden files).
3. `AppDefinition` is versioned; old projects keep working through migrations of the definition.
4. Generated code is idiomatic and documented; no hidden dependency on ProjectBuilder.
5. Extension points in output (partial classes / `Custom/` folder) so users can hand-edit safely and **regenerate without losing changes**.

## 5. Key features (user-facing, "very user friendly")
- Start from a **template** (Enrolment, School Management) or blank.
- Visual designer: entities, fields, relationships, roles/permissions, dropdown lists, validation rules.
- Live **Swagger preview** and sample data before download.
- Pick database + targets (API / Web / Flutter / Docker) with checkboxes.
- One-click **Download ZIP**; later: push to GitHub, one-click deploy (Azure/Railway/Docker host).
- Project versioning: change the design, regenerate, diff what changed.

## 6. Roadmap

### Phase 0 – Foundation (weeks 1–2) ✅ started
- Solution scaffold, `AppDefinition` model, first generator (entities), test project. **Done in this repo.**
- Decide template engine (Scriban recommended), repo conventions, CI (GitHub Actions: build + test).
- **Exit:** `dotnet test` green in CI.

### Phase 1 – Vertical slice MVP: "Enrolment system" (weeks 3–8)
- Generators: Entities → EF DbContext → Web API (CRUD) → Swagger → Docker.
- DBs: SQLite + SQL Server + PostgreSQL.
- Studio v0: form-based editor (entities/fields/relations), pick DB, **Download ZIP**.
- Ship template #1: Enrolment (Student, Guardian, Course, Term, Enrolment, Fee).
- Automated check: generated ZIP is built with `dotnet build` in a sandbox; failures block download.
- **Exit:** a non-developer designs the enrolment system and the downloaded ZIP runs with `docker compose up`.

### Phase 2 – Web UI + Auth (weeks 9–14)
- Generate Blazor admin UI (grids, forms, search, paging, lookups).
- Generated auth: users, roles, permissions per entity, JWT.
- Add MySQL + Oracle. Seed data and SQL scripts export.
- Template #2: School Management (classes, subjects, timetable, attendance, grades, report cards, fees).
- Platform accounts (sign up, saved projects, project history).
- **Exit:** two production-quality templates; private beta with 5–10 real schools/devs.

### Phase 3 – Mobile + extensibility (weeks 15–22)
- Flutter generator from OpenAPI (auth, list/detail/forms, offline-friendly caching later).
- Custom API builder: users define endpoints/queries beyond CRUD (filters, reports, simple workflows).
- Safe regeneration (partial classes, `Custom/` folder, 3-way merge/diff report).
- Business rules designer (validation, computed fields, status workflows, notifications/email).
- **Exit:** Flutter app from Enrolment template installs on a phone and talks to the generated API.

### Phase 4 – Launch (weeks 23–30)
- Billing (free = limited entities/downloads; paid = all DBs, Flutter, private templates).
- Template marketplace (clinic, inventory, HR, church, library, POS…).
- GitHub push, one-click deploy, documentation site, video tutorials, onboarding wizard.
- Security hardening, load testing, backup, monitoring, legal (license of generated code = user owns it).
- **Exit:** public launch.

### Phase 5 – Scale (after launch)
Team collaboration, plugins, multi-tenant (SaaS-style) output option, reporting/dashboard designer, AI assistant
("describe your school system" → draft `AppDefinition`), more DB types, Maui/React targets.

## 7. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Scope explosion ("every DB, every system") | Ship vertical slices; 1 template fully done before the next; SQL Server+Postgres+SQLite first |
| Generated code quality / bugs | Compile + test every template in CI; golden-file tests |
| Users edit output then can't regenerate | `Custom/` folder + partial classes from Phase 1 design onward |
| Flutter toolchain complexity | Generate from OpenAPI; keep UI simple/standard widgets; Phase 3 not before |
| Security of a public generator (code injection via names) | Strict identifier validation in Core; never execute user input; sandboxed build checks |
| Solo-founder burnout | Strict MVP; weekly demoable milestones; this doc is the contract |

## 8. Success metrics
- Phase 1: Time from "new project" to running API < 10 minutes for a non-developer.
- 100% of shipped templates compile & pass generated tests on every release.
- Beta: 10 real deployments; >60% of beta users download a second project.

## 9. Immediate next steps (do these first)
1. `git init`, push to GitHub, add CI (build + test).
2. Add Scriban; replace string-building generators with templates.
3. Implement DbContext + CRUD API generators; write first golden-file tests.
4. Build the "generated project compiles" test harness (generate → `dotnet build` in temp dir).
5. Hand-write the Enrolment `AppDefinition` JSON in `templates/enrolment.json` — it drives all generator work.
