---
"@vegastack/skills": patch
---

`skillify`'s scaffolder now refuses a repo it cannot wire, instead of creating the tree and reporting success.

- A missing `README.md` or `packages/cli/packaging.json` is a pre-flight refusal that writes nothing and exits 1, naming the path and what it is needed for. Previously both degraded to a `skipped:` status with exit 0, leaving a skill that `structure.mjs check` immediately blocks.
- The refusal applies to dry runs too, matching the existing Skills-table refusal.
- `.changeset/` still degrades to `skipped:` — a missing changeset breaks no check — and `wireSkill` called on its own stays permissive, since it is a wiring primitive rather than a tree creator.
