---
"@vegastack/skills": minor
---

Authored skills may now be grouped one level deep under `skills/<group>/`, and the ten dev-workflow skills have moved into a `dev-skills` group.

- Installed layout and install commands are unchanged: the packaged bundle stays flat, keyed by bare skill name, so `npx @vegastack/skills add dev-plan` is exactly what it was and existing installations are untouched.
- `skillify`'s scaffolder gains `--group <name>`, which places a new skill in an existing group and writes its README row into that group's section. An unknown group is refused rather than created.
- `skill-maintainer` gains the group rules and a create-or-maintain-a-group workflow, backed by a new repo-side structure check that blocks on illegal depth, name collisions, a malformed `GROUP.md`, missing skill meta files, packaging entries that disagree with the authored tree, and README rows that are absent, mispathed, or in the wrong section.
- Ungrouped skills at `skills/<name>/` remain fully supported; `skill-maintainer` and `skillify` deliberately stay ungrouped.
