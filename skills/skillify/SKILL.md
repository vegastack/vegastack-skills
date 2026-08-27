---
name: skillify
description: Repo-local skill factory and auditor for the vegastack-skills monorepo. Use when asked to "skillify this", "make this a skill", "turn this workflow into a skill", or scaffold a new skill under skills/; when asked to "audit this skill", "is this skill complete", "check skill completeness", or score a skill against the repo contract; when deciding whether a workflow, script, or prompt should become a skill at all; when a skill description under- or over-triggers and needs tuning; or when a skill in this repo is missing tests, a README, a refresh contract, behavioral eval evidence, or repo wiring. Only for skills inside this repository, not for authoring skills in other projects or installing third-party skills.
---

# Skillify

Turn a raw workflow into a properly-skilled unit of this monorepo, or audit an existing `skills/<name>/` tree against the repo contract (CONTRIBUTING.md, "Adding a new skill"). Skillify is repo-only: it creates and scores skills in this repository, not anywhere else. Deep wiring/release mechanics belong to `skill-maintainer`; cross-reference it rather than restating it.

## The contract checklist

Score every item pass / fail / N/A. N/A requires a one-line rationale; N/A without one is a fail. Numbering is stable and additive — future items append, existing items never renumber — so other skills can cite "skillify item 6".

1. **SKILL.md spec-compliant** — frontmatter is exactly `name` + `description`; name matches the directory and the grammar (starts with a lowercase letter, `[a-z0-9-]`, no consecutive hyphens, max 64); description max 1024 chars with no angle brackets; body targets 50–150 lines with 300 as the ceiling; no harness-specific body syntax. `bun run validate:skill` agrees — it also verifies every relative link in the skill's prose resolves.
2. **Description triggers well** — states triggering conditions only (never the workflow), third person, trigger words front-loaded, per [authoring](references/authoring.md); a query set of realistic positives and near-miss negatives exists at `tests/fixtures/trigger-queries.json`, with `ambiguous_with` naming the nearest competing skill where one exists.
3. **Sharp boundary** — the SKILL.md body names its nearest-neighbor skill and the one-sentence axis of difference (or states it has no neighbor). Two skills answering the same trigger get merged, not shipped.
4. **References routed** — `references/` holds detail only some invocations need, behind a routing table; SKILL.md keeps the workflow, one excellent example, and the routes. N/A for a self-contained skill.
5. **Scripts deterministic and tested** — dependency-free Node under `scripts/`, `--json` for machine output, documented exit codes, atomic writes and symlink refusal for anything mutating, dry-run default; unit tests cover every deterministic branch. N/A when the skill ships no scripts — a prose-only skill needs no test theater; its quality bar is item 6.
6. **Behavioral eval passed** — with-skill vs baseline subagent runs on 2–3 realistic prompts per the [eval playbook](references/eval-playbook.md), at most 3 improve cycles; pass, or ship with a KNOWN_GAPS section in the skill's README.
7. **Freshness honest** — volatile facts (version pins, model names, numeric limits, dated claims) live in refresh-tracked files, never in SKILL.md; a skill with none states a one-line evergreen waiver in `refresh/REFRESH.md`.
8. **Wired and green** — README walkthrough and `agents/openai.yaml` exist; packaging entry, root README row, and changeset are in place (the scaffolder performs these); `bun run check` passes.

**Verdict:** all pass → `properly skilled`. At most two misses, neither item 1 nor item 6 → `close — create: <missing items>`. Otherwise → `needs skillify — run skillify on <target>`. Always report the score as `<passed>/8` plus the verdict.

## Phase 0 — Should this be a skill?

Before anything else, check:

- Will it be invoked 2+ times? One-off work is not a skill.
- Is there more than ~20 lines of logic or judgment? Trivial helpers do not need the full contract.
- Is there a trigger phrase a user would actually say?

If any answer is no: it is a script or a doc, not a skill. Stop — do not scaffold, do not write a SKILL.md. Say why and move on.

Then search the existing skills. If one nearly covers the intent, **prefer merging into it** over creating a near-duplicate — a new neighbor that splits an existing trigger family makes both skills trigger worse.

Scope upper bound: **one skill = one capability = one coherent trigger family.** If the target spans distinct intents users would invoke separately ("run the build" / "roll back the deploy" / "notify the team" are three intents), do not build one skill covering them all. Propose the split and ask which target to skillify first.

## Phase 1 — Audit

For an existing skill, score the checklist against the actual tree and stop with the verdict:

```
Skill: <name>            Path: skills/<name>/
Score: <passed>/8        Verdict: <verdict>
Missing: <item>: <one-line evidence> ...
```

For a new skill the audit is trivially 0/8 — proceed. When the request was only "audit" / "is this complete", deliver the verdict and the shortest path to `properly skilled`; do not start editing unasked.

## Phase 2 — Elicit requirements

Interview before writing (skip questions the conversation already answers):

- **Triggers:** what exact phrases should invoke this? What near-miss requests should NOT? Which existing skill is the nearest neighbor? (These become the query set and the boundary line.)
- **Output:** what does done look like — files, report shape, side effects?
- **Edge cases:** empty input, missing config, offline, partial state?
- **Existing behavior:** is there code/prose to absorb? What did its author correct over time?

