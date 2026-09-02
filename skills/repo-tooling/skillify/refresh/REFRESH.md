# Refresh contract — skillify

Instructions for the scheduled refresh agent (and any human running a manual refresh). This file plus `sources.json` is the complete freshness contract for this skill.

## What this skill claims

- **Durable rules** (SKILL.md, most of `references/`): the phase model, checklist structure, eval-before-tests ordering, description doctrine, the volatile-facts rule. Versionless; the refresh agent NEVER edits these. If external evidence invalidates one, open an issue quoting the evidence — do not edit.
- **Mirrored volatile claims**: skillify does not track its own external sources. Its one volatile spot is marked in place:
  - the model guidance section in `references/eval-playbook.md` (marked `<!-- volatile -->`).

  It mirrors facts whose sources of truth are the agent-skills standards sources tracked in the **skill-maintainer** registry (`skills/repo-tooling/skill-maintainer/refresh/sources.json`). `sources` here is therefore deliberately empty, and the refresh runner treats this registry as valid with nothing to fetch.

## How to refresh

1. There is no deterministic fetch pass for this skill — an automated run against this registry selects zero sources and exits 0. Do not add sources here that duplicate skill-maintainer's; one registry per fact.
2. When skill-maintainer's standards sources drift (spec limits, harness listing budgets, model catalogs), that skill's refresh PR is the evidence. Update skillify's marked section to match **on a normal branch** (refresh branches are CI-restricted to `refresh/` metadata), referencing the skill-maintainer refresh PR as evidence.
3. If a future edit gives skillify a directly-owned external claim (its own vendor URL, pin, or protocol fact), stop mirroring for that claim: add a real entry to `sources.json` and mark the sentence `<!-- source: SOURCE-ID -->`.

## Never

- Never edit the phase model, checklist items, or verdict grammar in a refresh.
- Never hand-write checksum/version/timestamp values anywhere in this repo.
- Never duplicate a skill-maintainer source entry into this registry.
