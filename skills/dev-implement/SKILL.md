---
name: dev-implement
description: Implement an approved GitHub issue end to end without further user input. Use when given an issue to build — "do issue 12", "implement" plus an issue URL or number, "pick up the next ready issue", "go dark on" an issue — when resuming a dead or compacted session's working issue the operator hands over, when returning to apply corrections the user left on a for-operator issue, or when the user directly asks in chat for a small fix. Not for writing or approving issues (dev-intake), planning them (dev-plan), reviewing finished work (dev-review), or creating PRs and merging (dev-ship).
---

# dev-implement

One issue, one session, end to end: preflight → claim → build dark → verify → review → evidence → stop. The operator reads the result in the issue on their own time; nothing here creates a PR or merges — those are `dev-ship`, on the operator's word. Artifact formats follow the `dev-setup` skill's `references/conventions.md`; the ledger discipline lives in [ledger-and-resume](references/ledger-and-resume.md).

Nearest neighbors: `dev-plan` writes the plan this skill executes task by task; `dev-review` judges the result; issues that turn out to need decisions go back through `needs-operator`, never guessed. `.vegastack/dev.md` missing → run `dev-setup` first. Read dev.md before anything; its knobs govern this skill, and the `## Architecture` section governs stack-touching choices.

## Direct requests — trivial only, tightly bounded

When the operator directly asks in chat for a change, their words are the approval — build, verify, report; no issue needed. The bound is **trivial**: the moment the work exceeds it — a behavior change beyond the asked words, a new dependency, more than 1–2 files — stop and route to `dev-intake` instead of continuing. Branch `<type>/<slug>`; the changelog and chronicle rules apply unchanged when behavior changes; shipping still goes through dev-ship's words.

## Preflight — all must hold, or stop and say which failed

- Run the deterministic guard first: `node <path-to-this-skill>/scripts/preflight.mjs --issue <n> --json` — exit 2 stops you with its reasons (approval marker, scope label, plan approval on full-plan, Assumptions section, blockers, assignee, repo match).
- Then the judgment checks: re-verify the brief's touch points against the current code (things drift between approval and execution) — including the version-impact line; volatile dependency claims per `dev-architect`'s verify protocol; a full-plan issue's plan still matches reality. Reality contradicting brief or plan is a stop — one `handback` comment with the discrepancy, `needs-operator`.
- Resuming a dead session's issue: the operator's explicit handover is required; then follow the resume protocol in [ledger-and-resume](references/ledger-and-resume.md) — brief → plan → ledger → `git log`, nothing else.

## Claim

Assign yourself, swap `ready` → `working`, branch from the default branch per dev.md's `branch:` knob, and **create the ledger comment as your first write**. Record each task's base sha before starting it.

## Build — dark, test-first, checkpointed

No progress updates, no questions. Work the plan task by task:

- **Red before green.** Write the failing test first — at the seams the brief names, never elsewhere — watch it fail for the stated reason, implement the minimal code, watch it pass. One slice at a time. The tests-are-real rubric (implementation-coupled, tautological, horizontal-sliced — defined in `dev-review`'s dispatch prompts) applies to your own tests before a reviewer ever sees them.
- **Checkpoint the ledger** after every task (tick the plan checkbox in the same pass) and at every ruling, per the reference.
- **Transitory artifacts** — subagent reports, scratch diffs, drafts — live in `.vegastack/.tmp/<issue>-<slug>/`; subagents write full output to files there and return short status.
- Decide routine things yourself and ledger the rulings. A structural choice mid-build — a new dependency, table, or service — checks `dev-architect`'s trigger discipline first; a moving part with no named trigger is a stop condition.
- **The scope ratchet is a stop condition:** work revealed bigger than the issue's scope class (or plainly exceeding one session) → one `handback` comment proposing the upgrade or split (dev-plan's ratchet rules), `needs-operator`, stop.
- The brief's out-of-scope section and the dev.md stop-list bound you; hitting any stop condition ends dark mode with one `handback` comment stating the smallest decision needed, your recommendation attached.

