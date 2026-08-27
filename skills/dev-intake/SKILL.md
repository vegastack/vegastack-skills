---
name: dev-intake
description: Turn ideas, brainstorms, feature requests, or SOW documents into GitHub issues an agent can implement without further questions. Use when asked to "turn this into issues", "create tasks from this SOW", "write up an issue for" a feature or bug, "plan this as issues", "slice this epic", or when the user gives approval on a drafted issue and it needs recording. Produces complete inline build briefs with labels, milestones, and blocker links. Not for implementing issues (dev-implement), creating PRs or merging (dev-ship), or project bootstrap (dev-setup).
---

# dev-intake

Requirements come in as the user's brainstorm, feature thought, or SOW; issues go out complete enough that a fresh agent needs nothing but the URL. Every question gets asked **here** — once implementation starts, dark mode means no questions, so an under-specified issue becomes either an interruption or a guess. This skill exists to make both impossible.

Nearest neighbor: `dev-implement` consumes what this produces — intake writes and gets approval, implement builds. If `.vegastack/dev.md` is missing, run `dev-setup` first, then continue here.

## Ground before you ask

Finding facts is your job, never the user's — and a brief built on unverified facts is a confident mistake waiting for dark mode. The source can be one sentence in chat; thinner material just means the grounding and interview carry more weight. Before the first question:

- **Read the touched code.** Open the actual paths the feature would change: current behavior, existing patterns to reuse, where the new work plugs in. The brief cites these real paths later — a brief naming no files is a sign this step was skipped.
- **Verify dependencies.** Any library, service, or API capability the approach leans on gets checked against current official docs (docs tools or web search), noted with the date. Consult `architect`'s pinned facts for stack questions before re-researching; re-verify a pinned fact older than 60 days; skip lookups for long-stable basics — judgment, not ritual.
- **Cross-check the request** against product docs and current behavior. A contradiction is pushback, never a silent resolution: "you asked for X; the code/docs currently do Y — which wins?" Push back on cost the same way: when a simpler version covers most of the need, name it.
- **Triage every unknown** into exactly three bins: *findable* → find it now, yourself; *only-the-user-knows* → ask, with a recommendation; *only-running-code-can-tell* → flag it as a spike that becomes the issue's first step. Guessing is not a bin.

## The interview

Ask in rounds using your harness's question tool (AskUserQuestion in Claude Code, `request_user_input` in Codex where the mode allows; no tool available → draft with recommended answers marked `TODO confirm` and say so). Each round covers the current frontier: every open decision that does not depend on another answer.

- Number the questions. Give each a **recommended answer with a one-line reason**, so the user can reply "all recommended" or override by number.
- Stop asking when the bar is met: *a fresh agent could implement each issue without asking anything.* Test every brief against that sentence before calling it done.
- Do not re-ask what the material or an earlier round already settled.

## The angles, in order

Work the design the way a joint product-and-tech review would; each round's answers feed the next:

1. **Product** — who this is for, the observable outcome, what's in and out of scope now, how it splits into slices or phases, priority.
2. **Behavior** — primary and alternate flows, rules, permissions, validations, edge and failure cases; for UI, the states, components, and copy.
3. **Technical** — only the choices that are genuinely the user's: approach trade-offs, data and interface implications, integrations, migration; recommend one and say why. Routine implementation stays the implementer's.
4. **Quality and risk** — what proves it works (test cases, acceptance), what earns the `risky` label, what should stop a dark run beyond the standing stop-list.

These are the brief template's sections in interview form — a question exists only where reading the material, the codebase, and sensible defaults cannot fill a section.

## Slicing

- One issue = one outcome that fits one agent session, sliced vertically (a thin working path through the stack beats a layer at a time).
- Blockers use native issue dependencies (blocked-by); phases use milestones; hierarchy uses parent/sub-issues. Labels never duplicate these.
- A large feature gets a parent issue holding the map and child issues holding the work. **Only child issues ever get `ready`** — a parent brief is context, not an executable task, and an agent must never pick it up whole.
- Deliberately deferred work ("someday, not now") lives in the parent's out-of-scope section, not as its own issue — icebox issues clutter the tracker. Create a tracking issue for it only when the user asks.

## The brief

Every issue body follows [brief-template](references/brief-template.md): Outcome · Out of scope · Rules and edge cases · UI states (when there is UI) · Approach and touch points · Tests and acceptance · Risks and stop conditions · Assumptions. Write the sections that apply and delete the ones that don't — an empty "N/A" section is noise, not diligence. Details live inline in the issue; links to docs are supporting material, never a substitute for the brief. Evidence over confidence: touch points name real paths, dependency claims carry their check date, and anything material the grounding could not verify goes in **Assumptions — confirm or correct**, never asserted as fact.

## Labels and approval

- A new issue starts at `needs-operator`. Add `risky` when it touches security, money, user data, or production.
- Approval is only the user's explicit words — "approved", "go ahead", clearly tied to this issue, in chat or on the issue. Labels, silence, or the passage of time never create approval.
- Record it once: comment `Approved by <user> on <date>: "<their words>"`, then swap `needs-operator` → `ready`. That comment is what dev-implement's preflight looks for.
- An issue with an unconfirmed entry in its Assumptions section cannot go `ready` — the recorded approval covers the ledger the user saw, so resolve every entry (confirmed, corrected, or moved to a spike) first.
- An issue that settles a material cross-cutting decision records it as one comment starting `Decision:` — dev-ship appends that line to the project's decision register at merge.
- The user edits or corrects a draft → apply, and summarize what changed since they last read it.

## After approval

An approved issue that later needs a material change flips back to `needs-operator` with one comment naming what changed; the new approval is recorded the same way. Small wording fixes that change no behavior don't reopen anything.
