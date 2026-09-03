---
'@vegastack/vegafactory': minor
---

dev-setup now ships a four-hook package it writes to `.vegastack/hooks/` and wires per harness on your yes.

- An environment-aware ship guard that reads your `## Environments` policy lines, the `gates:` knob and the `## Ship` `ask:` lines and asks before a merge, tag, publish or production deploy.
- A SessionStart hook that opens each session with your queue and the worktree this checkout holds.
- A Stop heartbeat that asks a session holding a `working` claim to checkpoint its ledger.
- The decision nudge, now a packaged Node file rather than an inline shell recipe that needed `jq`.
