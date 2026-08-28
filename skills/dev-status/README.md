# dev-status

The operator's board: one ask — "status", "what needs me" — answers whose move it is across every issue in the dev workflow. A deterministic, read-only script gathers open issues per state label (with age, scope class, and risky flags), live task progress from plan-comment checkboxes, ledger staleness for `working` issues, open PRs with check state, decision proposals not yet in the register, and the last chronicle chapter. The skill renders the needs-you-first report — every line a named link, ending with the single most valuable Next action — and never invents state: an unverifiable board is reported as exactly that. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-status
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point — gather + render rules |
| [scripts/status.mjs](scripts/status.mjs) | The gatherer: gh-backed, markers-only, knob-aware (labels/register from dev.md), exit 2 on cannot-verify |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract (evergreen waiver) |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Unit tests for every helper + a gh-stub integration test over canned scenarios (never packaged) |

## Behavior

`node scripts/status.mjs --stale-days 3 --json` returns the data; the skill orders it (your queue first, oldest first), omits empty sections, shows a quiet board as one honest line, and marks judgment as judgment — the wait-reason one-liners and the Next pick are the skill's calls, clearly not data. A stale `working` issue is surfaced as a fact ("check or reclaim"), never acted on: takeovers still require the operator's explicit handover. Projects with renamed labels or a moved decision register work unchanged — the script reads the dev.md knobs.
