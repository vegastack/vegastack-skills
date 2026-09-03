---
"@vegastack/vegafactory": minor
---

The dispatcher lands: `vegafactory dispatch` turns labels and 🚀 reactions on watched repos into headless runs in feature worktrees, `vegafactory service install` runs it as a launchd LaunchAgent or systemd user unit, and `vegafactory status` shows the board, the worktrees and the dispatcher's health.

- `dispatch [--once] [--watch] [--dry-run] [--json] [--config PATH]` — `needs-plan` starts a planning run, unassigned `ready` an implementation run, and a 🚀 from an operator listed in `operators:` a corrections run; dry run unless `--once` or `--watch` is given.
- Every for-operator issue is read on every tick — a reaction never moves an issue's `updated_at`, so no `updated:` window could find a 🚀 on an existing comment — and the handled list is what stops the repeats.
- Runs finish out-of-band: a tick starts its runs and returns, the loop keeps its interval however long a run takes, `maxRuns` is the number of runs a repo may have in flight at once, an issue with a run in flight is refused by name, and `--once` waits for the runs it started before it exits.
- A repo is refused, by name and with the reason, until its own `.vegastack/dev.md` says `dispatch: local` and its ship-guard hook is wired for the harness that would run.
- Runs are logged as JSONL under `~/.vegastack/factory/logs/`; a failed or timed-out run posts a hand-back comment with the redacted last 40 lines and sends the issue back to `needs-operator`.
- `service install|uninstall|status` is dry-run until `--write`, and installs a user-level service that runs as the operator with their own `gh` and harness authentication.
- New profile knob `dispatch: off|local`, and the reaction trigger is written into dev-implement's corrections loop.
