---
"@vegastack/vegafactory": minor
---

Skill README file tables are generated from `packages/cli/packaging.json`, and the structure check enforces them.

- New `node packages/cli/scripts/readme-sync.mjs [--write]` (`bun run readme:sync`) renders each skill README's "What's in this skill" table from the skill's packaging entry — packaging order, purposes preserved by path, a placeholder purpose on a newly packaged file, a fixed `tests/` row, and an `evals/` row when that directory exists. Dry run by default, atomic write, refuses symlinked READMEs, and stops without writing when a README carries a row it cannot classify.
- `structure.mjs check` (a `bun run check` stage) now blocks when a skill README's table is not what `readme-sync` would render, and warns on any placeholder purpose left behind.
- All twelve skill READMEs regenerated; skillify's README template ships in sync with the scaffolder's default packaging entry; skill-maintainer's operating rule 8 names the sync command.
