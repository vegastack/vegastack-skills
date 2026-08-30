<!-- vsk:v1 type=ledger branch=feat/skill-groups -->
## Ledger — feat/skill-groups
- Base: 1fa0ccc · worktree at `.claude/worktrees/feat-skill-groups` · baseline `bun run check` green (165 tests), `skill-integrity.json` snapshotted pre-change for the Task 7 acceptance diff
- Task 1: complete (commits 1fa0ccc..d081194) — `packages/cli/scripts/lib/skills.mjs`, 11 tests
- Task 2: complete (commits d081194..6a22e7d) — 5 tests; rebuilt `skill-integrity.json` diffs clean against the pre-change baseline
- Ruling: `discoverSkills` raises on a group child that is neither a skill nor a container of one, rather than ignoring it — why: silently skipping a stray directory is how a half-moved skill disappears from the bundle without an error — cost if wrong: a group may not hold non-skill subdirectories, which no current or planned group needs
- Ruling: added a `VSK_REPO_ROOT` override to `sync-skill.mjs` — why: the build script had no seam, so its group behavior could otherwise only be tested by mutating the real checkout — cost if wrong: one env var of new surface on a build-only script that never ships
