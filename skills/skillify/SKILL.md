---
name: skillify
description: Repo-local skill factory and auditor for the vegastack-skills monorepo. Use when asked to "skillify this", "make this a skill", "turn this workflow into a skill", or scaffold a new skill under skills/; when asked to "audit this skill", "is this skill complete", "check skill completeness", or score a skill against the repo contract; when deciding whether a workflow, script, or prompt should become a skill at all; when a skill description under- or over-triggers and needs tuning; or when a skill in this repo is missing tests, a README, a refresh contract, behavioral eval evidence, or repo wiring. Only for skills inside this repository, not for authoring skills in other projects or installing third-party skills.
---

# Skillify

Turn a raw workflow into a properly-skilled unit of this monorepo, or audit an existing `skills/<name>/` tree against the full repo contract (CONTRIBUTING.md, "Adding a new skill"). Skillify is repo-only: it creates and scores skills in this repository, not anywhere else. Deep wiring/release mechanics belong to `skill-maintainer`; cross-reference it rather than restating it.

## The completeness checklist

Score every item pass / fail / N/A. N/A requires a one-line rationale; N/A without one is a fail.

1. **SKILL.md spec-compliant** — frontmatter is exactly `name` + `description`; name matches the directory and the grammar (starts with a lowercase letter, `[a-z0-9-]`, no consecutive hyphens, max 64); description max 1024 chars with no angle brackets; body under 500 lines; no harness-specific body syntax. `bun run validate:skill` agrees.
2. **Description triggers well** — states triggering conditions only (never the workflow), third person, trigger words front-loaded, per [authoring](references/authoring.md); a should/should-not-trigger query set with near-miss negatives exists at `tests/fixtures/trigger-queries.json`.
3. **README walkthrough** — repo-side `README.md`: install, contents table, behavior contract.
4. **References routed** — `references/` for on-demand detail with a routing table in SKILL.md; or N/A for a self-contained skill.
5. **Scripts deterministic** — dependency-free Node under `scripts/`, `--json` for machine output, documented exit codes, atomic writes and symlink refusal for anything mutating; or N/A.
6. **Assets** — templates/schemas/examples under `assets/`; or N/A.
7. **Unit tests + fixtures** — `tests/*.test.ts` (bun test) covering every deterministic branch; fixtures under `tests/fixtures/`.
8. **Consistency test** — a test asserting prose, scripts, templates, and registry agree: relative links resolve, documented flags exist, template inventory matches the scaffolder.
9. **Behavioral eval evidence** — with-skill vs baseline subagent runs on 2–3 realistic prompts per the [eval playbook](references/eval-playbook.md); summary in the PR body; unresolved gaps in a KNOWN_GAPS section of the skill's README.
10. **Refresh contract** — `refresh/sources.json` + `refresh/REFRESH.md` tracking every volatile claim; or an explicit evergreen waiver in REFRESH.md stating why nothing in the skill decays.
11. **Codex metadata** — `agents/openai.yaml`.
12. **Repo wiring** — sync-skill allowlist entry, root README table row, CHANGELOG entry (`skill-maintainer` owns the detail).
13. **Green check** — `bun run check` passes.

**Verdict:** all pass → `properly skilled`. At most three misses, none of items 1, 7, or 13 → `close — create: <missing items>`. Otherwise → `needs skillify — run skillify on <target>`. Always report the score as `<passed>/13` plus the verdict.

## Phase 0 — Should this be a skill?

Before anything else, check:

- Will it be invoked 2+ times? One-off work is not a skill.
- Is there more than ~20 lines of logic or judgment? Trivial helpers do not need the full contract.
- Is there a trigger phrase a user would actually say?

If any answer is no: it is a script or a doc, not a skill. Stop — do not scaffold, do not write a SKILL.md. Say why and move on.

Scope upper bound: **one skill = one capability = one coherent trigger family.** If the target spans distinct intents users would invoke separately ("run the build" / "roll back the deploy" / "notify the team" are three intents), do not build one skill covering them all. Propose the split and ask which target to skillify first.

## Phase 1 — Audit

For an existing skill, score the checklist against the actual tree and stop with the verdict:

```
Skill: <name>            Path: skills/<name>/
Score: <passed>/13       Verdict: <verdict>
Missing: <item>: <one-line evidence> ...
```

For a new skill the audit is trivially 0/13 — proceed. When the request was only "audit" / "is this complete", deliver the verdict and the shortest path to `properly skilled`; do not start editing unasked.

## Phase 2 — Elicit requirements

Interview before writing (skip questions the conversation already answers):

- **Triggers:** what exact phrases should invoke this? What near-miss requests should NOT? (These become the query set.)
- **Output:** what does done look like — files, report shape, side effects?
- **Edge cases:** empty input, missing config, offline, partial state?
- **Existing behavior:** is there code/prose to absorb? What did its author correct over time?

