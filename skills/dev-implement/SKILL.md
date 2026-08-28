---
name: dev-implement
description: Implement an approved GitHub issue end to end without further user input. Use when given an issue to build - "do issue 12", "implement" plus an issue URL or number, "pick up the next ready issue", "go dark on" an issue - when returning to apply corrections the user left on a for-operator issue, or when the user directly asks in chat for a quick fix or small change. Runs preflight, claims the issue, builds on a task branch, tests, gets independent review, and posts one evidence comment in the issue. Not for writing or approving issues (dev-intake), not for creating PRs or merging (dev-ship).
---

# dev-implement

One issue, one session, end to end: preflight → claim → build dark → verify → review → evidence in the issue → stop. The user reads the result in the issue on their own time; nothing here creates a PR or merges — those are `dev-ship`, on the user's word.

Nearest neighbor: `dev-intake` writes the brief this skill executes; if the issue turns out to need decisions, that's intake work — hand it back via `needs-operator`, don't guess. `.vegastack/dev.md` missing → run `dev-setup` first. Read dev.md before anything; its knobs (review, ui-evidence, tests, branch, stop-list) govern this whole skill, and when the issue touches stack surfaces (schema, auth, hosting, services, jobs) its `## Architecture` section governs those choices the way the knobs govern process.

## Direct requests

The gates exist to stop agent-invented authority, never to slow the user down. When the user directly asks in chat for a change ("fix this typo", "bump that timeout"), their words are the approval — do it, verify it, and report; no issue required. Branch as `<type>/<slug>` (no issue segment); the changelog rule below applies unchanged when the change is behavior-changing; shipping still goes through dev-ship's words, with the chat request standing in for the approval and the report for the evidence comment. Offer to record an issue when the change is material enough that its brief or evidence will matter later. Everything below is the path for issue-driven work.

## Preflight — all must hold, or stop and say which failed

