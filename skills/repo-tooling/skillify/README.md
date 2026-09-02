# skillify

The meta skill for this monorepo: it turns a raw workflow into a properly-skilled unit of `skills/` and audits existing skills against the repo contract, with a scored 8-item checklist, a three-valued verdict, and a behavioral eval gate that runs before tests lock anything in. It is deliberately repo-only — it builds and scores skills for *this* repository, not a general-purpose skill generator.

This README is the walkthrough for humans and for agents reading outside a skill-invocation context. The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/skills add skillify   # repo-only: not installed by --all
```

Installs into `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex). Run it from the vegastack-skills repo root and keep it project-local: it is the deliberate exception to the recommended `--global` install, because a global copy would trigger in every other project on your machine. See the [installer README](../../../packages/cli/README.md) for all flags.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: the 8-item checklist, verdicts, Phases 0–6, worked example, anti-patterns |
| [references/authoring.md](references/authoring.md) | Description engineering, writing style, numeric limits, trigger query sets, token economy, script-vs-instructions criteria, volatile facts |
| [references/eval-playbook.md](references/eval-playbook.md) | With-skill vs baseline eval method, pass criteria, cycle protocol, KNOWN_GAPS format, model guidance |
| `assets/templates/` | The seven scaffolded starting points: SKILL.md, README.md, sources.json, REFRESH.md, openai.yaml, an empty trigger-query fixture, and a contract test |
| [scripts/scaffold-skill.mjs](scripts/scaffold-skill.mjs) | Deterministic scaffolder: name-grammar validation, dry-run plan, atomic `--write`, automatic repo wiring (packaging entry, root README row, changeset) |
| [scripts/trigger-check.mjs](scripts/trigger-check.mjs) | Deterministic family-level trigger guard: walks every skill's trigger-query fixture, blocks (exit 2) on a query two skills claim without a mutual `ambiguous_with`, warns on fixture hygiene; runs in `bun run check` as `validate:triggers` |
| [refresh/sources.json](refresh/sources.json) | Deliberately empty registry — see freshness below |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Skillify's delegating freshness contract |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and fixtures (never packaged) |

## The workflow in one paragraph

Phase 0 gates ("should this be a skill at all?" — invoked twice, real logic, real trigger phrase, one trigger family; prefer merging into an existing skill over a near-duplicate). Phase 1 audits and scores `<passed>/8` with a verdict: `properly skilled`, `close — create: <items>`, or `needs skillify`. Phase 2 elicits requirements, names the nearest-neighbor skill, and marks the volatile facts. Phase 3 scaffolds (the scaffolder also wires the repo) and writes. Phase 4 is the quality gate — with-skill vs baseline subagent runs on realistic prompts, at most 3 improve cycles, honest KNOWN_GAPS exit — because tests written first would lock in mediocrity. Phase 5 locks in script tests, the refresh contract or evergreen waiver, and the wiring TODOs. Phase 6 verifies with `bun run check`.

## The scaffolder

```sh
node scripts/scaffold-skill.mjs my-skill --dir ../..            # dry run: plan + wiring actions
node scripts/scaffold-skill.mjs my-skill --dir ../.. --write                 # create skills/my-skill/ and wire the repo
node scripts/scaffold-skill.mjs my-skill --dir ../.. --group dev-skills --write  # ...inside an existing group
node scripts/scaffold-skill.mjs my-skill --dir ../.. --json     # machine-readable plan
```

With `--group <name>` the skill lands at `skills/<group>/<name>/` and its README row goes into that group's section; an unknown group, a malformed `GROUP.md`, a missing README section or table, or a skill name already used at either depth is a refusal that writes nothing, because creating a group belongs to `skill-maintainer`'s group workflow and the flat bundle allows one skill per name. It validates the full name grammar (starts with a lowercase letter, `[a-z0-9-]`, no consecutive hyphens, no trailing hyphen, max 64), refuses existing directories and symlinked `skills/` roots, stages the tree in a temp sibling and renames it into place, substitutes `{{name}}`/`{{date}}`/`{{validatorPath}}`, and then performs the three wiring actions itself: the `packages/cli/packaging.json` entry (default runtime files), a root README Skills-table row (with a TODO description to fill in), and the changeset. Each action is idempotent and reports an explicit `skipped:` status when its target is already in place. A target it cannot write at all — no README, no Skills table, no group section, no `packages/cli/packaging.json` — is a pre-flight refusal instead, so the scaffolder never reports success while leaving a tree the structure check blocks. `.changeset/` is the one exception and still degrades to `skipped:`: a missing changeset breaks no check. `wireSkill` called on its own is a wiring primitive rather than a tree creator, so it stays permissive throughout. Exit codes: `0` ok, `1` refusal or failure, `2` usage error.

## Freshness

Skillify's registry is deliberately empty (`sources: []`). Its only time-decaying claims — the frontmatter/name/description numeric limits and harness listing budgets in [references/authoring.md](references/authoring.md), and the model guidance in [references/eval-playbook.md](references/eval-playbook.md) — are mirrored from the standards sources already tracked by the `skill-maintainer` registry, and are marked as mirrored/volatile at their location. See [refresh/REFRESH.md](refresh/REFRESH.md).

## For agents: how to behave

Follow [SKILL.md](SKILL.md). The short version: gate before scaffolding (most things should not be skills, and near-duplicates get merged); audit means score-and-stop, not edit; every description states triggers and never the workflow; run the behavioral eval before writing lock-in tests; stop after three eval cycles and ship named gaps instead of polished mediocrity; evals are instructions executed with your own subagents, never custom tooling.
