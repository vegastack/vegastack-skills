# @vegastack/skills

## 0.10.0

### Minor Changes

- d829d2f: The `architect` skill is now `dev-architect`, the fifth member of the dev-skills family, rebuilt around one-rule-one-home references and a verify-before-you-recommend protocol (platform capability/version claims are checked against pinned facts, then live docs, before shaping a recommendation). The per-project `.vegastack/arch.md` profile is retired: architecture facts live in a `## Architecture` section of `.vegastack/dev.md` (written by dev-setup, which also migrates legacy arch.md files), and ADRs are retired in favor of the `.vegastack/decisions.md` register. dev-intake, dev-implement, and dev-setup now cross-reference dev-architect explicitly; `doctor` checks `.vegastack/dev.md` instead of arch.md. Migration: copies installed under the old `architect` name are orphaned — reinstall with `npx @vegastack/skills add dev-architect`; installer operations addressed to `architect` no longer resolve. Renaming a skill now ships minor by default (major is the operator's explicit call); removing a skill stays major.

## 0.9.1

### Patch Changes

- 0c92956: Restore a pinned `0.0.0` placeholder version on the workspace root: `npm sbom` purl generation requires every package to carry a version, so the 0.9.0 release pipeline failed at the SBOM step (after a successful npm publish — 0.9.0 has no GitHub release/SBOM as a result). The stack playbook's npm guidance now says to pin `0.0.0` instead of deleting the field. No package content changes.

## 0.9.0

### Minor Changes

- 022d1bf: Dev workflow v2 — ground-up overhaul of the dev skill family for any stack, greenfield included.

  - `.vegastack/dev.md` becomes each project's **single canonical process doc**: release runbook, changelog convention, versioning policy, and rollback fold in as `## Ship` bullets — no separate policy docs. New `authority:` line, `labels:` and `changelog:` knobs, `gates: 1` (direct-to-main for single-operator projects), and a `## Decisions` section carrying the qualification test. The decision register default moves to `.vegastack/decisions.md` with the format `- DD-MM-YYYY (github-username) — decision`; every entry needs the user's explicit yes.
  - **dev-setup**: new `references/stack-playbooks.md` maps detection signals to stack-native drafts (npm/changesets, Node app, Flutter, Python, Go, generic) — Ship runbook, changelog convention, version identity, guards, rollback line each. Greenfield repos are a supported path (intended-stack interview, git init / gh repo create on yes) instead of a hard stop. Round C can scaffold release-guard CI steps, the shared cross-project evidence repo (`<owner>/dev-review-evidence`, contents-API uploads, no clones), and an optional decision-capture Stop hook for both Claude Code and Codex (recipe + sourced hook facts in harness-facts.md).
  - **dev-implement**: changelog entry is a first-class step before hand-back (changesets written non-interactively as `.changeset/<slug>.md`); evidence comment gains `**Changelog:**` and `**Decision:**` lines; branch pattern reads solely from dev.md.
  - **dev-ship**: new `references/runbook.md` — `auto:`/`ask:`/`guard:` semantics (guards run locally, CI is the backstop), release batching, direct-to-main mechanics, bot PRs (merging one is shipping: green checks qualify, only the operator's word merges), roll-forward rollback. Gate 1 verifies the changelog entry; Gate 2 names pending decisions in the merge confirmation before recording them.
  - **AGENTS.md section**: hard consent rule — nothing ships without the operator's explicit instruction; the gates knob changes coverage, never the need for a word — plus portable ad-hoc decision capture on both harnesses.
  - **dev-intake**: brief template gains docs/changelog surfaces and a Version impact line; `Decision:` comments are gated by the dev.md test.

  This repo dogfoods the result: `docs/policies/` is folded into `.vegastack/dev.md` and deleted, the register moved to `.vegastack/decisions.md`, and the release workflow now leads its GitHub release notes with the changelog entry and fails if the entry is missing.

## 0.8.0

### Minor Changes

- 4656b81: dev.md becomes the project's self-maintained handbook: new Ship (post-merge runbook with auto/ask steps), Verify, Environments, and Design sections plus a release knob (per-merge | on-request); dev-setup detects release/deploy machinery and drafts them; dev-ship follows the Ship runbook after merge and stops at ask-lines and failures; dev-implement follows the Verify runbook for live evidence. The retro-fold rule lands in the shared AGENTS.md section: gotchas become one proposed dev.md line, folded into existing sections, never a log. Labels renamed for role clarity: needs-you → needs-operator, for-you → for-operator (re-run dev-setup to create them; old labels remain on historical issues). This repo now dogfoods the workflow with its own dev.md whose Ship runbook is the changesets release flow.

## 0.7.0

### Minor Changes

- 899bb5b: Add the dev-implement skill: implements an approved issue end to end without user input — fail-closed preflight (label plus recorded approval), claim by assignee and working label, dark execution bounded by the brief and the dev.md stop-list, tests, independent review, one in-place evidence comment, hand-back with for-you. Direct user requests in chat bypass the issue machinery on the user's own authority.
- 899bb5b: Add the dev-intake skill: turns brainstorms, feature requests, and SOWs into agent-ready GitHub issues — grilling-style rounds with recommended answers, vertical-slice briefs from a template, native dependencies/milestones, and quoted-approval recording that flips needs-you to ready.
- 899bb5b: Add the dev-setup skill: re-runnable project bootstrap for the issue-driven dev workflow — detect-first interview, `.vegastack/dev.md` profile with knobs, marked AGENTS.md section plus CLAUDE.md import, the five workflow labels, and the decision register; degrades to documented defaults marked TODO when no question tool is available.
- 899bb5b: Add the dev-ship skill: the last two gates, each spent only by the user's words — PR creation linked to the issue's evidence, then a separate merge instruction that re-verifies the reviewed head, squash-merges, and appends recorded decisions to the register.
- 3b989bb: skillify v2 — lean contract. The checklist shrinks from 13 to 8 items with stable additive numbering: unit tests are now required only for bundled scripts' deterministic branches (a prose-only skill's quality bar is the behavioral eval), the per-skill consistency test becomes a repo-wide relative-link check inside validate-skill.mjs, and the claim-classification taxonomy collapses to one volatile-facts rule with a one-line evergreen waiver default. New: a "sharp boundary" item requiring each skill to name its nearest-neighbor skill and the axis of difference; trigger-query fixtures become ~10 hard queries with `ambiguous_with`; authoring.md gains writing-style doctrine (prompt the positive, hunt no-ops and sediment, 50–150-line body budget). The scaffolder now performs repo wiring itself — packaging entry (moved from sync-skill.mjs code into packaging.json data), root README row, and changeset — idempotently, degrading to explicit skipped statuses outside the monorepo.

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
