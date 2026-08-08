# Changelog

All notable changes to `@vegastack/skills` and the skills it ships. Maintained via [changesets](https://github.com/changesets/changesets); entries land here with each release. Package semver is documented in [docs/policies/content-versioning.md](docs/policies/content-versioning.md) (package version is decoupled from the foundation content version).

## 0.1.0 — 2026-08-08

Initial release.

### Installer (`@vegastack/skills`)

- Commands: `add`, `verify`, `doctor`, `remove`, `--version`.
- Atomic transactional installs into `.claude/skills` (Claude Code) and `.agents/skills` (Codex) with checksum verification, symlink refusal, crash-recovery journal, and `--dry-run`/`--force`/`--non-interactive` automation flags.
- Zero telemetry; the only network call is `doctor`'s installed-vs-latest version check.

### Skill: `vegastack-arch-guardian`

- Capability-scoped architecture advisor: 107 stable rules across 18 normative references (identity/tenancy, durable execution, connectors/sandbox, hosting, delivery, plus AI evals, model lifecycle, AI cost, and AI data boundaries).
- Deterministic checks against a committed `.vegastack/architecture.json` profile with honest outcomes (`PASS` / `FAIL` / `EXCEPTED` / `NOT VERIFIED`), `.guardianignore` support, generated-bundle skipping, and finding caps.
- Exception/ADR governance: rule-level exceptions with exact paths; wildcard suppression forbidden; invalid or expired exceptions fail closed.
- Source-freshness contract: 34 tracked external sources with verified baselines (`refresh/sources.json` + `refresh/REFRESH.md`), weekly-refresh design with CI-guarded refresh PRs.
