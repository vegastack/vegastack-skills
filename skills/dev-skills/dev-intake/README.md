# dev-intake

Turns requirements — a brainstorm, a feature thought, an SOW — into GitHub issues complete enough that a fresh agent needs nothing but the URL. All questions happen here, in grilling-style rounds where every question ships with a recommended answer; once an issue is approved and `ready`, dark implementation needs no further input. Also records the user's approval (their quoted words, dated, in one comment) and manages the `needs-operator` → `ready` labels.

The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-intake
npx @vegastack/skills add --group dev-skills   # or the whole dev workflow at once
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: read-first rule, interview protocol, slicing, labels and approval recording |
| [scripts/brief-lint.mjs](scripts/brief-lint.mjs) | Brief structure guard (blocks) with vague-wording warnings |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [references/brief-template.md](references/brief-template.md) | The issue-body template every `ready` issue follows, with writing rules |
| [refresh/REFRESH.md](refresh/REFRESH.md) + [refresh/sources.json](refresh/sources.json) | Evergreen waiver and its deliberately empty registry |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and the trigger-query fixture (never packaged) |

## Behavior contract

Reads source material completely before asking anything — facts are the agent's job, decisions are the user's. Questions come in numbered rounds with recommended answers so "all recommended" is a valid reply. Issues are vertical slices sized for one agent session, wired with native dependencies/milestones/sub-issues; parent issues never get `ready`. Approval is only the user's explicit words, recorded once — labels and silence never create it.
