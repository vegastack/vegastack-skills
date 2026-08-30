# dev-plan

The planning stage of the dev workflow: an approved brief goes in, an operator-approved plan comes out, and only then does code exist. For `full-plan` issues it runs as its own fresh-grounded session (re-reads the current code, interviews the operator over approaches / system design / risk, challenges the brief where planning reveals gaps) and posts a strict-format plan comment — exact files, an Interfaces block per task, failing-test-first steps, no placeholders. For `quick-build` issues its inline mode runs inside the intake conversation so one approval covers brief and plan together. The scope ratchet lives here: work revealed bigger than its label stops and proposes the upgrade; downgrades need the operator's yes. The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/skills add dev-plan
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point |
| [scripts/plan-lint.mjs](scripts/plan-lint.mjs) | Plan structure + banned-placeholder guard (blocks) |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [references/plan-format.md](references/plan-format.md) | The plan comment template, banned placeholders, self-review, worked example |
| [refresh/sources.json](refresh/sources.json) | Source registry for volatile claims |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract (evergreen waiver) |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and fixtures (never packaged) |

## Behavior

Picks up `needs-plan` issues (or intake's inline request), re-grounds against the current repo, runs the numbered questionnaire with recommended answers, and posts the plan per [plan-format](references/plan-format.md). Posting flips the issue to `needs-operator`; the operator's "plan approved" is recorded as a marker comment and the issue goes `ready` — building belongs to dev-implement. Guardrails: no plan re-proposes a recorded dev-architect rejection; a plan nearing GitHub's comment cap becomes an epic-split proposal; checkboxes are never pre-ticked; every run ends with a plain-language summary.
