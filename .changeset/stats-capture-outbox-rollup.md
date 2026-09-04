---
'@vegastack/vegafactory': minor
---

Agent runs and sessions are now counted: `vegafactory stats` records one line per run in the org's own control room and prints where the time and money went.

- New `stats` verbs: `stats [--repo|--me|--org|skills] [--since MON-YYYY]` prints the tables, `stats push` copies the machine-local outbox into the control room (dry run until `--commit`, rebasing and retrying on a concurrent push, one push at a time per machine, and deferring rather than reporting success when any git step fails), `stats rollup` regenerates the per-repo, per-org and per-skill summaries, and `stats record --source <kind>` is what the capture hooks call.
- `stats rollup` reads each touched issue's label timeline through `gh` and writes it beside the summary as `<MON-YYYY>.timeline.json`, which is where lead and cycle time come from; a rollup that cannot reach `gh` keeps the clone's last timeline file and exits 1 naming the reason. Rework rounds are read after each headless run from the issue's review, ledger and hand-back comments, counted once per issue, and reported as `null` — never `0` — for a month in which nothing measured them.
- Capture is deterministic and has no model in the loop: the dispatcher parses each harness's own run output, three new dev-setup hooks cover interactive sessions and skill invocations, and every record is counts and identifiers only — never prompt text, assistant text, tool arguments, or file contents.
- Whether anything is recorded is org policy — `stats:` and `stats-people:` in the control room's `org.md` or a department's `group.md`, with a repo opt-out only under `stats-override: allowed` — and there is no machine-level knob.
