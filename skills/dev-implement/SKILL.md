---
name: dev-implement
description: Implement an approved GitHub issue end to end without further user input. Use when given an issue to build - "do issue #12", "implement" plus an issue URL, "pick up the next ready issue", "go dark on #34" - or when returning to apply corrections the user left on a for-you issue. Runs preflight, claims the issue, builds on a task branch, tests, gets independent review, and posts one evidence comment in the issue. Not for writing or approving issues (dev-intake), not for creating PRs or merging (dev-ship).
---

# dev-implement

One issue, one session, end to end: preflight → claim → build dark → verify → review → evidence in the issue → stop. The user reads the result in the issue on their own time; nothing here creates a PR or merges — those are `dev-ship`, on the user's word.

Nearest neighbor: `dev-intake` writes the brief this skill executes; if the issue turns out to need decisions, that's intake work — hand it back via `needs-you`, don't guess. `.vegastack/dev.md` missing → run `dev-setup` first. Read dev.md before anything; its knobs (review, ui-evidence, tests, branch, stop-list) govern this whole skill.

## Preflight — all must hold, or stop and say which failed

- `gh auth status` works and the issue's repo matches dev.md.
- The issue is open, labeled `ready`, and carries the recorded approval comment (`Approved by … : "…"`). A label without the comment is not approval.
- No open blockers (issue dependencies) and no other assignee — an assigned or `working` issue belongs to someone else.
- Read the complete brief, plus parent issue and milestone for context. If the brief leaves a material decision open, do not start: label `needs-you`, comment the smallest question that unblocks it, stop.

## Claim and branch

Assign yourself, swap `ready` → `working`. Branch from the default branch: `<type>/<issue-number>-<short-slug>` (type from dev.md: feat, fix, docs, chore, refactor).

## Build — dark

No progress updates, no questions. Decide routine things yourself: file layout, helpers, fixtures, and root-cause fixes inside the issue's change areas. The brief's out-of-scope section and the dev.md stop-list bound you; hitting a stop condition (scope change, new dependency, spending, destructive/production action, unresolvable blocker) ends dark mode — post one `needs-you` comment stating the smallest decision needed with your recommendation, and stop.

Honesty over green: a failing test gets fixed at the root or reported as failing. Weakening a test, an assertion, or acceptance to pass is a cover-up, and cover-ups surface at review with interest.

## Verify

- Run the tests dev.md requires (`tests: required` → every changed behavior has a test that runs and passes; `logic-only` → content/config tweaks may skip). Record commands and results for the evidence comment.
- UI changed and `ui-evidence: playwright` → capture screenshots of the key states and flows, push them to the evidence repo (dev.md `evidence-repo`) under `<repo>/<issue-number>/`, and link them. Links, not embeds — private-repo images don't render inline in issues.

## Independent review — per the dev.md knob

- `subagent` (default): spawn a fresh reviewer subagent that gets the diff, the brief, and dev.md — and no memory of writing the code. It checks: does the change do what the brief says, does anything break, are the tests real?
- `cross-agent` (or `cross-agent-risky` on a `risky` issue): push the branch, add to the evidence comment "awaiting cross-agent review", keep `working`, and tell the user which agent to point at the issue. The reviewing session posts findings on the issue; you apply them.
- Fix real findings and rerun affected checks. Disagree with a finding → say why in the evidence comment rather than silently skipping it.

## The evidence comment — exactly one, edited in place

```
## Result
**Done:** what changed, in behavior terms
**Tests:** <command> → <result summary>
**Review:** <mode> — <findings fixed / none / disputed with reason>
**UI evidence:** <links>            (when applicable)
**Not done / limits:** the honest list
Branch: <name> @ <short-sha>
```

Post it, swap `working` → `for-you`, unassign nothing, stop. Later corrections update this same comment — a stack of stale result comments hides the current truth.

## Corrections loop

The user's comments on a `for-you` issue are the new frontier: apply them, re-verify what they touch, update the evidence comment, back to `for-you`. Their corrections never need re-approval ceremony unless they change scope — then it's `needs-you` and dev-intake's recording rule.
