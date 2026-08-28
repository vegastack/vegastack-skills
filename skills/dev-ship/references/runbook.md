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

The ship word authorizes: merge the task branch onto the default branch locally per the `merge:` knob, push, done — no PR object. Everything else is unchanged: the issue must be `for-operator` with its evidence comment, guards run, the changelog entry must exist, and `Closes #<n>` goes in the merge commit message so the issue closes. Branch protection that blocks direct pushes breaks this mode — dev-setup checks at setup time; if it bites later, tell the operator rather than working around it.

## Bot PRs (Renovate, Dependabot, …)

A bot PR has no issue, no brief, no evidence comment — and merging it is still shipping. Green checks qualify it; only the operator's explicit word merges it, per PR or per an explicitly named batch ("merge this Renovate batch"). No standing approval exists: a knob, a schedule, or past practice never merges a bot PR. Red-flag updates (majors, security advisories) get named to the operator before their merge word is acted on.

## Rollback and hotfix

- Rollback is never a force-push or history rewrite. Follow the Ship section's rollback line — the shape is always roll-forward: revert or fix on the default branch through the normal flow, release/deploy the good state as a new version.
- A hotfix is a normal issue at higher priority: brief (short is fine), approval, implement, evidence, ship. Urgency compresses the words, never removes them.

## Guard failure at ship time

A local `guard:` failure (missing changelog entry, tag/version mismatch) means the branch or release prep is incomplete: route it to dev-implement's corrections loop, get the evidence comment updated, then resume at the failed step. Never edit release artifacts inline just to get past a guard.
