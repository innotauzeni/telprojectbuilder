# Project Plan (Phase 0 → Phase 1 MVP, detailed)

Assumes one developer, ~20–30 focused hours/week. Adjust dates, keep the order.

## Milestones
| # | Milestone | Target | Definition of done |
|---|---|---|---|
| M0 | Repo + CI + model | Week 2 | Build/test green on GitHub Actions |
| M1 | Generate a runnable API | Week 4 | `AppDefinition` → ZIP → `dotnet run` → Swagger shows CRUD for all entities (SQLite) — **achieved locally** |
| M2 | Multi-DB + Docker | Week 6 | Same definition builds for SQL Server & PostgreSQL (**build verified**); `docker compose up` works (not yet tested) |
| M3 | Studio v0 | Week 8 | Browser form editor → Download ZIP; Enrolment template included |
| M4 | Private demo | Week 8 | 3 non-developers each build + run a system without help |

## Work breakdown (Phase 0–1)
### Epic A – Core model
- [x] `AppDefinition`, `EntityDefinition`, `FieldDefinition`, `RelationDefinition`
- [x] Identifier validation (reserved words, PascalCase, duplicates) – security critical
- [x] JSON (de)serialization + schema version field
- [x] Definition validator with friendly error messages

### Epic B – Generators
- [x] EntityGenerator
- [x] Scriban templates (DbContext, controllers, Program, csproj, Dockerfile)
- [x] DbContext + per-provider packages/connection strings (SQLite, SQL Server, PostgreSQL)
- [x] DTOs with validation attributes (entities never exposed by the API)
- [x] CRUD endpoints + paging + Swagger (search/filter TODO)
- [x] Auth scaffold: Identity + JWT, Admin/User roles, lockout, per-project random secrets + seeded admin
- [ ] Per-entity permissions (which role can do what) designed in Studio
- [x] Dockerfile + docker-compose per DB
- [x] README (SQL script export TODO)
- [x] Project packager (ZIP, `.gitignore`; solution file TODO)
- [ ] EF migrations instead of `EnsureCreated()`
- [ ] MySQL + Oracle providers

### Epic C – Quality harness
- [ ] Golden-file tests per generator
- [x] Generate → `dotnet build` integration test per DB (CI runs it)
- [x] Automated generate → run → login → CRUD → role checks test (SQLite)
- [x] Browser click-through of the generated web app (tests/e2e-web: login, create, edit, link, delete, logout) — runs in CI
- [ ] Testcontainers run against real SQL Server / PostgreSQL

### Epic D – Studio
- [x] Project list + create from template
- [x] Entity/field/relationship editor (forms; drag-drop later)
- [x] DB + target selection, validation display
- [x] Download ZIP (generation history TODO)
- [x] Live preview: Swagger "Try it out" against an in-memory mock + generated-code viewer
- [x] Preview shows the real generated Angular web app (on a demo API) next to Swagger and the generated files; desktop/tablet/phone sizes
- [ ] Flutter app preview (when that generator exists)
- [x] Accounts: sign-up/sign-in (ASP.NET Identity + SQLite), HttpOnly cookie session, private per-user projects, preview/download protected, lockout, rate limiting, CSRF header, registration switch, 50-project cap — API-tested and browser-tested
- [ ] Email verification and password reset (needs an email provider setting)
- [ ] Account page: change password, delete account and data
- [ ] Sharing a project with teammates (viewer / editor)
- [ ] Postgres/SQL Server option for the Studio's own database (SQLite is fine for a single server)

### Epic D2 – Product polish
- [x] Modern design system for the Studio and generated apps: light/dark theme, icons, toasts, confirm dialogs, skeleton loaders, responsive layout
- [x] Dynamic menu (MenuItems table, role-filtered /api/menu, Admin menu editor) as an opt-in feature; browser-tested in Studio preview and generated app
- [x] Access control (opt-in): SystemModule / Submodule / Permission / Role (Type, Level) / RoleMenu / RolePermission tables, admin API and screens (modules, sub-modules, bulk permissions, roles, menu-permission and role-permission assignment), permission-enforcing API, role-filtered menu, read-only screens without Edit permission — API-tested and browser-tested (generated app and Studio preview)
- [x] Users screen: add users with roles, change roles, reset password, deactivate/reactivate; role changes and deactivation apply immediately to signed-in users; guard rails against self lock-out — API-tested and browser-tested
- [ ] Email invitations and "forgot password" for generated systems (needs an email provider setting)
- [ ] Row-level / per-field permissions
- [ ] Multi-language UI (i18n) for the Studio and generated apps
- [ ] Accessibility audit (WCAG 2.2 AA) and keyboard-only pass
- [ ] Per-entity screen customisation (column choice, grouping, nested menus)

### Epic E – Templates
- [x] Enrolment (Student, Guardian, Course, Term, Enrolment, Payment; Fee TODO)
- [x] School Management: 13 entities (academic years, teachers, subjects, classes, students, guardians, timetable, attendance, assessments, results, fee structures, invoices, fee payments) with preset Teacher, Registrar and Bursar roles — API-tested end to end, previewed in the Studio
- [x] Templates can ship preset roles (name, type, level, per-entity grants), validated and seeded; shown in the Studio preview
- [ ] Sample data for templates (a few students, classes, invoices) so a new system does not start empty
- [ ] Report cards / printable PDFs (results per student per term)
- [ ] More templates: clinic, inventory, library, church, HR, POS

## Working agreements
- Weekly demo of something runnable. Never go >2 weeks without a working end-to-end path.
- One template fully working beats five half-done.
- Every generator PR adds a golden test; every release builds all templates against all supported DBs.
- Decisions recorded in `docs/decisions/` (ADR, one paragraph each).

## Tooling
.NET 10 SDK (installed), Scriban, EF Core providers, FluentValidation, xUnit, Testcontainers (DB matrix tests),
Docker Desktop, GitHub Actions. Flutter SDK needed only from Phase 3 (not installed yet).

## Open decisions (decide by end of Week 2)
1. Studio hosting: public SaaS vs. downloadable desktop tool? (Recommendation: SaaS web, generated output fully self-hostable.)
2. Generated API style: minimal APIs vs. controllers (Recommendation: controllers – more familiar to most C# developers; **currently implemented**).
3. Business model: free tier + paid (DBs/Flutter/templates) vs. one-time license.
4. Generated UI: **Angular** (decided; replaces Blazor everywhere, Studio included).
