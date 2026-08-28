# The plan format

The comment a plan lives in, verbatim. dev-implement executes it task by task and ticks the checkboxes; plan-lint enforces the deterministic parts.

````markdown
<!-- vsk:v1 type=plan rev=1 -->
## Plan (v1)

**Goal:** <one sentence: what exists when this plan is done>
**Approach:** <2–3 sentences — and the alternatives considered with why they lost, one line each>
**Constraints:** <binding requirements from the brief and Architecture facts, exact values, one per line>

### Tasks

- [ ] **Task 1: <name>**
  - Files — Create: `exact/path.ts` · Modify: `exact/path.ts` (<which area>) · Test: `exact/path.test.ts`
  - Interfaces — Consumes: <exact signatures/names from earlier tasks> · Produces: <exact names, parameter and return types later tasks rely on — an implementer may see only this task; this block is how they learn what neighbors use>
  - Steps: write the failing test (the actual test code, fenced) → run it, expect FAIL with <reason> → implement the minimal code → run, expect PASS → commit `<type>: <message>`
- [ ] **Task 2: …**
````

## Rules

- **Task size:** the smallest unit that carries its own test cycle and is worth a fresh reviewer's look. Fold setup/scaffolding/docs into the task whose deliverable needs them; split only where a reviewer could reject one task while approving its neighbor. Each task ends independently verifiable.
- **Prose tasks** (docs, skill text, config) swap the test-first Steps for edit → verify (the concrete command: `bun run check`, a link-resolution run, a rendered read-through) → commit. The verify step is never omitted.
- **Revisions:** any post-approval edit bumps the heading `(v2)` and marker `rev=2` and appends a `Revisions:` line — `v2 — DD-MM-YYYY: <what changed>, per operator (<username>) correction`.

## Banned placeholders

These are plan failures — plan-lint rejects them, and a human reviewer should too:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" without the actual test code
- "Similar to Task N" — repeat the content; tasks are read out of order
- Steps that describe what to do without showing how (code steps require code blocks)
- References to types, functions, or files no task defines

## Self-review before posting

1. **Coverage:** walk the brief section by section — every requirement points at a task; list any gap (a gap is a question for the operator, not a silent omission).
2. **Placeholder scan:** search the draft for the banned list above; fix inline.
3. **Consistency:** names, signatures, and paths used in later tasks match what earlier tasks define — `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug now, not at build time.

## Worked micro-example

```markdown
- [ ] **Task 1: reminder schedule column**
  - Files — Modify: `server/db/schema/invoices.ts` (invoices table) · Test: `server/db/schema/invoices.test.ts`
  - Interfaces — Produces: `invoices.reminderAt: timestamp | null` (Drizzle column), read by Task 2's query
  - Steps: failing test asserting the column exists in the generated schema → run, expect FAIL "no such column" → add the column + regenerate → run, expect PASS → commit `feat: reminder schedule column`
```
