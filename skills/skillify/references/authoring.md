# Authoring reference

Rules for writing the parts of a skill that determine whether it triggers, how much it costs, and whether it stays true over time.

## Description engineering

The description is the primary triggering mechanism: it is always in context, and the agent decides from it alone whether to load the body.

- **Triggering conditions only — never the workflow.** A description that summarizes the process becomes a shortcut: agents follow the summary and skip the body. State when to load the skill, not what the skill will do step by step.
- **Third person.** The text is injected into a system prompt ("Creates and audits...", "Use when..."), never "I can help you...".
- **Front-load trigger words.** Harness skill lists truncate long descriptions; the first clause must carry the strongest triggers.
- **Cover the ways users actually ask.** Exact phrases in quotes, symptoms, file types, adjacent phrasings, casual variants. Include the situations where the skill competes with a neighbor and should win.
- **Name the boundary.** One clause on what the skill is NOT for prevents over-triggering ("Only for skills inside this repository...").
- **No angle brackets** — the repo validator rejects them.

Bad: `Helps with skills.` (no triggers, no boundary)
Bad: `Audits a skill by scoring checklist items, then scaffolds, evals, and wires it.` (workflow summary — the body will be skipped)
Good: `Use when asked to "skillify this", "make this a skill", audit a skill's completeness, or decide whether a workflow should become a skill. Only for skills inside this repository.`

## Writing style

Rules for the prose itself — they exist because agents pay attention (and tokens) for every sentence, and because rule corpora rot in predictable ways:

- **Prompt the positive.** Steering by prohibition drags the forbidden behavior into context and invites a wall of NEVERs that only ever grows. State the rule you want followed, once, with the reason it matters. Reserve negation for genuinely dangerous acts.
- **Explain why, not ALL-CAPS what.** Modern models have good theory of mind; a rule with its reason generalizes, a bare MUST gets pattern-matched and misapplied. Reaching for caps or bold on every rule is a sign the rule needs a reason, not emphasis.
- **Hunt no-ops and sediment.** A no-op is an instruction the model already obeys by default — it pays load to say nothing. Sediment is case law: a clause added for one past failure that never gets removed. When a failure exposes a gap, rewrite the existing rule in place; do not append an exception. Prune by deleting whole sentences, not trimming words.
- **Budget the body.** Target 50–150 lines for a SKILL.md; treat 300 as the ceiling (the spec's 500 is a far bound, not a budget). One great example beats five mediocre ones. Anything only some invocations need goes behind a routed reference.
- **Name the nearest neighbor.** One sentence in the body stating which existing skill is closest and the axis of difference. It keeps trigger families sharp better than any linter, and forces the merge conversation before a near-duplicate ships.

## Numeric limits

<!-- mirrored: these numbers are volatile and mirrored from the standards sources tracked by the skill-maintainer registry; on drift, fix them there first, then here. -->

| Thing | Limit |
|---|---|
| `name` | 1–64 chars, starts with a lowercase letter, `[a-z0-9-]`, no consecutive hyphens, no leading/trailing hyphen, must equal the directory name |
| `description` | 1–1024 chars |
| Frontmatter keys | `name` + `description` only in this repo (spec also allows `license`, `compatibility`, `metadata`, `allowed-tools`; unknown keys hard-error on claude.ai packaging) |
| SKILL.md body | under 500 lines / ~5k tokens |
| Listing budgets | Claude truncates listed name+description around 1,536 chars; Codex caps the whole skill list at ~2% of context / 8,000 chars — front-load triggers |
| Relative references | one level deep, plain relative paths, no harness-specific syntax in the body |

## Trigger query sets

Every skill ships `tests/fixtures/trigger-queries.json`: an array of `{"query": "...", "should_trigger": true|false}`, with an optional `"ambiguous_with": ["skill-name"]` on entries where a neighboring skill competes for the query.

- About 10 queries total: 5–6 should-trigger, 4–5 should-NOT-trigger. A small set of hard queries beats a long set of easy ones.
- Should-trigger: different phrasings of the same intent — formal, casual, typo-ridden; cases that never name the skill but clearly need it; at least one `ambiguous_with` case this skill should win against its nearest neighbor.
- Should-NOT-trigger: **near-misses only.** Queries sharing keywords or domain with the skill but needing something else — adjacent intents, ambiguous phrasing a naive keyword match would catch. "Write a fibonacci function" as a negative for a PDF skill tests nothing.
- Queries must be realistic: concrete detail, file paths, a little backstory — what a user would actually type, not abstract category labels.

The set is both a design artifact (it forces the description to draw a real boundary) and eval input (see the [eval playbook](eval-playbook.md)).

## Token economy

Three loading levels; spend accordingly:

1. **Metadata (name + description)** — in every conversation, always. ~100 tokens. Every word must earn its place.
2. **SKILL.md body** — loaded on every trigger. Keep the workflow, one excellent example, and a routing table; push everything else down a level. One great example beats five mediocre ones.
3. **references/ / scripts/ / assets/** — loaded or executed on demand; effectively unlimited, but give each reference a clear routing condition so agents read only what the task needs.

Cross-reference other skills by name (`skill-maintainer`) instead of restating their content. Don't document a script's flags in prose beyond what routing needs — the script's own `--help`/usage error is the source of truth, and the consistency test keeps the two honest.

## Scripts vs instructions

**Deterministic and repeated → script. Judgment → instructions.**

- If two invocations with the same input must produce the same bytes, that is a script.
- Watch eval/test transcripts for agents independently rewriting the same helper — three subagents each writing their own `parse_frontmatter` is a strong signal the skill should bundle that script once.
- Repo conventions for bundled scripts: dependency-free Node (`.mjs`), runnable from the skill dir with plain relative paths, `--json` for machine-readable output, documented exit codes (0 ok / 1 finding-or-refusal / 2 usage), atomic writes (stage then rename), symlink refusal, and an explicit `--write` gate for anything mutating — dry-run is the default.
- Do NOT script judgment: descriptions, verdicts, review prose. A script that fakes judgment produces confident garbage.

## Volatile facts and refresh

One rule: **version pins, model names, numeric limits, URLs, and anything with a date live in refresh-tracked files — never inline in SKILL.md.** Everything else is plain prose that refresh automation never touches.

A volatile fact gets a `refresh/sources.json` entry (URL, checksum, threshold) and lives in a section the REFRESH.md names as editable; marking an individual sentence `<!-- source: SOURCE-ID -->` remains available when a durable rule leans on one vendor-named mechanism. A skill with no volatile facts of its own declares an **evergreen waiver** in REFRESH.md — one line stating why nothing decays — and keeps `sources: []`. Facts whose source of truth already lives in another skill's registry are mirrored with a `<!-- mirrored -->` marker, not duplicated as a second registry entry.