Honesty over green: a failing test gets fixed at the root or reported as failing. Weakening a test, an assertion, or acceptance to pass is a cover-up, and cover-ups surface at review with interest.

## Changelog and chronicle — before hand-back

Every behavior-changing branch carries its changelog entry per dev.md's `changelog:` knob (`changesets` → write `.changeset/<slug>.md` directly, never the interactive CLI; `keep-a-changelog` → one bullet under `## [Unreleased]`; `none` → skip) **and**, when dev.md says `chronicle: on`, its story entry prepended to `.vegastack/chronicle.md` (format: the `dev-chronicle` skill) — both on the branch, landing atomically with the merge. Docs the brief names as affected get updated in the same branch.

## Verify — the gate function

Before claiming ANY status: **identify** the command that proves it → **run** it fresh and complete → **read** the full output and exit code → only then claim, with the evidence. Tests pass ⇒ a fresh run with 0 failures — never "should pass", never a previous run. Build succeeds ⇒ exit 0. Bug fixed ⇒ the original symptom re-tested. A subagent finished ⇒ you inspected its diff or report file — never its say-so.

- Run what dev.md's `tests:` knob requires; a `risky` issue gets focused security, failure, and recovery checks on top. When dev.md has a `## Verify` runbook, run the app and smoke-check the flows it names.
- UI changed and `ui-evidence: playwright` → capture and upload screenshots to the shared evidence repo per the dev.md `evidence-repo` knob (contents API, timestamped names); link them, never embed. Evidence repo unreachable → name local paths and say so.
- dev.md's Ship or Verify section is an empty TODO next to visible machinery → finish normally, then suggest re-running dev-setup.

## Independent review — invoke dev-review

Run the `dev-review` skill per dev.md's `review:` knob — fresh subagent axes by default, cross-agent (Codex↔Claude, announced to the operator) per the knob's mapping; it owns the axes, severities, review comment, bounded fix loop, and adjudication rules. Apply its findings through its loop and re-run the affected checks. Disagree with a finding → adjudicate openly per its rules, never silently skip. In a harness without subagents, run dev-review's axis briefs yourself as a labeled self-review.

## The evidence comment — exactly one, edited in place

```markdown
<!-- vsk:v1 type=evidence rev=1 branch=<name> sha=<sha7> -->
## Result (v1)
**Done:** what changed, in behavior terms
**Tests:** <command> → <fresh result>
**Review:** <mode> — <verdict; adjudications and rulings surfaced, in order made>
**Changelog:** <entry added / none, with reason>
**Docs:** brief v<n>, plan v<n> — in sync | unchanged since approval
**UI evidence:** <links>            (when applicable)
**Decision:** <register-format proposals>   (only choices passing dev.md's Decisions test)
**Not done / limits:** the honest list
Branch: <name> @ <sha7>
```

Run `node <path-to-this-skill>/scripts/evidence-check.mjs --file <draft> --json` before posting — exit 2 means the shape is incomplete; fix, don't post. Post it, swap `working` → `for-operator`, stop, and close with the plain-language summary: what was built, which paths were taken, every ruling made, what's worth the operator double-checking.

## Corrections loop — code and docs move together

The operator's comments on a `for-operator` issue are the new frontier. Applying a correction is **one pass**: the code change + the affected brief/plan sections edited to match (revision markers bumped, `Revisions:` line appended) + a ledger line + the evidence comment updated in place — its `sha` to the new head and its `Docs:` line to the new revisions. Re-verify what the correction touched. An operator dismissal of a review finding gets appended to `.vegastack/review-known-patterns.md` with its mandatory "Still flag if:" clause. Then back to `for-operator`. Corrections never need re-approval ceremony unless they change scope — that's `needs-operator` and intake's recording rule.
