---
name: dev-status
description: The operator's board — whose move is it, across every issue in the dev workflow. Use when asked "status", "what needs me", "where are we", "what's in flight", "anything stale?", "what should I look at next", or for a board overview of needs-operator / needs-plan / ready / working / for-operator issues. Not for the project's history ("catch me up" is dev-chronicle), implementing or reviewing anything, or repo bootstrap (dev-setup).
---

# dev-status

One question, answered from deterministic data: **whose move is it?** The bundled script gathers; this skill orders and narrates — it never invents state, and an unverifiable board is reported as exactly that.

Nearest neighbors: `dev-chronicle` answers "how did we get here"; this skill answers "what needs whom right now".

## Gather

```
node <path-to-this-skill>/scripts/status.mjs --orphan-hours 6 --json
```

Read-only; it returns the board (open issues per state label with age, scope, risky), task progress `x/y` from plan-comment checkboxes, ledger movement for `working` issues in hours (`possiblyOrphaned` = the ledger has been silent past `--orphan-hours`, default 6, or was never written — the claim's heartbeat has stopped), open PRs with check state, pending unrecorded `Decision:` proposals, and the last chronicle entry. Exit 2 = cannot verify (offline, unauthenticated) — report the gap plainly and stop; never render a guessed board.

## Render — names, never bare numbers

```markdown
## Status — <repo> · DD-MM

Needs you (N):
- <linked title> — <state> <age>d: <one line: what it waits for and the word needed>
Waiting on plan (N): - <linked title> — needs-plan <age>d
Ready to build (N): - <linked title> — <scope>
In flight (N): - <linked title> — working, task <x>/<y>, ledger moved <n>h ago
Possibly orphaned (N): - <linked title> — working <age>d, ledger silent <n>h → heartbeat stopped; check, resume, or reclaim (`reclaim.mjs --issue <n>`)
Open PRs (N): - <linked title> — checks <green|pending-or-red|no-checks>
Pending decisions (N): "<gist-plain>" (<linked issue>) — records at that issue's merge
Last chronicle chapter: <date> — <title-plain>
Next: <the single most valuable operator action, and why>
```

- **Needs you** first (for-operator + needs-operator merged, oldest first) — it's the operator's queue; everything else is context.
- Sections with zero entries are omitted, not rendered empty. A completely quiet board is one line: "Nothing needs you — <n> issues ready for agents, nothing in flight."
- `risky` issues get their flag shown inline wherever they appear.
- **Next** is one line, chosen not computed-looking: the action that unblocks the most (a plan approval blocking several ready issues beats a lone review).
- **Possibly orphaned** is the ledger heartbeat gone silent past the orphan window (or never started) — likely a dead session, not certainly one. Surface it with the `reclaim.mjs` command inline; the operator decides (check the session, hand it to a resume, or release the claim). A long-running task that keeps checkpointing never lands here.
- <linked title> means a markdown link this report builds around the issue/PR title and its URL; numbers ride inside the link, never stand alone. That governs the references the board itself makes.
- `<title-plain>` / `<gist-plain>` are the script's `titlePlain` / `gistPlain` fields — text quoted from elsewhere (a chronicle title, a decision gist) may arrive carrying markdown links, and raw bracket-and-parenthesis markup means nothing in a terminal, so it is quoted with the markup removed rather than relinked.

## Honesty rules

Data comes only from the script; ordering, the wait-reason one-liners, and Next are the skill's judgment — clearly judgment, never dressed as data. A possibly-orphaned `working` issue is a fact to surface, not an accusation — the ledger heartbeat went silent, which is likely but not certainly a dead session: "check, resume, or reclaim" is the operator's call (a takeover still needs their explicit handover, and `reclaim.mjs` is theirs to run, per dev-implement). Close with the plain-language summary only when invoked as part of a larger run; standalone, the report IS the summary.
