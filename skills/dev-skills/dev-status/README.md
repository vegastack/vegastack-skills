# dev-status

The operator's board: one ask — "status", "what needs me" — answers whose move it is across every issue in the dev workflow. A deterministic, read-only script gathers open issues per state label (with age, scope class, and risky flags), live task progress from plan-comment checkboxes, ledger-heartbeat liveness for `working` issues (silent past the orphan window → possibly-orphaned), open PRs with check state, decision proposals not yet in the register, and the last chronicle chapter. The skill renders the needs-you-first report — issues and PRs named as links rather than bare numbers, ending with the single most valuable Next action — and never invents state: an unverifiable board is reported as exactly that. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-status --global
```

Or the whole dev workflow at once:

```sh
npx @vegastack/skills add --group dev-skills --global
```

`--global` installs into your home directory, where the skill is available in every project; drop it for a project-local install. See the [installer README](../../../packages/cli/README.md) for all flags.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point — gather + render rules |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [scripts/status.mjs](scripts/status.mjs) | The gatherer: gh-backed, markers-only, knob-aware (labels/register from dev.md), exit 2 on cannot-verify |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract (evergreen waiver) |
| [refresh/sources.json](refresh/sources.json) | Deliberately empty source registry behind the evergreen waiver |
| `tests/` | Unit tests for every helper + a gh-stub integration test over canned scenarios (never packaged) |

## Behavior

`node scripts/status.mjs --orphan-hours 6 --json` returns the data; the skill orders it (your queue first, oldest first), omits empty sections, shows a quiet board as one honest line, and marks judgment as judgment — the wait-reason one-liners and the Next pick are the skill's calls, clearly not data. A possibly-orphaned `working` issue — its ledger heartbeat silent past the orphan window — is surfaced as a fact ("check, resume, or reclaim"), never acted on: takeovers still require the operator's explicit handover, and `reclaim.mjs` is the operator's to run. Projects with renamed labels or a moved decision register work unchanged — the script reads the dev.md knobs.
