<!-- vsk:v1 type=ledger branch=feat/skill-groups -->
## Ledger — feat/skill-groups
- Base: 1fa0ccc · worktree at `.claude/worktrees/feat-skill-groups` · baseline `bun run check` green (165 tests), `skill-integrity.json` snapshotted pre-change for the Task 7 acceptance diff
- Task 1: complete (commits 1fa0ccc..d081194) — `packages/cli/scripts/lib/skills.mjs`, 11 tests
- Task 2: complete (commits d081194..6a22e7d) — 5 tests; rebuilt `skill-integrity.json` diffs clean against the pre-change baseline
- Task 3: complete (commits 6a22e7d..b3dc1ef) — 3 tests
- Task 4: complete (commits b3dc1ef..e7a7911) — 18 tests; `structure.mjs check` passes on the repo in its still-flat state, which is the ungrouped path proving itself before any move
- Task 5: complete (commits e7a7911..cd85911) — 9 tests, including a round trip asserting `create-group`'s output is exactly what `checkStructure` accepts
- Task 6: complete (commits cd85911..a2b6b21) — 5 new tests, 28 in the skillify suite
- Task 7: complete (commits a2b6b21..2ef4d6b) — 128 files, all ten moves recorded as renames; `bun run check` green (216 tests) across the mixed layout; packed-tarball install of `dev-plan` by bare name verified clean on both agent surfaces
- Task 8: complete (commits 2ef4d6b..89da838) — counted evidence, not a trusted edit: the new discovery finds 12 registries where the old glob found 2
- Ruling: `discoverSkills` raises on a group child that is neither a skill nor a container of one, rather than ignoring it — why: silently skipping a stray directory is how a half-moved skill disappears from the bundle without an error — cost if wrong: a group may not hold non-skill subdirectories, which no current or planned group needs
- Ruling: added a `VSK_REPO_ROOT` override to `sync-skill.mjs` — why: the build script had no seam, so its group behavior could otherwise only be tested by mutating the real checkout — cost if wrong: one env var of new surface on a build-only script that never ships
- Ruling: set `allowJs: true` in `packages/cli/tsconfig.json` — why: the new `packages/cli/test/*.ts` files import the `.mjs` scripts they cover, and without it `tsc` fails TS7016 on every such import — cost if wrong: `tsc` now infers types from the scripts it already had to resolve; nothing in `src/` changes
- Ruling: `scaffold-skill.mjs` carries its own three-line `groupTitle()` rather than importing the repo's `readGroupDoc` — why: it ships inside the skillify skill and must stay dependency-free, so it cannot reach into `packages/cli` — cost if wrong: two small copies of one parse, each tested, and `structure.mjs check` fails loudly if they ever disagree about a section
- Ruling: the acceptance diff is "no bundle change from the move", not a literal byte-identical manifest — why: Task 6 deliberately changes two shipped skillify files, so their checksums must move — cost if wrong: none, and it is asserted precisely rather than eyeballed (bundle skill set identical, 12 bare-name keys, per-skill file lists unchanged, exactly two changed entries, both skillify's)
