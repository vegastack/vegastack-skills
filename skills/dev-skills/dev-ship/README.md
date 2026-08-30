# dev-ship

The shipping gates of the workflow, each spent only by the user's explicit words: "make the PR" creates the pull request (linked to the issue's evidence, `Closes #n`, changelog entry verified), and a separate "merge" lands it (re-checking that the head is still the reviewed revision, then merging per the dev.md knob) and appends approved decisions to the register the `decisions:` knob names. The dev.md `gates` knob sets coverage: `2` lets one "ship it" cover both, `1` is direct-to-main with no PR. After merge it runs the dev.md `## Ship` runbook — release steps, local guards, deploys — stopping at every `ask:` line and every failure.

The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-ship
```

## What's in this skill

| Path | Purpose |
|---|---|
| [scripts/ship-gate.mjs](scripts/ship-gate.mjs) | The Gate 1 deterministic guard (fresh check re-run, sha equality, changelog/chronicle, verdicts, tag grep) |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [SKILL.md](SKILL.md) | Agent entry point: the gates, PR and merge mechanics, decision recording, failure handling |
| [references/runbook.md](references/runbook.md) | Runbook execution semantics (auto/ask/guard), release batching, direct-to-main, bot PRs, rollback |
| [refresh/REFRESH.md](refresh/REFRESH.md) + [refresh/sources.json](refresh/sources.json) | Evergreen waiver and its deliberately empty registry |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and the trigger-query fixture (never packaged) |

## Behavior contract

Green checks and PR permissions authorize nothing by themselves — only the user's instruction does, and each instruction covers exactly its own gate. Missing preconditions (no `for-operator`, no evidence, moved head, failing checks) produce a plain statement of what's missing, never a workaround.
