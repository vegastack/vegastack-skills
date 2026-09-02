# dev-implement

Takes an approved (`ready`) GitHub issue and builds it end to end without further user input: preflight, claim (assignee + `working` label, so two agents can't grab one issue), task branch, dark execution bounded by the brief and the `.vegastack/dev.md` stop-list, the changelog entry per the project's `changelog:` knob, tests, dev-review's skill-scan guard where the project's `skill-scan:` knob names a root, independent review (subagent by default, cross-agent by knob), and exactly one evidence comment in the issue before handing back with `for-operator`. Creates no PR and merges nothing — that is `dev-ship`, on the user's word.

The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-implement --global
```

Or the whole dev workflow at once:

```sh
npx @vegastack/skills add --group dev-skills --global
```

`--global` installs into your home directory, where the skill is available in every project; drop it for a project-local install. See the [installer README](../../../packages/cli/README.md) for all flags.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: preflight, claim, dark-mode bounds, verify, review modes, evidence contract, corrections loop |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [scripts/lib/gh.mjs](scripts/lib/gh.mjs) | Shared guard plumbing: gh invocation, marker parsing, result contract |
| [scripts/preflight.mjs](scripts/preflight.mjs) | Deterministic preflight guard (exit 2 blocks) |
| [scripts/evidence-check.mjs](scripts/evidence-check.mjs) | Evidence-comment shape guard; with `--issue`, also blocks when plan checkboxes lag the ledger's completed tasks |
| [scripts/reclaim.mjs](scripts/reclaim.mjs) | Operator-run release of an orphaned claim (`working` → `ready`, unassign; refuses a still-fresh ledger unless `--force`) |
| [scripts/evidence-upload.mjs](scripts/evidence-upload.mjs) | Uploads one screenshot to the shared evidence repo through the contents API: dry-run by default, `--write` sends, payload on stdin and never printed, one retry on 409 |
| [references/ledger-and-resume.md](references/ledger-and-resume.md) | Ledger usage and the resume protocol |
| [references/changelog-and-chronicle.md](references/changelog-and-chronicle.md) | Per-knob changelog mechanics, the entry's first-line rule, and the chronicle hand-off |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Evergreen waiver: this skill makes no volatile claims |
| [refresh/sources.json](refresh/sources.json) | Deliberately empty source registry behind the evergreen waiver |
| `tests/` | Bun tests and the trigger-query fixture (never packaged) |

## Behavior contract

Preflight fails closed: no recorded approval comment, open blockers, another claimant, or a material open decision in the brief each stop the run with a named reason. Dark mode means no progress pings and no questions — routine choices are the implementer's, stop-list hits end dark mode with one `needs-operator` comment. Tests are never weakened to pass. The evidence comment is edited in place across correction rounds so the current truth is always in one place.
