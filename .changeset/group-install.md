---
"@vegastack/skills": minor
---

Install a whole family of skills in one command: `add`, `verify`, and `remove` now take `--group <name>` or `--all` as well as a single skill name.

- `npx @vegastack/skills add --group dev-skills` installs the ten dev-workflow skills; `--all` installs every skill worth having in a project.
- Exactly one selector per invocation — a skill name, `--group`, or `--all`. Combining two is an error, not a merge.
- A `--group` or `--all` install is one transaction: every skill is checked and staged before any is committed, so if one fails, none are installed and the destination is left as it was. `remove --group` runs every drift check before the first removal, for the same reason.
- `--all` skips the repo-only skills (`skill-maintainer`, `skillify`), which operate on the vegastack-skills repository itself and do nothing useful elsewhere. Naming one explicitly still installs it.
- `list` now groups its output and marks the repo-only skills.
- The installed layout is unchanged: skills still land flat at `<surface>/<name>/`, so a group never appears in an install path.
- The root README is rewritten around getting started, and `skill-maintainer` and `skillify` move into a `repo-tooling` group.
