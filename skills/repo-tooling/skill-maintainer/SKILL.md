---
name: skill-maintainer
description: Maintainer skill for the vegastack-skills repository itself. Use whenever working on this repo - creating or scaffolding a new skill, editing an existing skill (SKILL.md, references, refresh registry, tests), renaming, deprecating, or removing a skill, cutting a release or rolling one back, or checking cross-agent portability across Claude Code, Codex, Hermes, and the agentskills.io standard. Encodes the tri-harness standards (frontmatter policy, naming grammar, description and context budgets, install surfaces) and the per-skill contract every change under skills/ must satisfy. Load it before touching any file in this repo.
---

# VegaStack Skill Maintainer

Maintenance skill for this repository. Every change under `skills/` must satisfy the per-skill contract and the tri-harness standards below. Obey them in your own edits; enforce them in review. When a rule here disagrees with `CONTRIBUTING.md` or `.vegastack/dev.md` at the repo root, those win — then fix this skill.

## Operating rules

1. Skill content lives only in the skill's own directory, at one of exactly two depths: `skills/<name>/` ungrouped, or `skills/<group>/<name>/` inside a group. Both are first-class; deeper is a build error. A group is a directory holding skills plus a `GROUP.md` (an H1 display title, then one blurb line), and group and skill names share one namespace and one grammar. Wiring lives outside the skill: the per-skill packaging allowlist in `packages/cli/packaging.json` — always keyed by **bare** skill name, because the packaged bundle is flat and an install command never carries a group — the root `README.md` skills table, and `CHANGELOG.md` (via changesets). The skillify scaffolder writes all three when creating a skill.
2. Frontmatter is exactly two keys: `name` and `description`. The open spec also allows `license`, `compatibility`, and `metadata`, but this repo defaults to the minimal two; adding any other key is a policy exception needing maintainer sign-off.
3. `name` must equal the directory name. Grammar: starts with a lowercase letter, then only lowercase letters, digits, and hyphens; no leading/trailing hyphen, no consecutive hyphens; at most 64 chars.
4. `description`: at most 1024 chars, third person, states WHAT the skill does and WHEN to load it, trigger words front-loaded, no angle brackets. Never summarize the workflow in it — agents follow the summary and skip the body. Err slightly pushy: agents under-trigger.
5. `SKILL.md` under 500 lines (target under 150) and roughly under 5k tokens. Detail goes to `references/`, executables to `scripts/`, templates to `assets/`. Relative links stay inside the skill, one level deep.
6. No Claude-only body syntax anywhere in a skill: no dynamic command injection, no argument placeholders, no Claude environment-variable paths — the exact token list is in [standards](references/standards.md). Reference scripts as plain relative paths runnable from the skill directory.
7. Never hand-edit checksums, versions, or timestamps in any `refresh/sources.json` — they must come from a refresh-runner run.
8. Before finishing any change: `node packages/cli/scripts/validate-skill.mjs <skill-dir>` and `bun test <skill-dir>` for the skill you touched, plus `node packages/cli/scripts/structure.mjs check` for the repo shape (all from repo root) must pass, and `bun run readme:sync --write` regenerates the skill README's file table after a packaging change so the structure check stays green. `bun run check` runs the structure check as one of its stages.

## Route progressively

| Need | Read |
|---|---|
| tri-harness standards: discovery paths, frontmatter rules, context budgets, install surfaces, portability rules, unverified items | [standards](references/standards.md) |
| new skill: should-it-exist gate, scaffolding, the 8-item contract audit, behavioral evals | the `skillify` skill |
| repo shape: groups, `GROUP.md`, the README sections, the structure check | the group workflow below |
| release, rename, deprecate, rollback mechanics | [release ops](references/release-ops.md) |
| this skill's own freshness contract | [REFRESH](refresh/REFRESH.md), [sources](refresh/sources.json) |
| authoritative repo policy | `CONTRIBUTING.md` and `.vegastack/dev.md` at the repo root (release runbook, content semver, rollback) |

## Workflow: create or maintain a group

Groups are this skill's responsibility: the repo shape, its `GROUP.md` files, and the root README sections that mirror them. The deterministic method is `packages/cli/scripts/structure.mjs`, run from the repo root.

1. **Create a group** — `node packages/cli/scripts/structure.mjs create-group <name> --title "<Display Title>" --blurb "<one line>"` prints the plan; add `--write` to apply. It writes `skills/<name>/GROUP.md` and inserts the matching `### <Display Title>` README section after the existing tables. Dry-run by default, and idempotent when re-run with the same title. Every refusal happens before it writes anything: a name that breaks the grammar, names an existing skill at either depth, or resolves to a symlink; a title another group already uses, or a different title on an existing group (that is a rename — edit `GROUP.md` and the README heading together); a title or blurb that would produce a `GROUP.md` its own reader rejects; an existing but malformed `GROUP.md`; and a README with no `## Skills` table to hold the section.
2. **Put skills in it** — skillify's scaffolder places a new skill with `--group <name>`; it refuses — before writing anything — an unknown group, a malformed `GROUP.md`, a group with no README section, and a skill name already used at either depth, so a mistyped group never creates a stray family and the flat bundle never gets two skills of one name. Moving an existing skill into a group is a `git mv` plus its README row and its test's validator-import depth; `structure.mjs check` names anything left inconsistent.
3. **Check the shape** — `node packages/cli/scripts/structure.mjs check` blocks on illegal depth, name collisions, a missing or malformed `GROUP.md`, two groups sharing one `GROUP.md` title, a group with no README section, stray files in a group, a skill missing a contract meta file, packaging entries that disagree with the authored tree, a group-qualified packaging key, and README rows that are absent, duplicated, mispathed, or in the wrong section. It warns — without blocking, so warnings never fail `bun run check` — on an empty group, a group of one, and scaffolded placeholder text; `--strict` makes warnings exit 1. Dot-prefixed files and directories under `skills/` are ignored everywhere — discovery, this check, and the packaging build alike: they are tool and OS leftovers, not skills.

