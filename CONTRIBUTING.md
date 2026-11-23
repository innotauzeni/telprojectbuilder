# Contributing

Thanks for helping! ProjectBuilder is early-stage; the best way to get oriented is [docs/ROADMAP.md](docs/ROADMAP.md)
and [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) (unchecked items are good first tasks).

## Setup
- .NET 10 SDK. Docker is optional (only to try generated projects).
- `dotnet build` and `dotnet test` must pass. The tests generate real projects and build them, so they need internet (NuGet).

## Ground rules
- **Generated code must compile and run.** Any generator change needs a test; new templates must build for every supported database.
- **Names become C# source.** Anything that reaches generated code must pass `AppDefinitionValidator`. Never relax it without a security-minded review.
- Generated output must stay free of any dependency on ProjectBuilder (users own their code).
- Keep PRs small and focused; describe what you changed and how you tested it.

## Reporting security issues
Please open a private security advisory on GitHub instead of a public issue.

## License
By contributing you agree your work is released under the [MIT License](LICENSE).
