# Runbook execution

How dev-ship runs a dev.md `## Ship` section and the ship situations the gates themselves don't spell out.

## Line prefixes

- `auto:` — do it, report the outcome.
- `ask:` — stop and wait for the operator's word for that step; the word that opened the gate does not cover an `ask:` line.
- `guard:` — a deterministic check. Run its command locally at this position in the runbook order; the CI copy of the same guard is the backstop and stays authoritative for anything that publishes. A failing guard stops the sequence exactly like a failing `auto:` step.

A failing step stops the runbook at that step: report what failed and what remains unrun, hand the failure to the operator (or to dev-implement's corrections loop when it's code), and never skip ahead. A gotcha — a step that surprised you or an instruction the operator had to repeat — is one proposed line folded into the runbook; if the gotcha is directional rather than operational, it's a decision-register candidate instead (on the user's yes, per dev.md `## Decisions`).

## Release batching (`release: on-request`)

"Release" covers everything merged since the last release. Enumerate it: `git log <last-tag>..HEAD --oneline` (no tags yet → everything since the first commit). Before running the release steps, check completeness — every behavior-changing merge in that range has its changelog entry per the `changelog:` knob. A missing entry is corrections work on a fresh branch, not a reason to hand-write the release record.

## Direct-to-main (`gates: 1`)

The ship word authorizes: merge the task branch onto the default branch locally per the `merge:` knob, push, done — no PR object. Everything else is unchanged: the issue must be `for-operator` with its evidence comment, guards run, the changelog entry must exist. Closing the issue: with `merge: squash`, put `Closes #<n>` in the squash commit message; with any other merge style there is no new commit to carry it — after pushing, close explicitly with `gh issue close <n> --comment "merged to <default> as <sha>"`. Either way, confirm the issue actually closed. Branch protection that blocks direct pushes breaks this mode — dev-setup checks at setup time; if it bites later, tell the operator rather than working around it.

## Decisions under compressed gates

With `gates: 2` or `1`, the ship word arrives before decisions could be named. Pending `Decision:` lines still get their own naming: acknowledge the word, state "merging will record: …", and act on the operator's confirmation — a decision is never covered by a word that didn't name it. This costs one extra exchange only when decisions are pending. A PR closed without merging hands its pending `Decision:` lines back to the operator (they may stand independently of the implementation's fate) — they are never silently dropped.

## Bot PRs (Renovate, Dependabot, …)

A bot PR has no issue, no brief, no evidence comment — and merging it is still shipping. Green checks qualify it; only the operator's explicit word merges it, per PR or per an explicitly named batch ("merge this Renovate batch"). No standing approval exists: a knob, a schedule, or past practice never merges a bot PR. Red-flag updates (majors, security advisories) get named to the operator before their merge word is acted on.

## Rollback and hotfix

- Rollback is never a force-push or history rewrite. Follow the Ship section's rollback line — the shape is always roll-forward: revert or fix on the default branch through the normal flow, release/deploy the good state as a new version.
- A hotfix is a normal issue at higher priority: brief (short is fine), approval, implement, evidence, ship. Urgency compresses the words, never removes them.

## Guard failure at ship time

A local `guard:` failure (missing changelog entry, tag/version mismatch) means the branch or release prep is incomplete: route it to dev-implement's corrections loop, get the evidence comment updated, then resume at the failed step. Never edit release artifacts inline just to get past a guard. `ship-gate.mjs` speaks the same language: exit 0 pass · 1 pass-with-warnings (read them twice, they never block) · 2 blocked with its reasons printed — a 2 routes to corrections exactly like a failing `guard:` line.

## Worktrees at ship time

One feature, one worktree — the full scenario matrix lives in `dev-implement`'s `references/worktrees.md`; what ship owns is the end of it.

- **The gate runs where the branch is.** `ship-gate.mjs` reads `git worktree list --porcelain` and runs its git calls, its dev.md read and the fresh check command in the worktree holding the branch. `--worktree <path>` overrides. A branch no worktree holds and no matching checkout still blocks — that is the fact the old checkout-mismatch block was protecting, and it survives.
- **One PR per feature.** An epic's children merge into the **parent branch**, on the child's own merge word, with no PR of their own: `git switch <parent-branch>` in the parent's worktree, merge the child branch per the `merge:` knob, delete nothing. When every child is done, the parent branch gets one PR to the default branch.
- **After the merge, the directory goes and nothing else.** `worktree.mjs remove --issue <n> --write` removes the checkout when it is clean, pushed, merged and unlocked; it fails closed and reports which of those did not hold. The local branch and the remote branch are separate operator words, on the always-ask list.
- **A parent's worktree survives its children.** It is removed only when the parent's own PR merges.
- **Parked worktrees are pruned, not swept.** `worktree.mjs prune --older-than <window> --write` pushes an unpushed candidate first, proposes only `parked` worktrees past `worktree-retention:`, and keeps every branch. `--force` and branch deletion always take the operator's word.
