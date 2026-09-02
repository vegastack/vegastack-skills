---
name: dev-plan
description: Write the implementation plan for an approved issue before any code exists. Use when asked to "plan issue 12", "write the plan for" a feature or issue, "plan this before building", when picking up an issue labeled needs-plan, when an approved brief needs its technical approach worked out, or when dev-intake requests the inline plan for a quick-build issue. Not for writing or approving the brief itself (dev-intake), not for executing an approved plan (dev-implement), not for architecture stack advice (dev-architect — this skill consults it while planning).
---

# dev-plan

The planning stage: an approved brief goes in, an operator-approved plan comes out, and only then does code exist. Plans are written against the repo **as it is now** — a separate session from intake for `full-plan` issues, because code drifts between brief approval and build.

Nearest neighbors: `dev-intake` owns the brief and its approval mechanics — this skill owns the how; `dev-implement` executes what this produces, task by task.

## Every run

1. Read `.vegastack/dev.md` and the issue: brief (description), recorded brief approval (`type=approval` marker), scope label. Full-plan issues arrive labeled `needs-plan`; anything else at this door is either intake's inline request (below) or a misroute — say so.
2. **Re-ground.** Open the brief's touch points in the current code; verify the flow, names, and shapes the plan will build on. A brief claim that no longer matches reality goes back to the operator (`handback` comment, `needs-operator`) — never plan on top of drift.
3. Stack-bearing choices (schema, hosting, services, jobs, auth) check `dev-architect` — its verify protocol governs platform claims, and no plan re-proposes a recorded rejection.

## The questionnaire

Numbered rounds over the full frontier (every open question whose prerequisites are settled), each question carrying a recommended answer so the operator can reply "all recommended":

1. **Approaches** — 2–3 candidates with the trade-off that matters and one recommendation. Never a single option.
2. **System design** — schema, interfaces, migration shape, failure modes; what breaks at the edges.
3. **Risk** — blast radius, what a rollback looks like, what should stop a dark run beyond the standing stop-list.
4. **Brief challenge** — anything planning revealed the brief missed or got wrong goes back to the operator as a question, never silently absorbed into the plan.

A vague or self-contradicting answer gets pushback with concrete options — simple words, a mermaid or ASCII sketch in the issue when a picture beats prose (conventions' collaboration rule).

## The plan

Post one comment per [plan-format](references/plan-format.md): Goal · Approach (alternatives named) · Constraints · ordered `- [ ]` tasks, each with exact Files, an Interfaces block (consumes/produces with exact signatures), and Steps that put the failing test before the code. Before posting:

- Self-review: every brief requirement maps to a task; names and types are consistent across tasks; no banned placeholders (the list lives in plan-format).
- Run this skill's plan-lint: `node <path-to-this-skill>/scripts/plan-lint.mjs --file <draft> --json`; exit 2 = fix before posting (placeholders and structural gaps block).

Checkboxes belong to the implement session — never pre-tick them.

## Labels and approval

Post the plan → flip to `needs-operator`. On the operator's "plan approved": record the approval marker comment per conventions with `scope=plan`, quoting their words in its operator-identity format, flip to `ready`, stop — building is dev-implement's.

## The ratchet — one home, this file

- **Upgrade (any time, no permission needed to propose):** planning reveals the work is bigger than its scope label — a quick-build that needs real design, an issue that is actually several deliverables. Stop, post one `handback` comment proposing the reclassification or the epic split (parent map + sub-issues, each classified fresh), `needs-operator`. Never silently plan a monster: a plan approaching GitHub's ~65,536-character comment cap is the slicing telling you it wants to be an epic.
- **Downgrade (operator's yes only):** planning reveals the work is trivial — propose skipping to `ready` with the brief's inline approach, and wait for the yes.

## Quick-build inline mode

Invoked from inside dev-intake's conversation, after the brief has consensus: same format, proportionally small (a four-item task list is a fine plan), posted as the plan comment alongside the brief. The operator's single approval covers both (`scope=brief+plan`) — no `needs-plan` stop, no second exchange. The re-grounding step collapses to what intake already read; the ratchet still applies.
