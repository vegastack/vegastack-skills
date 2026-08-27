# dev-implement

Takes an approved (`ready`) GitHub issue and builds it end to end without further user input: preflight, claim (assignee + `working` label, so two agents can't grab one issue), task branch, dark execution bounded by the brief and the `.vegastack/dev.md` stop-list, tests, independent review (subagent by default, cross-agent by knob), and exactly one evidence comment in the issue before handing back with `for-you`. Creates no PR and merges nothing — that is `dev-ship`, on the user's word.

The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-implement
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: preflight, claim, dark-mode bounds, verify, review modes, evidence contract, corrections loop |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Evergreen waiver |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and the trigger-query fixture (never packaged) |

## Behavior contract

Preflight fails closed: no recorded approval comment, open blockers, another claimant, or a material open decision in the brief each stop the run with a named reason. Dark mode means no progress pings and no questions — routine choices are the implementer's, stop-list hits end dark mode with one `needs-you` comment. Tests are never weakened to pass. The evidence comment is edited in place across correction rounds so the current truth is always in one place.
