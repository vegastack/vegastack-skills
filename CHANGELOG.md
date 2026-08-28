# Changelog

All notable changes to `@vegastack/skills` and the skills it ships. Maintained via [changesets](https://github.com/changesets/changesets); since 0.3.0, release entries land in [packages/cli/CHANGELOG.md](packages/cli/CHANGELOG.md). Semver policy: the content-semver bullet in [.vegastack/dev.md](.vegastack/dev.md).

## 0.2.0 — 2026-08-08

### Breaking

- **Renamed** `vegastack-arch-guardian` → `arch-guardian` (clean break; the 0.1.0 name is unknown to 0.2.0 — remove old installs with 0.1.0 or delete the old skill directories manually).
- Installer integrity manifest and crash-recovery journal moved to multi-skill schemaVersion 2; a v1 journal left by a crashed 0.1.0 install is rejected with a manual-cleanup message.

### New skills

- **skill-maintainer** — encodes the verified Agent Skills standards (Claude Code, Codex, Hermes, agentskills.io spec — discovery paths, frontmatter policy, naming grammar, context budgets, install surfaces) plus this repo's scaffold/update/rename/release/portability workflows, with a four-source freshness registry tracking the standards themselves.
- **skillify** — repo-local skill factory and auditor: should-this-be-a-skill gate, 13-item completeness checklist with scored verdict, elicitation → scaffold (`scripts/scaffold-skill.mjs` + templates) → behavioral-eval-before-tests → lock-in workflow.

### Installer

- Generalized to N bundled skills: new `list` command; `verify` with no name checks every bundled skill; per-skill add/remove.
- **Hermes support**: `--agent hermes|all` installs to `~/.hermes/skills` (global-only, matching Hermes's discovery model; project installs skip hermes with a notice).
- Skill validator now enforces the full cross-harness name grammar (lowercase-letter start, no consecutive hyphens, ≤64 chars, name must equal directory name) and the agentskills.io six-field frontmatter ceiling.

### Content

- arch-guardian source baselines refreshed (eve 0.31.3, turborepo 2.10.9, AI SDK 7.0.58, model catalogs).
- Refresh runner: accepted baselines now clear same-run manual-review flags; refresh-guard CI re-verifies every skill's registry.

## 0.1.0 — 2026-08-08

Initial release.

### Installer (`@vegastack/skills`)

- Commands: `add`, `verify`, `doctor`, `remove`, `--version`.
- Atomic transactional installs into `.claude/skills` (Claude Code) and `.agents/skills` (Codex) with checksum verification, symlink refusal, crash-recovery journal, and `--dry-run`/`--force`/`--non-interactive` automation flags.
- Zero telemetry; the only network call is `doctor`'s installed-vs-latest version check.

### Skill: `arch-guardian`

- Capability-scoped architecture advisor: 107 stable rules across 18 normative references (identity/tenancy, durable execution, connectors/sandbox, hosting, delivery, plus AI evals, model lifecycle, AI cost, and AI data boundaries).
- Deterministic checks against a committed `.vegastack/architecture.json` profile with honest outcomes (`PASS` / `FAIL` / `EXCEPTED` / `NOT VERIFIED`), `.guardianignore` support, generated-bundle skipping, and finding caps.
- Exception/ADR governance: rule-level exceptions with exact paths; wildcard suppression forbidden; invalid or expired exceptions fail closed.
- Source-freshness contract: 34 tracked external sources with verified baselines (`refresh/sources.json` + `refresh/REFRESH.md`), weekly-refresh design with CI-guarded refresh PRs.
