# @vegastack/skills

## 0.6.0

### Minor Changes

- 3beee21: Replace arch-guardian with architect — a from-scratch rebuild of the VegaStack architecture skill.

  The retired arch-guardian (106 rules, 18 reference files, profile/schema/refresh tooling, its own test corpus) is deleted. The new `architect` skill encodes the same intent — consistent, MK-grade architecture decisions from any team member's agent — as a lean advisory skill: an evidence-distilled decision-table stack reference, dated source-verified platform facts, lean-first principles with their reasoning, domain taste references (web, data, infra, AI/agents, security, mobile), and a per-project `.vegastack/arch.md` profile created by a first-run Q&A where the repository always wins over the stored file.

  Breaking for existing installs: `npx @vegastack/skills add architect` (the old skill name is gone; remove old arch-guardian installs manually or with `remove`). `doctor` now checks for `.vegastack/arch.md` instead of `architecture.json`. The repo-shared refresh runner moved from the skill to `tooling/refresh/`.

## 0.5.0

### Minor Changes

- 3a6c2da: skills.sh-style install UX: auto-detect installed agents (~/.claude, ~/.codex or ~/.agents, ~/.hermes) and target them without prompting; a simple numbered picker appears only when nothing is detected. The confusing "codex, claude, hermes, both, all" free-text question and the project/global question are gone — installs are project-local by default, `--global` and `--agent` still override.

## 0.4.0

### Minor Changes

- a0fa476: Housekeeping: standardize on Node 24 and current GitHub Actions

  - `engines.node` raised from `>=20.11` to `>=24` (Node 20 is EOL; Node 24 is LTS and what CI/release run on)
  - CI matrix collapsed to Node 24; deprecated actions bumped: `actions/checkout` v4→v7, `actions/setup-node` v4→v7, `softprops/action-gh-release` v2→v3

## 0.3.0

### Minor Changes

- 868f939: arch-guardian v2: advisory-only redesign (breaking content change under 0.x)

  - **Profile schema v4** (foundation 0.4.0): slim ~12-line profile — name, kind, **tier** (`prototype`/`production`/`enterprise`), tenancy, hosting, enabled capability list, notes. Versions come from lockfiles; exceptions removed. `profile-tool.mjs migrate` converts v3 profiles (exceptions become notes).
  - **Checker removed**: `architecture-check.mjs`, `control-catalog.json`, and the PASS/FAIL/EXCEPTED outcome and exception machinery are deleted. Reviews now follow the evidence-backed advisory report contract (`references/advisory-report.md`) with severities `critical`/`production-gate`/`enterprise-gate`/`consider`, per-area grades, and a stable JSON block for downstream automation.
  - **Tiers gate concerns, never tools**: rules carry tier floors; tool choices (OpenBao, pg-boss, EVE, Valkey) become defaults with named escalation triggers under the new minimum-viable-architecture principle. Rule `FOUND-002` retired (never reused).
  - **Freshness upgrades**: OSV.dev advisory watch for every pinned package (fail-closed on critical sources), `reviewBy` overdue warnings for foundation baselines, verified `llms.txt` URLs in the source registry, and proportionate freshness (full check only for design reviews leaning on critical pins).
  - CLI `doctor` validates v4 profiles and runs profile validation instead of the deleted checker.

## 0.2.0

### Minor Changes

- Rename vegastack-arch-guardian to arch-guardian (clean break); generalize the installer to N bundled skills with schemaVersion-2 integrity manifest and journal; add skill-maintainer and skillify skills; add Hermes install surface (~/.hermes/skills, global-only) and a list command; enforce the full cross-harness skill name grammar and six-field frontmatter ceiling.