Then classify every factual claim the skill will make:

| Class | Meaning | Where it lives |
|---|---|---|
| Durable | versionless principle | references prose; refresh never edits |
| Mechanism-coupled | durable intent through a vendor-named mechanism | marked `<!-- source: SOURCE-ID -->`; edited only with registry evidence |
| Volatile | version pins, limits, model names, URLs | `refresh/sources.json` entries or refresh-tracked files only |

Every mechanism-coupled or volatile claim needs a registry source — or the skill declares an evergreen waiver. No unclassified claims ship.

## Phase 3 — Scaffold and write

Scaffold the contract tree (dry-run first; `--write` to create; `--json` for machine output):

```sh
node <skill-dir>/scripts/scaffold-skill.mjs <name> --dir <repo-root>
node <skill-dir>/scripts/scaffold-skill.mjs <name> --dir <repo-root> --write
```

The scaffolder validates the name grammar, refuses existing directories and symlinks, stages in a temp sibling then renames, and prints the manual wiring steps. Then write, in this order:

1. *Description + trigger query set* — engineer the description per [authoring](references/authoring.md); write 8–10 should-trigger and 8–10 near-miss should-not-trigger queries into `tests/fixtures/trigger-queries.json`.
2. *SKILL.md body* — workflow, one excellent example, routing table. Respect the token budgets in [authoring](references/authoring.md).
3. *References* — detail that only some invocations need.
4. *Scripts* — only for work that is deterministic and repeated (criteria in [authoring](references/authoring.md)).
5. *Draft tests* — but do not treat them as the quality bar yet; that is Phase 4's job.

## Phase 4 — Behavioral eval — the quality gate

**Tests lock in behavior. If the behavior is mediocre, tests lock in mediocrity.** Prove quality first, then let tests cement it.

Follow the [eval playbook](references/eval-playbook.md): for each of 2–3 realistic prompts, launch two subagents in the same turn — one told to follow the new SKILL.md, one baseline without it — and compare outputs against the skill's claimed value. This is a procedure you execute with your own subagents, never a custom eval harness or tooling.

Iterate at most 3 cycles: eval → apply the top improvements to the skill → re-eval. Pass, or ship with a KNOWN_GAPS section (format in the playbook). If the baseline already matches the with-skill output, the skill is not earning its tokens — cut it or narrow it.

## Phase 5 — Lock in

Now that quality is proven:

1. Finalize unit tests and fixtures locking in the eval-proven behavior; add the consistency test (item 8).
2. Write `refresh/sources.json` + `refresh/REFRESH.md` from the Phase 2 claim classification — or the evergreen waiver.
3. Finish `README.md` and `agents/openai.yaml`.
4. Wire the repo: sync-skill allowlist, root README row, CHANGELOG entry — as printed by the scaffolder; `skill-maintainer` documents each step in depth.

## Phase 6 — Verify

```sh
node packages/cli/scripts/validate-skill.mjs skills/<name>
bun test skills/<name>
bun run check
```

Re-score the checklist and report `<passed>/13` with the verdict. Anything below `properly skilled` ships only with named gaps.

## Worked example: skillifying a "release-notes" workflow

```
Phase 0: yes — run at every release, ~80 lines of conventions, trigger "draft the release notes"
Phase 1: 0/13 (new)
Phase 2: triggers "draft/write the release notes", NOT "write a changelog entry for this PR";
  output = CHANGELOG section + npm summary; claims: changeset flow = durable,
  npm publish mechanics = mechanism-coupled (source NPM-PUBLISH), CLI version pin = volatile
Phase 3: scaffold-skill.mjs release-notes --dir . --write; description + 18 trigger queries;
  body + references/format.md; no scripts (judgment-heavy, N/A with rationale)
Phase 4: eval cycle 1 — baseline subagent invents section headings, with-skill misses breaking-change
  callouts → add callout contract to SKILL.md; cycle 2 — with-skill clearly better, baseline still
  wrong shape → pass
Phase 5: tests lock the section contract; sources.json gets NPM-PUBLISH; wiring done
Phase 6: bun run check green; 13/13 → properly skilled
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
- Prose and scripts disagreeing about flags or paths — that is what the consistency test catches.
- Building eval tooling — evals are instructions you run with subagents, not code you write.

## Routing

| Need | Read |
|---|---|
| description engineering, numeric limits, token budgets, script-vs-instructions, claim classes | [authoring](references/authoring.md) |
| eval method, pass criteria, trigger-query doctrine, cycle protocol, KNOWN_GAPS, model guidance | [eval playbook](references/eval-playbook.md) |
| the scaffolded starting points | `assets/templates/` |
| skillify's own freshness stance | [refresh/REFRESH.md](refresh/REFRESH.md) |
