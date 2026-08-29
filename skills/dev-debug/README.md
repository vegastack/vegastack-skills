# dev-debug

Reproduce-first bug work, as a hard phase order with checkable completion criteria: build a **red command** (one named command that fails on the exact reported symptom — no red command, no theorizing), shrink the repro until every element is load-bearing, rank 3–5 falsifiable suspects and post them to the ledger without pausing, test one variable at a time with `[DEBUG-<4hex>]`-tagged probes (cleanup is one grep, and ship-gate blocks survivors), write the regression test at a correct seam **before** the fix — red, fix, green, then the original un-minimised loop — and close by naming the winning suspect so the next debugger learns the cause, not just the absence. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-debug
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point — the six phases and their criteria |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [references/loop-ladder.md](references/loop-ladder.md) | The eight rungs for building the red command, tightening axes, and the no-rung stop |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract (evergreen waiver) |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and fixtures (never packaged) |

## Behavior

Runs inside dev-implement's dark mode on `fix:` issues (whose intake brief carries the Reproduction section) and on direct bug asks within the trivial-path bounds. No operator questions: a bug that can't get a red command becomes one `handback` comment trading tried-rungs for artifacts; the suspect list posts and work proceeds (operator re-ranks async if watching). A missing correct seam for the regression test is recorded as a finding, never papered over with a false-confidence test.
