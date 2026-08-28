---
name: dev-status
description: The operator's board — whose move is it, across every issue in the dev workflow. Use when asked "status", "what needs me", "where are we", "what's in flight", "anything stale?", "what should I look at next", or for a board overview of needs-operator / needs-plan / ready / working / for-operator issues. Not for the project's history ("catch me up" is dev-chronicle), implementing or reviewing anything, or repo bootstrap (dev-setup).
---

# dev-status

One question, answered from deterministic data: **whose move is it?** The bundled script gathers; this skill orders and narrates — it never invents state, and an unverifiable board is reported as exactly that.

Nearest neighbors: `dev-chronicle` answers "how did we get here"; this skill answers "what needs whom right now". Formats read via the `dev-setup` skill's `references/conventions.md` markers.

## Gather

```
node <path-to-this-skill>/scripts/status.mjs --stale-days 3 --json
```

Read-only; it returns the board (open issues per state label with age, scope, risky), task progress `x/y` from plan-comment checkboxes, ledger movement for `working` issues (stale = no ledger edit within `--stale-days`, default 3), open PRs with check state, pending unrecorded `Decision:` proposals, and the last chronicle entry. Exit 2 = cannot verify (offline, unauthenticated) — report the gap plainly and stop; never render a guessed board.

## Render — names, never bare numbers

```markdown
## Status — <repo> · DD-MM

Needs you (N):
- <linked title> — <state> <age>d: <one line: what it waits for and the word needed>
Waiting on plan (N): - <linked title> — needs-plan <age>d
Ready to build (N): - <linked title> — <scope>
In flight (N): - <linked title> — working, task <x>/<y>, ledger moved <n>d ago
Stale (N): - <linked title> — working <age>d, ledger silent <n>d → check or reclaim
Open PRs (N): - <linked title> — checks <green|pending-or-red>
Pending decisions (N): "<gist>" (<linked issue>) — records at that issue's merge
Last chronicle chapter: <date> — <title>
Next: <the single most valuable operator action, and why>
```

- **Needs you** first (for-operator + needs-operator merged, oldest first) — it's the operator's queue; everything else is context.
- Sections with zero entries are omitted, not rendered empty. A completely quiet board is one line: "Nothing needs you — <n> issues ready for agents, nothing in flight."
- `risky` issues get their flag shown inline wherever they appear.
- **Next** is one line, chosen not computed-looking: the action that unblocks the most (a plan approval blocking several ready issues beats a lone review).
- <linked title> means a markdown link wrapping the issue/PR title around its URL; numbers ride inside the link, never stand alone.

## Honesty rules

Data comes only from the script; ordering, the wait-reason one-liners, and Next are the skill's judgment — clearly judgment, never dressed as data. A stale `working` issue is a fact to surface, not an accusation: "check or reclaim" is the operator's call (a takeover still needs their explicit handover, per dev-implement). Close with the plain-language summary only when invoked as part of a larger run; standalone, the report IS the summary.
