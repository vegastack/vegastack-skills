---
"@vegastack/skills": minor
---

The dev workflow now treats the ledger's edit time as a claim's heartbeat, flags a working issue as possibly-orphaned when it goes silent, and blocks a hand-back whose plan checkboxes lag the ledger.

- dev-status measures ledger movement in hours, not whole days, and reports `possiblyOrphaned` for a working issue whose ledger has been silent past `--orphan-hours` (default 6) or was never written — the claim's heartbeat has stopped; a session that keeps checkpointing, even for days, never trips it.
- The board's old "Stale" line becomes "Possibly orphaned", surfaced with the `reclaim.mjs` command inline; it stays a fact for the operator, never an automatic reset.
- New `dev-implement/scripts/reclaim.mjs` releases an orphaned claim (`working` → `ready`, unassign) after a read-verify, and refuses a ledger still fresh under the orphan threshold unless `--force` — the operator runs it; a takeover still needs their explicit handover.
- `evidence-check.mjs --issue <n>` now blocks hand-back when the ledger's completed tasks outnumber the plan comment's checked `[x]` boxes, so the operator's progress view can no longer silently lag the work.
- dev-implement names the one-session-one-issue model and promotes ticking the plan checkbox from a parenthetical to a first-class checkpoint step (a second write, to the comment the operator reads).
