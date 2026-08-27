# Refresh contract — dev-setup

Instructions for the scheduled refresh agent (and any human running a manual refresh). This file plus `sources.json` is the complete freshness contract for this skill.

## What this skill claims

- **Durable rules** (SKILL.md, assets): the detect-then-ask discipline, the interview rounds and knobs, the marked-section AGENTS.md contract, the label set, the defaults-plus-TODO fallback. Versionless; the refresh agent NEVER edits these — if evidence invalidates one, open an issue quoting it.
- **Volatile facts**: everything in `references/harness-facts.md` — Claude Code memory/import/skill/question-tool mechanics and Codex AGENTS.md/skills/question-tool/exec mechanics. That file is the only refresh-tracked file; its sentences carry `<!-- source: SOURCE-ID -->` markers matching the registry.

## How to refresh

1. Run the shared runner against this registry; on drift, read the changed page and propose edits to the marked sentences in `references/harness-facts.md` (and the two mechanism-named tool references in SKILL.md Step 2/Step 3, which mirror it) in the same PR as the registry update.
2. Never auto-apply harness behavior changes; a human reviews — these facts change what dev-setup writes into user projects.