A group never reaches an installed **path**: the bundle is flat, so `GROUP.md` ships nowhere and an installed skill is always `<surface>/<bare-name>/`. A group is a *selection*, and the installer does expose it — `add`, `verify`, and `remove` each take one of a skill name, `--group <name>`, or `--all`, and a group install is one all-or-nothing transaction. Ungrouped skills at `skills/<name>/` stay fully supported; grouping is a choice, not a migration.

Two skills are marked repo-only in `packages/cli/repo-only.json`: `skill-maintainer` and `skillify` operate on this repository and do nothing useful elsewhere, so `--all` skips them while naming one explicitly still installs it. That list is data, validated by the build against the authored skills — never inferred from a skill's prose. Repo-only and group membership are independent: a group says where a skill is authored, the marker says who should install it.

## Workflow: scaffold a new skill

1. Run skillify's `scripts/scaffold-skill.mjs` — it creates the contract tree (`SKILL.md`, `README.md`, `refresh/`, `agents/openai.yaml`, tests and the trigger fixture) and performs the repo wiring itself: the `packages/cli/packaging.json` entry, the root README row in the right section, and the changeset (a new skill is MINOR). Pass `--group <name>` to place it in an existing group. Fill in the README row description and changeset text it leaves as placeholders; files added after scaffolding go into the skill's `packaging.json` entry by hand (the build fails loudly on unlisted files).
2. Write frontmatter and body per operating rules 2–6; the body routes to references, it does not inline them. `skillify` owns the full authoring and eval discipline.
3. Seed refresh baselines with the deterministic runner, never by hand — invocation in [REFRESH](refresh/REFRESH.md).
4. Run the checks in operating rule 8.

## Workflow: update or maintain

- **Content versioning.** New rules/references and new recorded decisions are MINOR; weakening a normative rule, removing or renaming a skill, or breaking a per-project profile format is MAJOR — except pre-1.0 with zero deployed profile consumers, where a profile-format break may ship MINOR per a recorded decision; factual refreshes (pins, URLs, checksums) are PATCH (the content-semver bullet in `.vegastack/dev.md`; detail in [release-ops](references/release-ops.md)).
- **Tag volatile claims.** Any sentence carrying a vendor version, mechanism name, or numeric budget gets a source marker comment mapping to an ID in that skill's `refresh/sources.json`, and the registry entry's `affected` list must name the reference it lives in. Untagged volatile facts rot silently.
- **Description budgets.** Stay within 1024 chars and keep triggers in the first sentence: Codex truncates its skill list at 2% of the context window / 8,000 chars, Claude Code truncates a skill's always-loaded listing at 1,536 chars — the tail of a long description is the first thing lost.
- **Packaged-file changes.** Any add/remove/rename of a packaged file must update that skill's `packages/cli/packaging.json` entry in the same PR.

## Workflow: rename, deprecate, or remove

Full playbook in [release ops](references/release-ops.md). Short form: a rename changes the directory and the frontmatter `name` in the same commit (they must stay equal), updates the packaging.json entry + root README table + CHANGELOG, and is MAJOR. Deprecation is announced in README/CHANGELOG before removal. Removal deletes the tree, unwires it, and is MAJOR.

## Workflow: release

Changeset lands with the PR → maintainer runs `bunx changeset version`, `bun install`, commits → tags `v<version>` → tag-driven pipeline runs check, tag↔version guard, npm trusted publishing, SBOM, GitHub release. One version identity: the package version covers the installer and every bundled skill's content snapshot — there is no separate content-contract version, and bumping the package must never invalidate a deployed per-project profile. Rollback is roll-forward (publish previous-good as a new patch) plus `npm deprecate` of the bad version; unpublish only within 72 hours and only in addition. Details: [release ops](references/release-ops.md).

## Workflow: portability check

Run this checklist before merging any skill change; per-harness detail in [standards](references/standards.md).

- [ ] Frontmatter keys exactly `name` + `description`, values within limits (rules 2–4).
- [ ] `name` equals the directory name.
- [ ] Description has no angle brackets and triggers front-loaded.
- [ ] `SKILL.md` under 500 lines; relative links resolve and stay inside the skill.
- [ ] No Claude-only body syntax (token list in standards).
- [ ] `agents/openai.yaml` present for Codex; extra files are safely ignored by the other harnesses.
- [ ] Install surfaces respected: Claude Code `.claude/skills` (project) / `~/.claude/skills` (global); Codex `.agents/skills` (project and global); Hermes `~/.hermes/skills` **global only** — never assume Hermes project-level discovery.
- [ ] `node packages/cli/scripts/validate-skill.mjs <skill-dir>` and `bun test <skill-dir>` pass, and `node packages/cli/scripts/structure.mjs check` is clean.

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
