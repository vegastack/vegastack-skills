# Using the ledger

The ledger comment's format, line vocabulary, and the resume read-order (brief → plan → ledger → `git log`, nothing else) live in the `dev-setup` skill's `references/conventions.md` — this file owns only how dev-implement **uses** them. The ledger is the build's recovery map and the operator's live progress view.

## When to checkpoint

Create the ledger comment as the session's **first write after claiming** — before any code — with just the marker and heading. Then checkpoint, editing in place:

- **After each plan task completes** — and tick the matching checkbox in the plan comment in the same pass. Record the task's base sha *before* starting it, so the `complete` line's commit range is exact.
- **After each review fix round**, with the addressed/open counts.
- **At every dark-mode judgment call.** A ruling is any decision the brief/plan didn't make for you that a reviewer or the operator could reasonably question. Rulings are cheap; unrecorded decisions are debt.
- **On findings deferred or parked at review**, per dev-review's adjudication lines.

Never batch checkpoints "for later" — the ledger's value is exactly that a crash between checkpoints loses one task, not the map. Under concurrent edits, last-writer-wins on one comment is accepted (single-operator workflow); note a clobber if you ever see one.

## Resuming — dev-implement's additions to the protocol

- The takeover of a `working` issue requires the operator's explicit handover word; the protocol never makes claiming automatic.
- Corroborate, don't re-verify: the commits the ledger names should exist in `git log` — reconcile the ranges; a mismatch is a `handback`, not a guess.
- A task whose last line is a fix round is mid-loop — resume at the next round with the open findings; a later `complete` line supersedes earlier rounds.
- Recorded rulings bind the resumed session: build on them, and surface disagreement in the evidence comment instead of re-litigating.
- Re-executing work the ledger marks complete is the single most expensive failure this protocol exists to prevent — after compaction, trust the ledger and `git log` over recollection.

## Surfacing — rulings never die in the dark

Every `Ruling:` line lands on the evidence comment's `**Review:**` line at hand-back, in the order made. The operator reads that list and reverses anything wrong — a ruling that only ever lived in the ledger was a decision made in secret.
