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
Bad: `Audits a skill by scoring 13 checklist items, then scaffolds, evals, and wires it.` (workflow summary — the body will be skipped)
Good: `Use when asked to "skillify this", "make this a skill", audit a skill's completeness, or decide whether a workflow should become a skill. Only for skills inside this repository.`

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

Every skill ships `tests/fixtures/trigger-queries.json`: an array of `{"query": "...", "should_trigger": true|false}`.

- 8–10 should-trigger: different phrasings of the same intent — formal, casual, typo-ridden; cases that never name the skill but clearly need it; cases where a neighboring skill competes and this one should win.
- 8–10 should-NOT-trigger: **near-misses only.** Queries sharing keywords or domain with the skill but needing something else — adjacent intents, ambiguous phrasing a naive keyword match would catch. "Write a fibonacci function" as a negative for a PDF skill tests nothing.
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

## Claim classification for refresh

Classify every factual claim while writing, not after:

| Class | Test | Treatment |
|---|---|---|
| **Durable** | still true if every vendor renames everything | plain prose; refresh automation never touches it |
| **Mechanism-coupled** | durable intent expressed through a vendor-named mechanism (an option name, an API shape) | mark the sentence `<!-- source: SOURCE-ID -->`; editable only alongside registry evidence for that source |
| **Volatile** | version pins, numeric limits, model names, URLs, anything with a date | lives in `refresh/sources.json` entries or other refresh-tracked files — never inline in SKILL.md |

The refresh contract falls out of this table: each distinct SOURCE-ID becomes a registry entry with URLs, checksum, threshold; REFRESH.md states which files the refresh agent may edit (the volatile layer), which sentences it may propose edits to (marked ones), and which it must only flag (durable). A skill with no mechanism-coupled or volatile claims declares an **evergreen waiver** in REFRESH.md — one paragraph stating why nothing decays — and keeps `sources: []`.