While eliciting, mark every volatile fact the skill will state — version pins, model names, numeric limits, dated claims. Those go to refresh-tracked files (item 7); everything else is plain prose. A skill with no volatile facts takes the one-line evergreen waiver.

## Phase 3 — Scaffold and write

Scaffold the contract tree (dry-run first; `--write` to create; `--json` for machine output):

```sh
node <skill-dir>/scripts/scaffold-skill.mjs <name> --dir <repo-root>
node <skill-dir>/scripts/scaffold-skill.mjs <name> --dir <repo-root> --write
```

The scaffolder validates the name grammar, refuses existing directories and symlinks, stages in a temp sibling then renames, and performs the repo wiring itself (packaging entry, root README row, changeset) — fill in the README row's TODO description. Then write, in this order:

1. *Description + trigger query set* — engineer the description per [authoring](references/authoring.md); write the query set with near-miss negatives into `tests/fixtures/trigger-queries.json`.
2. *SKILL.md body* — workflow, one excellent example, nearest-neighbor boundary line, routing table. Respect the writing-style rules and token budgets in [authoring](references/authoring.md).
3. *References* — detail that only some invocations need.
4. *Scripts* — only for work that is deterministic and repeated (criteria in [authoring](references/authoring.md)).

## Phase 4 — Behavioral eval — the quality gate

**Tests lock in behavior. If the behavior is mediocre, tests lock in mediocrity.** Prove quality first, then let tests cement it.

Follow the [eval playbook](references/eval-playbook.md): for each of 2–3 realistic prompts, launch two subagents in the same turn — one told to follow the new SKILL.md, one baseline without it — and compare outputs against the skill's claimed value. This is a procedure you execute with your own subagents, never a custom eval harness or tooling.

Iterate at most 3 cycles: eval → apply the top improvements to the skill → re-eval. Pass, or ship with a KNOWN_GAPS section (format in the playbook). If the baseline already matches the with-skill output, the skill is not earning its tokens — cut it or narrow it.

## Phase 5 — Lock in

Now that quality is proven:

1. Write unit tests for the deterministic branches of any bundled scripts, plus fixtures. A prose-only skill keeps just its trigger-query fixture.
2. Write `refresh/sources.json` + `refresh/REFRESH.md` for the volatile facts marked in Phase 2 — or the one-line evergreen waiver.
3. Finish `README.md` and `agents/openai.yaml`; fill in the wiring TODOs the scaffolder left (README row description, changeset text).

## Phase 6 — Verify

```sh
node packages/cli/scripts/validate-skill.mjs skills/<name>
bun test skills/<name>
bun run check
```

Re-score the checklist and report `<passed>/8` with the verdict. Anything below `properly skilled` ships only with named gaps.

## Worked example: skillifying a "release-notes" workflow

```
Phase 0: yes — run at every release, ~80 lines of conventions, trigger "draft the release notes";
  nearest neighbor is skill-maintainer (release wiring) — different axis, proceed
Phase 1: 0/8 (new)
Phase 2: triggers "draft/write the release notes", NOT "write a changelog entry for this PR";
  output = CHANGELOG section + npm summary; volatile: none owned → evergreen waiver
Phase 3: scaffold-skill.mjs release-notes --dir . --write (wiring done by the scaffolder);
  description + 10 trigger queries incl. ambiguous_with skill-maintainer; body + references/format.md;
  no scripts (judgment-heavy, item 5 N/A)
Phase 4: eval cycle 1 — baseline subagent invents section headings, with-skill misses breaking-change
  callouts → add callout contract to SKILL.md; cycle 2 — with-skill clearly better, baseline still
  wrong shape → pass
Phase 5: trigger fixture locked; evergreen waiver written; README row description filled in
Phase 6: bun run check green; 8/8 → properly skilled
```

## Anti-patterns

- Writing lock-in tests before the behavioral eval — locks in mediocrity.
- A description that summarizes the workflow — agents follow the description and skip the body.
- Skipping the baseline run because "the output looks fine" — that is not evidence.
- Eval without a fix cycle — vanity metrics.
- Obviously-irrelevant negatives in the trigger query set — near-misses or nothing.
- Version pins or model names in SKILL.md — volatile facts live in refresh-tracked locations.
- Multi-intent skills spanning unrelated triggers — split them.
- Two skills answering the same trigger — merge or kill one.
- Steering by prohibition — a wall of NEVERs drags the forbidden behavior into context and grows forever; state the positive rule once and explain why it matters.
- Patching every observed agent failure with a new clause — that is sediment; rewrite the existing rule in place instead of appending case law.
- Unit tests for prose — a test asserting a markdown file contains a phrase proves nothing the eval didn't.
- Building eval tooling — evals are instructions you run with subagents, not code you write.

## Routing

| Need | Read |
|---|---|
| description engineering, writing style, numeric limits, token budgets, script-vs-instructions, volatile facts | [authoring](references/authoring.md) |
| eval method, pass criteria, trigger-query doctrine, cycle protocol, KNOWN_GAPS, model guidance | [eval playbook](references/eval-playbook.md) |
| the scaffolded starting points | `assets/templates/` |
| skillify's own freshness stance | [refresh/REFRESH.md](refresh/REFRESH.md) |
