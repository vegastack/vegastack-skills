# Refresh contract — arch-guardian

Instructions for the scheduled refresh agent (and any human running a manual refresh). This file, together with `sources.json`, is the complete freshness contract for this skill.

## What this skill claims

- **Durable rules** (`references/architecture/*.md`, `references/*.md|json`): versionless principles. The refresh agent NEVER edits these. If a source change invalidates a durable rule, open an issue titled `drift: <rule-id>` quoting the evidence — do not edit.
- **Mechanism-coupled claims**: sentences marked `<!-- source: SOURCE-ID -->` inside references. Durable intent expressed through vendor-named mechanisms (e.g. Better Auth option names, sandbox egress API, MCP negotiation). The agent may propose edits to these marked sentences ONLY, in the same PR as the registry update that evidences the change.
- **Volatile layer** (the only files the agent edits freely):
  - `refresh/sources.json` — the source registry and publish-time staleness snapshot (checksums, versions, retrieval times).
  - `references/foundation-compatibility.json` — pinned baselines and the criticalSources mirror.

## How to refresh

1. **Deterministic pass first** (no LLM judgment):
   `node scripts/refresh-evidence.mjs --registry refresh/sources.json`
   drift/version-drift/stale/unavailable results are the work-list. Exit 1 with a critical entry means fail-closed: the run must not be silently skipped.
2. **Accept verified changes** in the same code path:
   `node scripts/refresh-evidence.mjs --registry refresh/sources.json --accept-baselines`
   This writes registry, cache, and drift report together — never hand-edit checksums, versions, or timestamps; they must always come from a run.
3. **Semantic verification** only for sources the deterministic pass flagged: read the changed source (WebFetch the registry URLs), decide whether any `<!-- source: X -->` marked sentence or compatibility pin is now wrong, and propose the minimal edit.
4. **One PR per refresh**, branch `refresh/<date>`, force-updating the standing refresh branch if last week's PR is unmerged (never stack duplicate PRs). PR body lists: each changed source, old→new version/checksum, links to the evidence, and which marked sentences changed and why.
5. Changes to durable rules, scripts, SKILL.md, assets, or tests are out of scope for a refresh PR — CI enforces this (refresh-guard workflow).

## Cadence and thresholds

Weekly scheduled run. Every `thresholdDays` in `sources.json` is ≥ 14 (2× cadence) so one missed run never breaches a threshold. Sources that would genuinely need faster tracking get a daily deterministic-only version check, not a lower threshold.

## What counts as drift worth a PR

- A pinned package/spec version changed (npm/pypi detection) → update `currentVersion`; if the supported baseline should move, that is a **separate human decision**, flagged in the PR body, never auto-applied to `foundation-compatibility.json` families.
- A doc page's text-scope checksum changed → read the page; if the mechanism a marked sentence names changed, propose the sentence edit; if it is editorial churn, accept the baseline silently. Known per-request-churn sources (Google properties: `FCM-DOCS`, `GOOGLE-MODELS`) drift on nearly every fetch — their checksum drift alone is never a semantic signal; rely on their version/manual review instead.
- A critical source is unavailable or a redirect leaves the approved host set → investigate immediately; host changes require a deliberate `approvedHosts` update in `scripts/refresh-evidence.mjs` (out of refresh-PR scope — open an issue).

## Never

- Never edit rule IDs, MUST/SHOULD wording, or unmarked sentences.
- Never expire, edit, or reference project ADRs — drift requests review; it never silently expires an ADR.
- Never hand-write checksum/version/timestamp values.
- Never archive third-party documentation bodies in this repo (claim metadata, URLs, hashes, and concise excerpts only).
