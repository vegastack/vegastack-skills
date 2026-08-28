# Workflow conventions

The single spec for the artifacts every dev-family skill reads and writes. One home per rule: skills cite this file, never restate it. Everything here is harness-neutral.

## Comment metadata markers

Every workflow-generated issue comment opens with an invisible HTML marker followed by a human heading:

```markdown
<!-- vsk:v1 type=<type> rev=<n> [key=value ...] -->
## <Human title> (v<n>)
```

| type | required keys | instances |
|---|---|---|
| `approval` | `scope=<brief\|brief+plan\|plan>` | one per approval event |
| `plan` | `rev` | one, edited in place |
| `ledger` | `branch` | one, edited in place |
| `evidence` | `branch sha` | one, edited in place |
| `review` | `round sha agent=<claude\|codex> verdict=<clean\|needs-fixes>` | one per review cycle, rounds appended inside |
| `decision` | — | one per decision proposal |
| `handback` | — | one per stop event |

Scripts and agents locate comments strictly by marker, never by heading text. A comment without its marker does not count as the artifact — there is no legacy fallback.

## Operator identity

Every human reference in every artifact — approvals, revisions, decisions, changelog attributions, review adjudications — is written `operator (<github-username>)`:

- Approval: `Approved by operator (kmanojkumar) on DD-MM-YYYY: "<their words>"`
- Register line: `- DD-MM-YYYY operator (<username>) — <decision>`

## Revision markers

Any artifact edited after its first approval: the heading gains `(v2)`, the marker gains `rev=2`, and a `Revisions:` line is appended at the bottom — `v2 — DD-MM-YYYY: <what changed>, per operator (<username>) correction`. Existing revision lines are never rewritten.

## Scope classes

Set at intake, applied as a label, announced with its reason (operator can override):

- **`research`** — a question to answer; throwaway code allowed, never merged. No branch/PR/changelog; findings + recommendation are the evidence comment.
- **`quick-build`** — small change and the flow being changed already exists in the repo to read. Brief (description) + plan (comment) are drafted in the same conversation; **one approval covers both**; then straight to `ready`.
- **`full-plan`** — big or new ground. Brief approval → `needs-plan` → a separate, fresh-grounded planning session posts the plan → `needs-operator` → "plan approved" → `ready`. Multi-deliverable work becomes an epic; each sub-issue is classified independently.

**The ratchet is one-way:** work revealed bigger than its label stops and proposes the upgrade (quick-build → full-plan, issue → epic split) via `needs-operator` — never silently powered through. Downgrades only on the operator's explicit yes at plan time.

## Labels

State — exactly one per issue:

| label | color | meaning |
|---|---|---|
| `needs-operator` | FBCA04 | waiting on the operator: a question, a brief or plan to approve, a proposal |
| `needs-plan` | E36209 | brief approved; waiting for the planning stage (full-plan only) |
| `ready` | 0E8A16 | fully approved — an agent may start |
| `working` | 1D76DB | claimed, in progress; the ledger comment shows live progress |
| `for-operator` | 5319E7 | done — evidence posted, awaiting operator review |

Modifiers (may coexist with the state label): `risky` B60205 · scope `research` C5DEF5 / `quick-build` 76C7C0 / `full-plan` 2A9D8F · `epic` 24292E (parents, only when the org has no native Epic issue type).

## Titles, types, hierarchy

- **Title prefixes** on issues, branches, and PRs identically: `feat:` `fix:` `docs:` `chore:` `refactor:` `research:`. PR title = issue title.
- **Native issue types** where the org defines them: Feature (feat) · Bug (fix) · Task (docs/chore/refactor/research) · Epic for parents (label fallback otherwise).
- **Hierarchy:** epic parent = map only (Destination · Decisions so far as one-line gists · Not clear yet · Out of scope), children attached as native sub-issues; issues = the unit of work (brief in description, own approvals/branch/PR/evidence); tasks = checkboxes **in the plan comment only**. Blockers use native issue dependencies; phases use milestones. Only issues — never epics — get `ready`. A plan approaching GitHub's ~65,536-character comment cap means the issue should have been an epic: propose the split.

## The ledger

Maintained by the implement session as one comment, edited in place:

```markdown
<!-- vsk:v1 type=ledger branch=<branch> -->
## Ledger — <branch>
- Task <N>: complete (commits <base7>..<head7>[, review clean | K parked])
- Task <N>: fix round <R>/3 (<X> addressed, <Y> open — <one-liners>; commits <a>..<b>)
- Ruling: <what> — <why> — cost if wrong: <cost>
- Task <N>: parked — <finding> — Ruling: <why the code stands>
- Deferred minor: <one-liner>
```

**Resume protocol:** a fresh, compacted, or (operator-handed) takeover session reads, in order: the brief → the plan comment → the ledger → `git log` on the branch — **nothing else**. Tasks with a `complete` line are DONE, never re-executed; a task whose last line is a fix round resumes at the next round. After compaction, trust the ledger and `git log` over recollection. Every `Ruling:` line surfaces in the evidence comment — a ruling that dies with the session was a decision made in secret.

## `.vegastack/.tmp/` workspace

All transitory artifacts — subagent reports, review packages, plan drafts, extracted diffs — live at `.vegastack/.tmp/<issue-number>-<title-slug>/`, kept out of git by a self-ignoring `.gitignore` (`printf '*\n' > .vegastack/.tmp/.gitignore`, created on first use). Subagents write full reports to files there and return only short status — a dead subagent's findings survive on disk, and the primary session never holds full reports in context. The workspace lives in the working tree (never under `.git/`, which harnesses protect from writes).

## Verification gate

Before claiming any status: **IDENTIFY** the command that proves the claim → **RUN** it fresh and complete → **READ** the full output and exit code → only then claim, with the evidence. "Should pass", a previous run, or a subagent's say-so are never evidence. Guard scripts follow the same doctrine: machine-verifiable facts **block** (exit 2 with the reason); regex or judgment heuristics only **warn** — no AI inference inside guards, and an unverifiable state fails closed.

## Plain-language collaboration

Every skill run ends with a simple-language summary: what happened, which paths were taken — cross-agent invocations announced at trigger time AND summarized at the end — and what is worth the operator double-checking. Use mermaid or ASCII diagrams in issues wherever a picture beats prose. A vague or self-contradicting operator answer gets pushback with concrete options, never silent absorption.
