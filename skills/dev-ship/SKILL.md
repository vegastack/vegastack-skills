---
name: dev-ship
description: Create the pull request and merge for a finished issue, each only on the user's explicit word, then run the project's Ship runbook — releases, guards, deploys. Use when the user says "make the PR", "open a pull request" for an issue, "ship it", "merge it", "merge issue 12", "release", "release everything since the last tag", or asks to close out a reviewed issue, merge a bot PR, or roll back a bad release (roll-forward). Verifies the issue is at for-operator with evidence and its changelog entry, links the PR to the issue, merges on the separate merge instruction, and records approved decisions. Not for implementing issues (dev-implement) or writing and approving them (dev-intake).
---

# dev-ship

Gates spent only by the user's words: their words asking for a PR authorize the PR and nothing more; their words asking to merge authorize the merge. The dev.md `gates` knob sets how many actions one word covers — `3` keeps PR and merge as separate words, `2` lets one "ship it" cover both, `1` is direct-to-main (the ship word merges locally and pushes; no PR object, everything else identical). Passing checks, PR permissions, and the calendar authorize nothing by themselves.

Nearest neighbor: `dev-implement` produces the `for-operator` issue with its evidence comment; ship packages and lands it. Corrections found here go back through implement's corrections loop.

## Gate 1 — the PR

On the user's PR instruction:

- Run the deterministic guard first: `node <path-to-this-skill>/scripts/ship-gate.mjs --issue <n> --branch <name> --json` — it re-runs the project check command fresh, verifies evidence-sha vs head (with the Docs-line reconciliation window), the changelog entry, the review verdict, and greps for leftover `[DEBUG-` tags; exit 2 stops you with its reasons, warnings are read-twice signals.
- Verify the issue is at `for-operator` with the evidence comment present, and the branch is pushed. Not there yet → say what's missing instead of creating a premature PR.
- Verify the changelog state matches the evidence comment's `**Changelog:**` line: a behavior-changing branch carries its entry per dev.md's `changelog:` knob (changesets: a `.changeset/*.md` in the diff; keep-a-changelog: the diff adds lines to CHANGELOG.md), while `none` with a reason that holds up (docs-only, test-only) is fine. An unexplained miss → corrections loop, not a PR.
- `gh pr create` from the task branch: title from the issue, body is `Closes #<n>` plus a link to the evidence comment — the issue holds the report; the PR links it rather than duplicating it.
- No draft PRs unless the user asks for one.
- If required checks fail on the PR, that's implement work: hand the failures to the corrections loop, update the evidence comment, and tell the user. Under `gates: 2` the standing ship word holds once checks are green again — unless the fix changed behavior, which goes back to the user (same rule as a merge conflict).
- A direct chat change (dev-implement's no-issue path) ships on the same words: the chat request stands in for the recorded approval, the PR body carries the evidence instead of linking an issue comment, and the changelog rule applies unchanged.
- User corrections left on the PR itself flow through the same corrections loop on the same branch — the PR updates with the push; nothing gets recreated.

With `gates: 1` there is no PR: the same verifications run, then the ship word triggers the merge below directly ([runbook](references/runbook.md) has the mechanics).

## Gate 2 — the merge

On the user's merge instruction:

- Re-check that the PR head is still the revision the evidence comment names and checks are green — a branch that moved since review gets re-verified before it lands.
- Pending `Decision:` lines exist (issue comments, or the evidence comment's `**Decision:**` line) → name them in the merge confirmation — "merging will record: …" — so the operator's word demonstrably covers them; never append on inferred consent. On the word, append each to the register dev.md names (`decisions:` knob) in its `- DD-MM-YYYY (github-username) — …` format; the register is append-only and this is its moment.
- A merge conflict with the default branch is corrections work: update the branch, re-verify what the update touched, and the standing merge instruction holds once checks are green again — unless the update changed behavior, which goes back to the user.
- Merge per the dev.md `merge` knob (default `gh pr merge --squash`; `gates: 1` merges locally per the same knob and pushes). `Closes #<n>` closes the issue; confirm both happened.
- A bot PR (Renovate, Dependabot) has no issue or evidence comment and merging it is still shipping: green checks qualify it, only the operator's explicit word — per PR or per named batch — merges it; majors and security advisories get named before their word is acted on.

## After the merge — the Ship runbook

Merge is not the end when dev.md has a `## Ship` section: follow its steps in order — `auto:` lines you just do, `ask:` lines wait for the operator's word, `guard:` lines are deterministic checks you run locally at their position (their CI copies are the backstop). With `release: per-merge`, the runbook is part of shipping the issue; with `release: on-request`, it runs only when the operator says "release" (covering everything merged since the last one). Report each step's outcome; a failing step — guard included — stops the sequence and goes to the operator, never skipped past. Execution detail, release batching, direct-to-main, bot PRs, and rollback: [runbook](references/runbook.md).

Rollback is never a force-push: follow the Ship section's rollback line — roll forward through the normal flow. A gotcha here (a step that surprised you, an instruction the operator had to repeat) is one proposed line folded into the runbook; a directional gotcha that passes dev.md's Decisions test is a register proposal instead, on the user's yes.

## Report

One short confirmation each gate: what was created or merged, the link, decisions recorded, and anything that still needs the user (failing check, failing guard, moved head, missing evidence or changelog entry). When a gate's condition isn't met, the answer is what's missing — the gate itself never gets skipped to be helpful.
