# Refresh contract — skill-maintainer

Instructions for the scheduled refresh agent (and any human running a manual refresh). This file, together with `sources.json`, is the complete freshness contract for this skill.

## What this skill claims

- **Durable content** (`SKILL.md` workflows and operating rules, `references/release-ops.md`): repo process, derived from `docs/policies/*` — the refresh agent NEVER edits these. If a policy doc changes, that is a normal human PR, not a refresh.
- **Mechanism-coupled claims**: sentences marked `<!-- source: SOURCE-ID -->` inside `references/standards.md`. These carry the tri-harness standards — discovery paths, frontmatter rules, numeric context budgets, install surfaces. They are the compliance basis of every skill in this repo, so **all standards changes are semantic drift requiring a human-reviewed PR**: the agent may propose edits to marked sentences only, in the same PR as the registry update that evidences the change, and a maintainer must review before merge. The hard-limits table in `SKILL.md` mirrors several marked sentences; update it in the same PR (this is the one sanctioned SKILL.md touch, and only when a mirrored number changed).
- **Volatile layer** (the only file the agent edits freely): `refresh/sources.json` — the source registry and staleness snapshot (checksums, retrieval times).

## How to refresh

The deterministic runner is repo-shared and hosted in arch-guardian for now. Run from the repo root:

1. **Deterministic pass first** (no LLM judgment):
   `node skills/arch-guardian/scripts/refresh-evidence.mjs --registry skills/skill-maintainer/refresh/sources.json`
   drift/stale/unavailable results are the work-list. Exit 1 with a critical entry means fail-closed: the run must not be silently skipped. All four sources here are critical.
2. **Accept verified changes** in the same code path:
   `node skills/arch-guardian/scripts/refresh-evidence.mjs --registry skills/skill-maintainer/refresh/sources.json --accept-baselines`
   This writes registry, cache, and drift report together — never hand-edit checksums, versions, or timestamps; they must always come from a run. Baselines are runner-seeded; when a new source is added or a verified change is accepted, this accept-baselines invocation is the only sanctioned way to update them.
3. **Semantic verification** for every source the deterministic pass flagged: read the changed page (fetch the registry URL), decide whether any `<!-- source: X -->` marked sentence in `references/standards.md` (or the mirrored SKILL.md hard-limits row) is now wrong, and propose the minimal edit. Unlike version-pin registries, checksum drift here is presumed meaningful until a human reads the diff — these pages define the standards themselves. Editorial churn may be accepted silently only after that read.
4. **One standing refresh PR**, branch `refresh/weekly`, force-updated on every run (never stacked duplicates; the weekly workflow .github/workflows/refresh.yml maintains it). PR body lists: each changed source, old→new checksum, links to the evidence, and which marked sentences changed and why. A maintainer review is mandatory before merge.
5. Changes to durable content, workflows, tests, or anything outside `refresh/` and marked sentences are out of scope for a refresh PR — CI enforces this (refresh-guard workflow).

## Cadence and thresholds

Weekly scheduled run. Every `thresholdDays` in `sources.json` is ≥ 14 (2× cadence) so one missed run never breaches a threshold.

## What counts as drift worth a PR

- Any text-scope checksum change on any of the four sources → read the page; if a discovery path, frontmatter rule, numeric budget, or install surface changed, propose the marked-sentence edit and flag it prominently — downstream, every skill in `skills/` may need re-checking against the new standard (that re-check is a separate human task, never part of the refresh PR).
- A source page moves to an UNVERIFIED area (e.g. a documented path disappears) → move the claim into the UNVERIFIED register in `references/standards.md` rather than asserting the old fact.
- A critical source is unavailable or a redirect leaves the approved host set → investigate immediately; host changes require a deliberate `approvedHosts` update in the shared runner (out of refresh-PR scope — open an issue).

## Never

- Never edit unmarked sentences, workflows, or `references/release-ops.md`.
- Never hand-write checksum/version/timestamp values.
- Never merge a standards change without human review — this registry has no auto-acceptable semantic drift.
- Never archive third-party documentation bodies in this repo (claim metadata, URLs, hashes, and concise excerpts only).
