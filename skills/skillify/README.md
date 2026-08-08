# skillify

The meta skill for this monorepo: it turns a raw workflow into a properly-skilled unit of `skills/` and audits existing skills against the full repo contract, with a scored 13-item checklist, a three-valued verdict, and a behavioral eval gate that runs before tests lock anything in. It is deliberately repo-only — it builds and scores skills for *this* repository, not a general-purpose skill generator.

This README is the walkthrough for humans and for agents reading outside a skill-invocation context. The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/skills add skillify
```

Installs into `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex); `--global` targets the home directory. See the [installer README](../../packages/cli/README.md) for all flags.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: the 13-item checklist, verdicts, Phases 0–6, worked example, anti-patterns |
| [references/authoring.md](references/authoring.md) | Description engineering, numeric limits, trigger query sets, token economy, script-vs-instructions criteria, claim classification |
| [references/eval-playbook.md](references/eval-playbook.md) | With-skill vs baseline eval method, pass criteria, cycle protocol, KNOWN_GAPS format, model guidance |
| `assets/templates/` | The six scaffolded starting points: SKILL.md, README.md, sources.json, REFRESH.md, openai.yaml, and a contract test |
| [scripts/scaffold-skill.mjs](scripts/scaffold-skill.mjs) | Deterministic scaffolder: name-grammar validation, dry-run plan, atomic `--write`, wiring-step printout |
| [refresh/sources.json](refresh/sources.json) | Deliberately empty registry — see freshness below |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Skillify's delegating freshness contract |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and fixtures (never packaged) |

## The workflow in one paragraph

Phase 0 gates ("should this be a skill at all?" — invoked twice, real logic, real trigger phrase, one trigger family). Phase 1 audits and scores `<passed>/13` with a verdict: `properly skilled`, `close — create: <items>`, or `needs skillify`. Phase 2 elicits requirements and classifies every claim (durable / mechanism-coupled / volatile). Phase 3 scaffolds and writes. Phase 4 is the quality gate — with-skill vs baseline subagent runs on realistic prompts, at most 3 improve cycles, honest KNOWN_GAPS exit — because tests written first would lock in mediocrity. Phase 5 locks in tests, refresh contract, and repo wiring. Phase 6 verifies with `bun run check`.

## The scaffolder

```sh
node scripts/scaffold-skill.mjs my-skill --dir ../..            # dry run: plan + wiring steps
node scripts/scaffold-skill.mjs my-skill --dir ../.. --write    # create skills/my-skill/
node scripts/scaffold-skill.mjs my-skill --dir ../.. --json     # machine-readable plan
```

It validates the full name grammar (starts with a lowercase letter, `[a-z0-9-]`, no consecutive hyphens, no trailing hyphen, max 64), refuses existing directories and symlinked `skills/` roots, stages the tree in a temp sibling and renames it into place, substitutes `{{name}}`/`{{date}}`, and always prints the three manual wiring steps (sync-skill allowlist, root README row, CHANGELOG). Exit codes: `0` ok, `1` refusal or failure, `2` usage error.

## Freshness

Skillify's registry is deliberately empty (`sources: []`). Its only time-decaying claims — the frontmatter/name/description numeric limits and harness listing budgets in [references/authoring.md](references/authoring.md), and the model guidance in [references/eval-playbook.md](references/eval-playbook.md) — are mirrored from the standards sources already tracked by the `skill-maintainer` registry, and are marked as mirrored/volatile at their location. See [refresh/REFRESH.md](refresh/REFRESH.md).

## For agents: how to behave

Follow [SKILL.md](SKILL.md). The short version: gate before scaffolding (most things should not be skills); audit means score-and-stop, not edit; every description states triggers and never the workflow; run the behavioral eval before writing lock-in tests; stop after three eval cycles and ship named gaps instead of polished mediocrity; evals are instructions executed with your own subagents, never custom tooling.
