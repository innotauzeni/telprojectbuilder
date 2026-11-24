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
- [ ] Sign-up/login (ASP.NET Identity), per-user project storage

### Epic D2 – Product polish
- [x] Modern design system for the Studio and generated apps: light/dark theme, icons, toasts, confirm dialogs, skeleton loaders, responsive layout
- [x] Dynamic menu (MenuItems table, role-filtered /api/menu, Admin menu editor) as an opt-in feature; browser-tested in Studio preview and generated app
- [ ] Multi-language UI (i18n) for the Studio and generated apps
- [ ] Accessibility audit (WCAG 2.2 AA) and keyboard-only pass
- [ ] Per-entity screen customisation (column choice, grouping, nested menus)

### Epic E – Templates
- [x] Enrolment (Student, Guardian, Course, Term, Enrolment, Payment; Fee TODO)
- [ ] School Management (Phase 2)

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
