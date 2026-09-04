# Workflow conventions

The single spec for every artifact dev-family skills read and write. One home per rule: skills cite this file, never restate it. Everything here is harness-neutral.

Knob precedence, nearest wins: hand edits in `.vegastack/dev.md`, then the org control room's `groups/<g>/*`, then its `org.md`, then skill defaults; decision registers concatenate instead of overriding.

## Comment metadata markers

Every workflow-generated comment opens with an invisible HTML marker, then a human heading:

```markdown
<!-- vsk:v1 type=<type> rev=<n> [key=value ...] -->
## <Human title> (v<n>)
```

| type | required keys | instances |
|---|---|---|
| `approval` | `scope=<brief\|brief+plan\|plan>` | one per approval event |
| `questions` | `rev` | one per ask round; earlier rounds stay as record (dev-setup's `references/ask-route.md`) |
| `plan` | `rev` | one, edited in place |
| `ledger` | `branch` | one, edited in place |
| `evidence` | `rev branch sha` | one, edited in place |
| `review` | `round sha agent=<claude\|codex> verdict=<clean\|needs-fixes>` | one per review cycle, rounds appended inside |
| `decision` | — | one per decision proposal |
| `handback` | — | one per stop event |

`rev=<n>` and the matching `(v<n>)` heading suffix appear only on revisable artifacts — the brief (issue description), `plan`, `questions`, `evidence` — starting at `rev=1`/`(v1)`. Single-event comments (`approval`, `decision`, `handback`) and the `ledger` carry neither. Scripts and agents locate comments by marker, never heading text; a comment without its marker is not the artifact — no legacy fallback.

## Operator identity

Every human reference — approvals, revisions, decisions, changelog attributions, review adjudications — names the operator by GitHub username in parentheses, no title — `(<github-username>)`:

- Approval: `Approved by (<username>) on DD-MM-YYYY: "<their words>"`
- Register line: `- DD-MM-YYYY (<username>) — <decision>`

An issue's operator is its approval-marker author when dev.md's `operators:` list names them, else its issue author when listed, else the first listed.

## Revision markers

Any artifact edited after its first approval: the heading gains `(v2)`, the marker `rev=2`, and a `Revisions:` line is appended — `v2 — DD-MM-YYYY: <what changed>, per (<username>) correction`. Existing revision lines are never rewritten.

## Scope classes

Set at intake, applied as a label, announced with its reason (operator overrides):

- **`research`** — a question to answer; throwaway code allowed, never merged. No branch/PR/changelog; findings + recommendation are the evidence comment.
- **`quick-build`** — small change whose flow already exists in the repo to read. Brief and plan are drafted in the same conversation; **one approval covers both**; then straight to `ready`.
- **`full-plan`** — big or new ground. Brief approval → `needs-plan` → a separate, fresh-grounded planning session posts the plan → `needs-operator` → "plan approved" → `ready`. Multi-deliverable work becomes an epic, each sub-issue classified independently.

The scope ratchet lives in `dev-plan`.

## Labels

State — exactly one per issue; every flip sets the assignee column (creation colors: dev-setup's labels row):

| label | meaning | assignee |
|---|---|---|
| `needs-operator` | a question, a brief or plan to approve, a proposal | the operator |
| `needs-plan` | brief approved; awaiting the planning stage (full-plan only) | the operator |
| `ready` | approved — an agent may start | nobody |
| `working` | claimed; the ledger shows live progress | whoever started the run |
| `for-operator` | done — evidence posted, awaiting operator review | the operator |

Modifiers (may coexist with the state label): `risky` · scope `research` / `quick-build` / `full-plan` · `epic` (map parents, absent a native Epic type). Boards mirror state labels one way.

## Titles, types, hierarchy

- **Title prefixes** on issues, branches, and PRs identically: dev.md's `branch:` type list plus `research:`. PR title = issue title.
- **Native issue types and fields** where the org defines them: Feature (feat) · Bug (fix) · Task (docs/chore/refactor/research) · Epic for parents (else the label); intake sets Priority and Effort. Scope classes stay labels.
- **Hierarchy:** epic parent = map only (Destination · Decisions so far · Not clear yet · Out of scope), children as native sub-issues; issues = the unit of work (brief, approvals, branch, PR, evidence); tasks = checkboxes **in the plan comment only**. Blockers use dependencies; phases milestones. Only issues, never epics, get `ready`.

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


**Resume protocol:** a fresh, compacted, or handed-over session reads, in order: brief → plan comment → ledger → `git log` — nothing else.

## `.vegastack/` workspaces

Transitory artifacts (subagent reports, review packages, drafts, diffs) live at `.vegastack/.tmp/<issue-number>-<title-slug>/` (pre-issue: `.vegastack/.tmp/intake-<slug>/`), kept out of git by a self-ignoring `.gitignore` (`*`); every branch is checked out at `.vegastack/.worktrees/<issue-number>-<title-slug>/`, ignored from the root, so the main checkout never leaves the default branch. Subagents write full reports there and return short status, so their findings survive. Both live in the working tree, never under `.git/`, which harnesses protect. `<path-to-this-skill>` is the directory holding the SKILL.md you are reading.

## Verification gate

Audit each claim against a tool result from this session: run the proving command fresh, read its full output and exit code, then claim with that evidence. Report outcomes faithfully — failing tests are reported with their output, a skipped step is named. Delegate only sizeable, independent, parallelizable work, never verification of your own, and keep spawn counts low. Guard scripts follow the same doctrine: machine-verifiable facts block (exit 2 with the reason); regex or judgment heuristics only warn — no AI inference inside guards, and an unverifiable state fails closed.

## Plain-language collaboration

Narrate at three moments: one line before starting, a brief update on a finding or change of direction, and an outcome-first recap that stands alone — what happened, which paths were taken, what is worth the operator double-checking. Readability beats concision; arrow chains and made-up labels hide meaning. Use mermaid or ASCII diagrams in issues wherever a picture beats prose. A vague or self-contradicting operator answer gets pushback with concrete options, never silent absorption.
