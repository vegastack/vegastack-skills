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
| `evidence` | `rev branch sha` | one, edited in place |
| `review` | `round sha agent=<claude\|codex> verdict=<clean\|needs-fixes>` | one per review cycle, rounds appended inside |
| `decision` | — | one per decision proposal |
| `handback` | — | one per stop event |

`rev=<n>` and the matching `(v<n>)` heading suffix appear only on revisable artifacts — the brief (issue description), `plan`, and `evidence` — starting at `rev=1`/`(v1)`. Single-event comments (`approval`, `decision`, `handback`) and the `ledger` carry neither. Scripts and agents locate comments strictly by marker, never by heading text. A comment without its marker does not count as the artifact — there is no legacy fallback.

## Operator identity

Every human reference in every artifact — approvals, revisions, decisions, changelog attributions, review adjudications — names the operator by their GitHub username in parentheses, with no title before it — `(<github-username>)`:

- Approval: `Approved by (<username>) on DD-MM-YYYY: "<their words>"`
- Register line: `- DD-MM-YYYY (<username>) — <decision>`

## Revision markers

Any artifact edited after its first approval: the heading gains `(v2)`, the marker gains `rev=2`, and a `Revisions:` line is appended at the bottom — `v2 — DD-MM-YYYY: <what changed>, per (<username>) correction`. Existing revision lines are never rewritten.

## Scope classes

Set at intake, applied as a label, announced with its reason (operator can override):

- **`research`** — a question to answer; throwaway code allowed, never merged. No branch/PR/changelog; findings + recommendation are the evidence comment.
- **`quick-build`** — small change and the flow being changed already exists in the repo to read. Brief (description) + plan (comment) are drafted in the same conversation; **one approval covers both**; then straight to `ready`.
- **`full-plan`** — big or new ground. Brief approval → `needs-plan` → a separate, fresh-grounded planning session posts the plan → `needs-operator` → "plan approved" → `ready`. Multi-deliverable work becomes an epic; each sub-issue is classified independently.

The one-way ratchet that revisits a scope call lives in the `dev-plan` skill.

## Labels

State — exactly one per issue (creation colors live in dev-setup's labels row, their one home):

| label | meaning |
|---|---|
| `needs-operator` | waiting on the operator: a question, a brief or plan to approve, a proposal |
| `needs-plan` | brief approved; waiting for the planning stage (full-plan only) |
| `ready` | fully approved — an agent may start |
| `working` | claimed, in progress; the ledger comment shows live progress |
| `for-operator` | done — evidence posted, awaiting operator review |

Modifiers (may coexist with the state label): `risky` · scope `research` / `quick-build` / `full-plan` · `epic` (map parents, only where the org has no native Epic issue type).

## Titles, types, hierarchy

- **Title prefixes** on issues, branches, and PRs identically: dev.md's `branch:` knob type list plus `research:` for research issues. PR title = issue title.
- **Native issue types** where the org defines them: Feature (feat) · Bug (fix) · Task (docs/chore/refactor/research) · Epic for parents (label fallback otherwise).
- **Hierarchy:** epic parent = map only (Destination · Decisions so far as one-line gists · Not clear yet · Out of scope), children attached as native sub-issues; issues = the unit of work (brief in description, own approvals/branch/PR/evidence); tasks = checkboxes **in the plan comment only**. Blockers use native issue dependencies; phases use milestones. Only issues — never epics — get `ready`.

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

A checkpoint retains what a compaction summary must retain: difficulties and how they were resolved; options tried or set aside, and why; anything decided, ruled out, or established as a constraint, stated exactly; where things stand; what is open; exact names, numbers, links — the operator's words near-verbatim, the agent's reasoning condensed.

**Resume protocol:** a fresh, compacted, or handed-over session reads, in order: brief → plan comment → ledger → `git log` — nothing else.

## `.vegastack/.tmp/` workspace

Transitory artifacts (subagent reports, review packages, plan drafts, diffs) live at `.vegastack/.tmp/<issue-number>-<title-slug>/` (pre-issue intake drafts: `.vegastack/.tmp/intake-<slug>/`), kept out of git by a self-ignoring `.gitignore` whose only line is `*`, written on first use. Subagents write full reports there and return short status, so a dead subagent's findings survive and the primary session never holds them in context. It lives in the working tree, never under `.git/`, which harnesses protect from writes. `<path-to-this-skill>` in a command is the directory holding the SKILL.md you are reading.

## Verification gate

Audit each claim against a tool result from this session: run the proving command fresh, read its full output and exit code, then claim with that evidence. Report outcomes faithfully — if tests fail, say so with the output; if a step was skipped, say that. Delegate only sizeable, independent, parallelizable work, never the verification of your own work, and keep spawn counts low. Guard scripts follow the same doctrine: machine-verifiable facts block (exit 2 with the reason); regex or judgment heuristics only warn — no AI inference inside guards, and an unverifiable state fails closed.

## Plain-language collaboration

Narrate at three moments: one line before starting, a brief update on a finding or change of direction, and an outcome-first recap that stands alone — what happened, which paths were taken, what is worth the operator double-checking. Lead with the outcome; readability beats concision; arrow chains and made-up labels hide meaning from a reader who did not watch the work. Use mermaid or ASCII diagrams in issues wherever a picture beats prose. A vague or self-contradicting operator answer gets pushback with concrete options, never silent absorption.
