---
name: dev-ship
description: Create the pull request and merge for a finished issue, each only on the user's explicit word. Use when the user says "make the PR", "open a pull request for #12", "ship it", "merge it", "merge #12", or asks to close out a reviewed issue. Verifies the issue is at for-you with evidence, links the PR to the issue, and squash-merges on the separate merge instruction. Not for implementing issues (dev-implement) or writing and approving them (dev-intake).
---

# dev-ship

Two gates, each one sentence from the user, each spent when used: their words asking for a PR authorize the PR and nothing more; their words asking to merge authorize the merge. With `gates: 2` in `.vegastack/dev.md`, one "ship it" covers both — that's the only case where they combine. Passing checks, PR permissions, and the calendar authorize nothing by themselves.

Nearest neighbor: `dev-implement` produces the `for-you` issue with its evidence comment; ship packages and lands it. Corrections found here go back through implement's corrections loop.

## Gate 1 — the PR

On the user's PR instruction:

- Verify the issue is at `for-you` with the evidence comment present, and the branch is pushed. Not there yet → say what's missing instead of creating a premature PR.
- `gh pr create` from the task branch: title from the issue, body is `Closes #<n>` plus a link to the evidence comment — the issue holds the report; the PR links it rather than duplicating it.
- No draft PRs unless the user asks for one.
- If required checks fail on the PR, that's implement work: hand the failures to the corrections loop, update the evidence comment, and tell the user.

## Gate 2 — the merge

On the user's separate merge instruction:

- Re-check that the PR head is still the revision the evidence comment names and checks are green — a branch that moved since review gets re-verified before it lands.
- Merge per the dev.md `merge` knob (default `gh pr merge --squash`). `Closes #<n>` closes the issue; confirm both happened.
- If the issue recorded a material decision, append its one dated line to `docs/decisions.md` now — the register is append-only and this is its moment.

## Report

One short confirmation each gate: what was created or merged, the link, and anything that still needs the user (failing check, moved head, missing evidence). When a gate's condition isn't met, the answer is what's missing — the gate itself never gets skipped to be helpful.
