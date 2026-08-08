---
name: skill-maintainer
description: Maintainer skill for the vegastack-skills repository itself. Use whenever working on this repo - creating or scaffolding a new skill, editing an existing skill (SKILL.md, references, refresh registry, tests), renaming, deprecating, or removing a skill, cutting a release or rolling one back, or checking cross-agent portability across Claude Code, Codex, Hermes, and the agentskills.io standard. Encodes the tri-harness standards (frontmatter policy, naming grammar, description and context budgets, install surfaces) and the per-skill contract every change under skills/ must satisfy. Load it before touching any file in this repo.
---

# VegaStack Skill Maintainer

Maintenance skill for this repository. Every change under `skills/` must satisfy the per-skill contract and the tri-harness standards below. Obey them in your own edits; enforce them in review. When a rule here disagrees with `CONTRIBUTING.md` or `docs/policies/` at the repo root, those win — then fix this skill.

## Operating rules

1. Skill content lives only in `skills/<name>/`. Wiring lives outside it: the packaging allowlist in `packages/cli/scripts/sync-skill.mjs`, the root `README.md` skills table, and `CHANGELOG.md` (via changesets).
2. Frontmatter is exactly two keys: `name` and `description`. The open spec also allows `license`, `compatibility`, and `metadata`, but this repo defaults to the minimal two; adding any other key is a policy exception needing maintainer sign-off.
3. `name` must equal the directory name. Grammar: starts with a lowercase letter, then only lowercase letters, digits, and hyphens; no leading/trailing hyphen, no consecutive hyphens; at most 64 chars.
4. `description`: at most 1024 chars, third person, states WHAT the skill does and WHEN to load it, trigger words front-loaded, no angle brackets. Never summarize the workflow in it — agents follow the summary and skip the body. Err slightly pushy: agents under-trigger.
5. `SKILL.md` under 500 lines (target under 150) and roughly under 5k tokens. Detail goes to `references/`, executables to `scripts/`, templates to `assets/`. Relative links stay inside the skill, one level deep.
6. No Claude-only body syntax anywhere in a skill: no dynamic command injection, no argument placeholders, no Claude environment-variable paths — the exact token list is in [standards](references/standards.md). Reference scripts as plain relative paths runnable from the skill directory.
7. Never hand-edit checksums, versions, or timestamps in any `refresh/sources.json` — they must come from a refresh-runner run.
8. Before finishing any change: `node packages/cli/scripts/validate-skill.mjs skills/<name>` and `bun test skills/<name>` (both from repo root) must pass.

## Route progressively

| Need | Read |
|---|---|
| tri-harness standards: discovery paths, frontmatter rules, context budgets, install surfaces, portability rules, unverified items | [standards](references/standards.md) |
| release, rename, deprecate, rollback mechanics | [release ops](references/release-ops.md) |
| this skill's own freshness contract | [REFRESH](refresh/REFRESH.md), [sources](refresh/sources.json) |
| authoritative repo policy | `CONTRIBUTING.md`, `docs/policies/content-versioning.md`, `docs/policies/release-and-rollback.md` at the repo root |

## Workflow: scaffold a new skill

1. Create `skills/<name>/` with the full per-skill contract: `SKILL.md` (agent entry), `README.md` (repo-side walkthrough, never packaged), `references/`, `tests/` (bun tests, never packaged), `refresh/sources.json` + `refresh/REFRESH.md` (freshness contract), `agents/openai.yaml` (Codex interface metadata); `scripts/` and `assets/` only if the skill needs them.
2. Write frontmatter and body per operating rules 2–6; the body routes to references, it does not inline them.
3. Wire it in: add every packaged file to the allowlist in `packages/cli/scripts/sync-skill.mjs` (the build fails loudly on unlisted files); add a row to the root README skills table; add a changeset (a new skill is MINOR).
4. The installer is multi-skill: every authored skill needs a packaging allowlist entry in packages/cli/scripts/sync-skill.mjs (the build fails loudly on unlisted files).
5. Seed refresh baselines with the deterministic runner, never by hand — invocation in [REFRESH](refresh/REFRESH.md).
6. Run the checks in operating rule 8.

## Workflow: update or maintain

- **Stable IDs are permanent.** Never renumber or reuse a rule ID; removing or renaming one is a MAJOR content change (`docs/policies/content-versioning.md`). New rules/references are MINOR; weakening a MUST is MAJOR; factual refreshes (pins, URLs, checksums) are PATCH.
- **Tag volatile claims.** Any sentence carrying a vendor version, mechanism name, or numeric budget gets a source marker comment mapping to an ID in that skill's `refresh/sources.json`, and the registry entry's `affected` list must name the reference it lives in. Untagged volatile facts rot silently.
- **Description budgets.** Stay within 1024 chars and keep triggers in the first sentence: Codex truncates its skill list at 2% of the context window / 8,000 chars, Claude Code truncates a skill's always-loaded listing at 1,536 chars — the tail of a long description is the first thing lost.
- **Packaged-file changes.** Any add/remove/rename of a packaged file must update the `sync-skill.mjs` allowlist in the same PR.

## Workflow: rename, deprecate, or remove

Full playbook in [release ops](references/release-ops.md). Short form: a rename changes the directory and the frontmatter `name` in the same commit (they must stay equal), updates allowlist + root README table + CHANGELOG, and is MAJOR. Deprecation is announced in README/CHANGELOG before removal. Removal deletes the tree, unwires it, and is MAJOR.

## Workflow: release

Changeset lands with the PR → maintainer runs `bunx changeset version`, `bun install`, commits → tags `v<version>` → tag-driven pipeline runs check, tag↔version guard, npm trusted publishing, SBOM, GitHub release. Two decoupled version identities — **package version** (npm, changesets) and **foundation version** (content contract for deployed profiles) — must never be conflated; bumping the package must never invalidate a deployed profile. Rollback is roll-forward (publish previous-good as a new patch) plus `npm deprecate` of the bad version; unpublish only within 72 hours and only in addition. Details: [release ops](references/release-ops.md).

## Workflow: portability check

Run this checklist before merging any skill change; per-harness detail in [standards](references/standards.md).

- [ ] Frontmatter keys exactly `name` + `description`, values within limits (rules 2–4).
- [ ] `name` equals the directory name.
- [ ] Description has no angle brackets and triggers front-loaded.
- [ ] `SKILL.md` under 500 lines; relative links resolve and stay inside the skill.
- [ ] No Claude-only body syntax (token list in standards).
- [ ] `agents/openai.yaml` present for Codex; extra files are safely ignored by the other harnesses.
- [ ] Install surfaces respected: Claude Code `.claude/skills` (project) / `~/.claude/skills` (global); Codex `.agents/skills` (project and global); Hermes `~/.hermes/skills` **global only** — never assume Hermes project-level discovery.
- [ ] `node packages/cli/scripts/validate-skill.mjs skills/<name>` and `bun test skills/<name>` pass.

## Hard limits

| Limit | Value |
|---|---|
| `name` | ≤ 64 chars, lowercase letter first, then `[a-z0-9-]`, no consecutive hyphens, equals directory name |
| `description` | 1–1024 chars, no angle brackets |
| `SKILL.md` | under 500 lines / ~5k tokens; target under 150 lines |
| Claude Code listing | name + description truncated at 1,536 chars per skill |
| Claude Code body | first 5,000 tokens persist across compaction; 25,000-token shared skills budget |
| Codex skill list | 2% of context window / 8,000 chars — descriptions shortened first |
| Hermes skills_list | ~3k tokens |

These mirror marked sentences in [standards](references/standards.md); update both in the same PR when a source changes.