- Run the deterministic guard first: `node <path-to-this-skill>/scripts/preflight.mjs --issue <n> --json` — exit 2 stops you with its reasons (approval marker, scope label, plan approval on full-plan, Assumptions section, blockers, assignee, repo match). The judgment checks below are yours on top.
- `gh auth status` works and the issue's repo matches dev.md.
- The issue is open, labeled `ready`, and carries the recorded approval comment (`Approved by … : "…"`). A label without the comment is not approval.
- No open blockers (issue dependencies) and no other assignee — an assigned or `working` issue belongs to someone else. A claim from a dead session is released only by the user: take over a `working` issue only when they explicitly hand it to you.
- Read the complete brief, plus parent issue and milestone for context. If the brief leaves a material decision open — including an unresolved Assumptions entry — do not start: label `needs-operator`, comment the smallest question that unblocks it, stop.
- Re-verify the brief against reality before coding: its cited touch points against the current code (things drift between approval and execution), and volatile dependency claims when stale or version-sensitive (per `dev-architect`'s verify protocol). Reality contradicting the brief is a stop — label `needs-operator` with the discrepancy; an approved brief is never a license to improvise past what's actually there.

## Claim and branch

Assign yourself, swap `ready` → `working`. Branch from the default branch per dev.md's `branch:` knob — the knob is the only source of the pattern and its type list.

## Build — dark

No progress updates, no questions. A spike the brief flagged runs first — its result opens the evidence comment and shapes the rest of the build. Decide routine things yourself: file layout, helpers, fixtures, and root-cause fixes inside the issue's change areas. A structural choice mid-build — a new dependency, table, or service — checks `dev-architect`'s trigger discipline first; a moving part with no named trigger is a stop condition, not a judgment call. The brief's out-of-scope section and the dev.md stop-list bound you; hitting a stop condition (scope change, new dependency, spending, destructive/production action, unresolvable blocker) ends dark mode — post one `needs-operator` comment stating the smallest decision needed with your recommendation, and stop.

Honesty over green: a failing test gets fixed at the root or reported as failing. Weakening a test, an assertion, or acceptance to pass is a cover-up, and cover-ups surface at review with interest.

## Changelog — before hand-back

Every behavior-changing branch carries its changelog entry per dev.md's `changelog:` knob; a ship-time guard catches misses, but don't rely on it. `changesets` → write `.changeset/<slug>.md` directly (frontmatter `"<package-name>": <bump>` from the brief's version-impact line, plus a one-paragraph summary — the changeset CLI prompt is interactive, never invoke it here). `keep-a-changelog` / `pubspec+changelog` → one bullet under `## [Unreleased]` (Added/Changed/Fixed/Removed subsection as fits); no CHANGELOG.md yet → create it in the same branch with the skeleton (`# Changelog` + `## [Unreleased]`). `none` → skip. Docs the brief names as affected get updated in the same branch.

## Verify

- Run the tests dev.md requires (`tests: required` → every changed behavior has a test that runs and passes; `logic-only` → content/config tweaks may skip). Record commands and results for the evidence comment.
- A `risky` issue gets focused security, failure, and recovery checks on top of the required tests.
- When dev.md has a `## Verify` runbook, follow it — run the app and smoke-check the flows it names; that live result belongs in the evidence comment alongside the test output. Verify is pre-merge only; post-release checks live in `## Ship` and belong to dev-ship.
- UI changed and `ui-evidence: playwright` → capture screenshots of the key states and flows and upload them to the shared evidence repo (dev.md `evidence-repo`) under `<this-repo-name>/<issue-number>/<timestamp>-<name>.png` — via the contents API so the repo is never cloned: `base64 < <file> | tr -d '\n' | gh api -X PUT repos/<evidence-repo>/contents/<path> -f message="evidence #<issue>" -F content=@-` (piped stdin, so large screenshots never hit argv limits; timestamped names keep re-captures from colliding; a 409 from a concurrent upload just means retry). Link them in the evidence comment — links, not embeds; private-repo images don't render inline in issues. Evidence repo missing or unreachable → name the local file paths and say so; the hand-back never blocks on it.
- dev.md's Ship or Verify section is an empty TODO while release/deploy machinery visibly exists → finish this issue normally, then suggest re-running dev-setup so detection can fill it.

## Independent review — per the dev.md knob

- `subagent` (default): spawn a fresh reviewer subagent that gets the diff, the brief, and dev.md — and no memory of writing the code. It checks: does the change do what the brief says, does anything break, are the tests real? In a harness without subagents, do a separate fresh-eyes review pass against the brief and label it a self-review in the evidence comment; prefer cross-agent there for `risky` work.
- `cross-agent` (or `cross-agent-risky` on a `risky` issue): push the branch, add to the evidence comment "awaiting cross-agent review", keep `working`, and tell the user which agent to point at the issue. The reviewing session posts findings on the issue; you apply them.
- Fix real findings and rerun affected checks. Disagree with a finding → say why in the evidence comment rather than silently skipping it.

## The evidence comment — exactly one, edited in place

```
## Result
**Done:** what changed, in behavior terms
**Tests:** <command> → <result summary>
**Review:** <mode> — <findings fixed / none / disputed with reason>
**Changelog:** <entry added / none, with reason>     (when the knob is not `none`)
**UI evidence:** <links>            (when applicable)
**Decision:** <one line in the register format>     (only a dark-mode choice that passes dev.md's Decisions test — a proposal; dev-ship records it after naming it in the merge confirmation)
**Not done / limits:** the honest list
Branch: <name> @ <short-sha>
```

Before posting, run `node <path-to-this-skill>/scripts/evidence-check.mjs --file <draft> --json` — exit 2 means the shape is incomplete; fix, don't post. Post it, swap `working` → `for-operator`, unassign nothing, stop. Later corrections update this same comment — a stack of stale result comments hides the current truth.

## Corrections loop

The user's comments on a `for-operator` issue are the new frontier: apply them, re-verify what they touch, update the evidence comment, back to `for-operator`. Their corrections never need re-approval ceremony unless they change scope — then it's `needs-operator` and dev-intake's recording rule.
