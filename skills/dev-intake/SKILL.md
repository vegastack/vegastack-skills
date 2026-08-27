---
name: dev-intake
description: Turn ideas, brainstorms, feature requests, or SOW documents into GitHub issues an agent can implement without further questions. Use when asked to "turn this into issues", "create tasks from this SOW", "write up an issue for" a feature or bug, "plan this as issues", "slice this epic", or when the user gives approval on a drafted issue and it needs recording. Produces complete inline build briefs with labels, milestones, and blocker links. Not for implementing issues (dev-implement), creating PRs or merging (dev-ship), or project bootstrap (dev-setup).
---

# dev-intake

Requirements come in as the user's brainstorm, feature thought, or SOW; issues go out complete enough that a fresh agent needs nothing but the URL. Every question gets asked **here** — once implementation starts, dark mode means no questions, so an under-specified issue becomes either an interruption or a guess. This skill exists to make both impossible.

Nearest neighbor: `dev-implement` consumes what this produces — intake writes and gets approval, implement builds. If `.vegastack/dev.md` is missing, run `dev-setup` first, then continue here.

## Read first, ask second

Read the source material completely — the document, the conversation, the codebase where it clarifies feasibility. Extract every answer that is findable; questions are only for genuine decisions. Finding facts is your job, never the user's.

## The interview

Ask in rounds using your harness's question tool (AskUserQuestion in Claude Code, `request_user_input` in Codex where the mode allows; no tool available → draft with recommended answers marked `TODO confirm` and say so). Each round covers the current frontier: every open decision that does not depend on another answer.

- Number the questions. Give each a **recommended answer with a one-line reason**, so the user can reply "all recommended" or override by number.
- Stop asking when the bar is met: *a fresh agent could implement each issue without asking anything.* Test every brief against that sentence before calling it done.
- Do not re-ask what the material or an earlier round already settled.

## Slicing

- One issue = one outcome that fits one agent session, sliced vertically (a thin working path through the stack beats a layer at a time).
- Blockers use native issue dependencies (blocked-by); phases use milestones; hierarchy uses parent/sub-issues. Labels never duplicate these.
- A large feature gets a parent issue holding the map and child issues holding the work. **Only child issues ever get `ready`** — a parent brief is context, not an executable task, and an agent must never pick it up whole.
- Deliberately deferred work ("someday, not now") lives in the parent's out-of-scope section, not as its own issue — icebox issues clutter the tracker. Create a tracking issue for it only when the user asks.

## The brief

Every issue body follows [brief-template](references/brief-template.md): Outcome · Out of scope · Rules and edge cases · UI states (when there is UI) · Approach and touch points · Tests and acceptance · Risks and stop conditions. Write the sections that apply and delete the ones that don't — an empty "N/A" section is noise, not diligence. Details live inline in the issue; links to docs are supporting material, never a substitute for the brief.

## Labels and approval

- A new issue starts at `needs-you`. Add `risky` when it touches security, money, user data, or production.
- Approval is only the user's explicit words — "approved", "go ahead", clearly tied to this issue, in chat or on the issue. Labels, silence, or the passage of time never create approval.
- Record it once: comment `Approved by <user> on <date>: "<their words>"`, then swap `needs-you` → `ready`. That comment is what dev-implement's preflight looks for.
- An issue that settles a material cross-cutting decision records it as one comment starting `Decision:` — dev-ship appends that line to the project's decision register at merge.
- The user edits or corrects a draft → apply, and summarize what changed since they last read it.

## After approval

An approved issue that later needs a material change flips back to `needs-you` with one comment naming what changed; the new approval is recorded the same way. Small wording fixes that change no behavior don't reopen anything.
