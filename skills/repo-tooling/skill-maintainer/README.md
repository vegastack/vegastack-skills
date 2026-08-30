# skill-maintainer

The skill an agent loads when working **on** this repository — creating, updating, renaming, releasing, or removing skills. It encodes the verified tri-harness standards (Claude Code, Codex, Hermes, and the agentskills.io open standard) plus this repo's per-skill contract, so every change under `skills/` complies by construction.

This README is the walkthrough for humans and for agents reading outside a skill-invocation context. The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/skills add skill-maintainer   # repo-only: not installed by --all
```

Only useful if you are contributing to the vegastack-skills repository itself — it encodes that repo's contract and wiring. See the [installer README](../../../packages/cli/README.md) for all flags.

## When to load it

Any work in this repo: scaffolding a new skill, editing an existing one (SKILL.md, references, refresh registry, tests), rename/deprecate/remove operations, cutting or rolling back a release, or checking a skill's cross-agent portability.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: operating rules, routing table, the six workflows (group / scaffold / update / rename-remove / release / portability check), hard numeric limits |
| [references/standards.md](references/standards.md) | The complete tri-harness standards: per-harness discovery paths, frontmatter rules, context budgets, install surfaces, the seven portability rules, and the UNVERIFIED register |
| [references/release-ops.md](references/release-ops.md) | Expanded release / rename / rollback detail behind the `## Ship` runbook in [.vegastack/dev.md](../../../.vegastack/dev.md), subordinate to it |
| [refresh/sources.json](refresh/sources.json) | Source registry: the four standards pages this skill's claims are pinned to (all critical) |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract: standards drift is always semantic and always human-reviewed |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests asserting this skill obeys the very standards it teaches (never packaged) |

## The standards it encodes

One authored tree must run on three harnesses. The load-bearing facts, in one breath: frontmatter is `name` + `description` only; the name equals the directory name under the intersection grammar (lowercase letter first, `[a-z0-9-]`, no consecutive hyphens, ≤ 64 chars); the description is ≤ 1024 chars with triggers front-loaded because both Claude Code (1,536-char listing) and Codex (2%/8,000-char skill list) truncate; SKILL.md stays under 500 lines with detail pushed to references; no Claude-only body syntax; and Hermes discovers skills **globally only** (`~/.hermes/skills/`), which the installer must respect. Full detail with source citations: [references/standards.md](references/standards.md).

## Freshness

The four source pages (agentskills.io spec, Claude Code, Codex, Hermes skills docs) are tracked in [refresh/sources.json](refresh/sources.json) with `thresholdDays: 14` and `critical: true` — they are the product's compliance basis. Volatile sentences in the standards reference carry `source:` markers; any drift requires a human-reviewed PR, never an automatic edit. The registry ships with runner-seeded checksum baselines; after any standards change, re-seed them with the shared deterministic runner (`tooling/refresh/refresh-evidence.mjs --registry skills/repo-tooling/skill-maintainer/refresh/sources.json --accept-baselines`) — see [refresh/REFRESH.md](refresh/REFRESH.md).

## Self-test

```sh
node packages/cli/scripts/validate-skill.mjs skills/repo-tooling/skill-maintainer   # from repo root
bun test skills/repo-tooling/skill-maintainer
node packages/cli/scripts/structure.mjs check                         # repo shape: groups, GROUP.md, README sections
```

The tests eat the skill's own dog food: structural validation via the repo validator, the 500-line SKILL.md cap, the two-key frontmatter policy, resolution of every relative link, and a bijection check between `source:` markers in references and registry IDs.

## For agents: how to behave

Follow [SKILL.md](SKILL.md). The short version: repo policy docs win over this skill on conflict; wiring (the packaging.json entry, root README table, changesets) travels in the same PR as the content change; never hand-edit refresh checksums; and finish nothing without the validator, the skill's tests, and the structure check passing.
