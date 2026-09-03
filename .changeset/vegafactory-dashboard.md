---
"@vegastack/vegafactory": minor
"@vegastack/vegafactory-dashboard": minor
---

`vegafactory dashboard` starts a local, read-only web view of the factory — throughput, cost, where human time goes, the board, and the dispatcher — over the control room's own statistics.

- Six views: org overview, repo (the repo's lead time and cycle time per workflow state from `stats rollup`'s own summary, runs and cost per stage, rework and cost per issue), people, skills (invocations, trigger, outcome, cost per invocation), board, dispatcher. Filters by month, repo, group, harness and model, each one a URL you can bookmark or paste into an issue.
- The control-room clone is the source of truth. On start the server builds a derived `bun:sqlite` index at `~/.vegastack/cache/stats.db`, rebuilt whenever a source file changes; the file is disposable and deleting it is always safe.
- Live board data — open issues, pull requests, worktrees, dispatcher health — comes from your own `gh` token and `vegafactory status --json`. When either is unreachable the page still renders from the clone, behind a banner naming what failed and how old the clone is; one repo the board cannot read keeps every other repo's rows on the page.
- People-level numbers stay behind the org's `stats-people` knob: you always see your own row, and anyone else's needs both that knob on and a `lead` role in `people.csv`.
- The app ships as a second package, `@vegastack/vegafactory-dashboard`, fetched at the CLI's own version on first use into `~/.vegastack/dashboard/<version>/`, so the core install stays small. The server binds `127.0.0.1` only and the token never leaves it.
