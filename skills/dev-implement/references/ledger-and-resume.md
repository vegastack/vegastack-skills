# The ledger and the resume protocol

How dev-implement uses the ledger comment (format: the `dev-setup` skill's `references/conventions.md`). The ledger is the build's recovery map and the operator's live progress view — the one artifact that makes a dead or compacted session cheap instead of catastrophic.

## When to write

Create the ledger comment as the session's **first write after claiming** — before any code — with just the marker and heading. Then checkpoint, editing in place:

- **After each plan task completes:** `Task <N>: complete (commits <base7>..<head7>[, review clean | K parked])` — and tick the matching checkbox in the plan comment in the same pass. Record the task's base sha before starting it, so the range is exact.
- **After each review fix round:** `Task <N>: fix round <R>/3 (<X> addressed, <Y> open — <one-liners>; commits <a>..<b>)`.
- **At every dark-mode judgment call:** `Ruling: <what> — <why> — cost if wrong: <cost>`. A ruling is any decision the brief/plan didn't make for you that a reviewer or the operator could reasonably question. Rulings are cheap; unrecorded decisions are debt.
- **On findings deferred at review:** `Deferred minor: <one-liner>` · parked findings per the review's adjudication lines.

Never batch checkpoints "for later" — the ledger's value is exactly that a crash between checkpoints loses one task, not the map. Under concurrent edits, last-writer-wins on one comment is accepted (single-operator workflow); note a clobber if you ever see one.

## Resume protocol — what a fresh session reads, and nothing else

A fresh session (post-compaction, post-crash, or an operator-handed takeover of a `working` issue — the handover itself still requires the operator's explicit word) reads, in order:

1. **The brief** (issue description) — the what and bounds.
2. **The plan comment** — the tasks and interfaces.
3. **The ledger** — tasks with a `complete` line are DONE: never re-execute them; a task whose last line is a fix round is mid-loop: resume at the next round; the rulings are decisions already made — don't re-litigate them, surface disagreement instead.
4. **`git log` on the branch** — the commits the ledger names exist even when no context remembers creating them.

**Nothing else.** Not the full issue thread, not review round history, not any transcript — that's context spent re-reading what the ledger already distills. After compaction, trust the ledger and `git log` over your own recollection; a controller that trusts its memory re-executes finished work, the single most expensive failure this protocol exists to prevent.

## Surfacing — rulings never die in the dark

Every `Ruling:` line surfaces in the evidence comment's summary at hand-back, in the order made. The operator reads that list and reverses anything wrong — a ruling that only ever lived in the ledger was a decision made in secret.
