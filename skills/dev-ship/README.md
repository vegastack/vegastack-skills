# dev-ship

The last two gates of the workflow, each spent only by the user's explicit words: "make the PR" creates the pull request (linked to the issue's evidence, `Closes #n`, no duplication of the report), and a separate "merge" lands it (re-checking that the head is still the reviewed revision, then squash-merging per the dev.md knob) and appends any recorded decision to `docs/decisions.md`. With `gates: 2` in the profile, one "ship it" covers both.

The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-ship
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: the two gates, PR and merge mechanics, failure handling |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Evergreen waiver |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and the trigger-query fixture (never packaged) |

## Behavior contract

Green checks and PR permissions authorize nothing by themselves — only the user's instruction does, and each instruction covers exactly its own gate. Missing preconditions (no `for-you`, no evidence, moved head, failing checks) produce a plain statement of what's missing, never a workaround.
