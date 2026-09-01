---
"@vegastack/skills": patch
---

Documentation now recommends the global install: `add --group dev-skills --global` is the headline command in the root README, the installer README, and every dev-skill walkthrough.

- Global installs once per machine and covers every project; it is also the only mode that can target all three runtimes, since Hermes has no project-level discovery. Project-local stays documented for repositories that should carry their own copy.
- Both READMEs now state that a project-local copy does **not** override a global one in Claude Code — personal skills take precedence over project skills — so the two should not be installed together for the same skill.
- `skill-maintainer` and `skillify` are named as the deliberate exception: they are repo-only, so a global copy would trigger everywhere.
- The upgrade path is documented for the first time (`add … --global --force`, with why `--force` is needed), alongside `verify`, `remove`, and `doctor --global` — which skips the per-project `.vegastack/dev.md` check.
- Every fenced command block is independently pasteable: alternatives no longer share a fence with the command you actually want, and the skill-scan invocation no longer hardcodes a project-local Claude Code path.
- `skillify`'s scaffolded-README template follows: a new skill's install block is generated with `--global`, and the family-install alternative gets its own fence instead of sharing one with the single-skill command.
- Root README gains npm/CI/Node/license badges, a table of contents, a scannable requirements table, a numbered quick start, and a contributing-and-support section; `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) is added and linked from `CONTRIBUTING.md`.
