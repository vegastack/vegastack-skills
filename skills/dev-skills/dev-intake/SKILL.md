---
name: dev-intake
description: Turn ideas, brainstorms, feature requests, bug reports, or SOW documents into GitHub issues an agent can act on without further questions. Use when the user asks for a new feature or capability ("add support for X", "I need Y", "can we make it do Z"), when asked to "turn this into issues", "create tasks from this SOW", "write up an issue for" a feature or bug, "users report X — make an issue", "plan this as issues", "slice this epic", or when the user gives approval on a drafted issue and it needs recording. Not for writing the implementation plan of an approved issue (dev-plan), implementing issues or a trivial one-or-two-file fix (dev-implement), creating PRs or merging (dev-ship), or project bootstrap (dev-setup).
---

# dev-intake

Requirements come in as the operator's brainstorm, feature thought, bug report, or SOW; issues go out complete enough that a fresh agent needs nothing but the URL. Every question gets asked **here** — once implementation starts, dark mode means no questions, so an under-specified issue becomes either an interruption or a guess.

Nearest neighbors: `dev-plan` owns the how once a brief is approved — intake owns the what/why and the approval mechanics; `dev-implement` builds.

## Ground before you ask

Finding facts is your job, never the operator's — a brief built on unverified facts is a confident mistake waiting for dark mode. Before the first question:

- **Read the touched code.** Open the actual paths the work would change: current behavior, patterns to reuse, where it plugs in. The brief cites these real paths later — a brief naming no files is a sign this step was skipped.
- **Verify dependencies.** Any library, service, or API capability the approach leans on gets checked against current official docs, noted with the date. Stack, schema, auth, and infra choices route through `dev-architect` — its verify protocol governs the check.
- **Cross-check the request** against product docs and current behavior. A contradiction is pushback, never a silent resolution: "you asked for X; the code currently does Y — which wins?" Push back on cost the same way: when a simpler version covers most of the need, name it.
- **Triage every unknown** into exactly three bins: *findable* → find it now, yourself; *only-the-operator-knows* → ask, with a recommendation; *only-running-code-can-tell* → a `research` issue or the issue's first spike step. Guessing is not a bin.

## Scope the work — say it out loud

Every issue gets exactly one scope call, announced with its reason, applied as a label, and recorded in the brief's `**Scope:**` line so the reasoning survives the conversation. The operator can override it:

- **`research`** — a question to answer, not code to keep. The brief is the question plus what "answered" looks like.
- **`quick-build`** — the objective test (conventions' wording): *a small change AND the flow being changed already exists in the repo to read*. Missing either half — no existing flow, or not actually small — means it is not quick-build; familiarity with the kind of app doesn't count.
- **`full-plan`** — big or new ground: a new subsystem, a restructuring, a brand-new flow.

In doubt between two classes, take the heavier one. Re-classification after this point belongs to `dev-plan`'s one-way ratchet — never silently downgrade.

## The interview

Ask in rounds with your harness's question tool (no tool available → documented defaults marked `TODO confirm`, and say so). Each round covers the current frontier: every open decision that doesn't depend on another answer. Number the questions; give each a **recommended answer with a one-line reason** so the operator can reply "all recommended"; never re-ask what the material or an earlier round already settled. A vague or self-contradicting answer gets pushback with concrete options — simple words, a mermaid or ASCII sketch when a picture beats prose — never silent absorption. Stop when the bar is met: *a fresh agent could act on each issue without asking anything.*

The angles, in order — product (who, observable outcome, in/out of scope, slices, priority) → behavior (flows, rules, permissions, edge and failure cases; UI states and copy) → technical (only choices genuinely the operator's, each with a recommendation, checked against `dev-architect`; settle the version impact where the project versions releases) → quality and risk (what proves it works, what earns `risky`, what stops a dark run). Deep approach trade-offs beyond the operator's choices belong to `dev-plan`, not this interview.

**Bug variant** (`fix:` issues): reproduction steps — or the artifacts needed to obtain them (logs, HAR, recording) — are a required brief section, and the brief names `dev-debug` as the implement path. A bug that can't be reproduced yet becomes a `research` issue first.

## Slicing and hierarchy

- One issue = one outcome that fits one agent session, sliced vertically. Blockers use native dependencies; phases use milestones; parents use native sub-issues.
- Deliberately deferred work ("someday, not now") lives in the parent's out-of-scope section, never as its own issue — icebox issues clutter the tracker; a tracking issue exists only on the operator's ask.
- **Epics:** a multi-deliverable feature gets a parent whose body is a map, never a task — `Destination` (one or two lines every session orients to) · `Decisions so far` (one-line gists linking closed children) · `Not clear yet` (in-scope questions you cannot yet state precisely — the test is whether the question can be phrased sharply now, not answered now; don't pre-slice fog) · `Out of scope` (the tempting adjacent work, named). A mermaid overview when it helps. Each child is classified independently. **Only children ever get `ready`.**
- Titles carry the type prefix (dev.md `branch:` type list + `research:`) and the native issue type where the org has them — issue, branch, and PR always agree.

## The brief

The issue body follows [brief-template](references/brief-template.md), marker line included. Inline over linked; concrete over abstract; evidence over confidence — touch points name real paths, dependency claims carry their check date, and anything unverifiable goes to **Assumptions — confirm or correct**, never asserted. Tests-and-acceptance names the **seams** — the public boundaries tests will live at — because dark mode can't ask later.

**Quick-build issues get their plan now:** after the brief has consensus, invoke `dev-plan`'s inline mode in this same conversation and post brief (description) + plan (comment) together — the operator's single approval covers both.

Before posting any brief, run `node <path-to-this-skill>/scripts/brief-lint.mjs --file <draft> --scope <class> --json` (add `--fix` for fix:-type briefs — it requires the Reproduction section) — structure gaps block (exit 2), quality smells only warn; fix blocks before the operator ever sees the draft. Inline plans additionally pass `dev-plan`'s plan-lint.

## Labels and approval

- A new issue starts at `needs-operator`, plus its scope label; add `risky` when it touches security, money, user data, or production. (Names come from dev.md's `labels:` knob.)
- Approval is only the operator's explicit words, clearly tied to the issue. Labels, silence, or time never create approval.
- Record it as one approval marker comment per conventions — `scope=brief`, or `scope=brief+plan` when the inline plan was posted with it — quoting the operator's words in the (username) format. That comment is what preflight verifies.
- Then flip the state: `research` and `quick-build` → `ready`; `full-plan` → `needs-plan` (dev-plan takes it from there).
- An issue with an unresolved Assumptions entry cannot leave `needs-operator` — resolve every entry (confirmed, corrected, or moved to a spike) first; the section is deleted once resolved.
- A directional decision this work settles — one passing the Decisions test in dev.md — is proposed as one register line on the operator's yes; `dev-ship` records at merge.
- The operator edits a draft → apply, and summarize what changed since they last read it.

## After approval

An approved issue that later needs a material change flips back to `needs-operator` with one comment naming what changed; the new approval is recorded the same way, and the brief's revision marker bumps. Small wording fixes that change no behavior don't reopen anything.
