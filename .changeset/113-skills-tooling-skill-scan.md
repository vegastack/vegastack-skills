---
"@vegastack/vegafactory": minor
---

The skill scanner is now its own installable skill, `skill-scan`, in a new `skills-tooling` group.

- New group `skills-tooling` — tools that work on agent skills themselves. It is installable everywhere, so `skills add --all` brings `skill-scan` along; `skills add --group skills-tooling` installs the group on its own.
- `skill-scan` owns the guard (`scripts/skill-scan.mjs`), its SkillSpector library (`scripts/lib/skillspector.mjs`), the baseline discipline, the `skill-scan:` and `skillspector-update:` knobs, and the six SkillSpector refresh sources — all moved from `dev-review` with their tests.
- `dev-review` narrows to code review. It keeps its Security axis, which now consumes the scan's report as an input rather than running the scan; its refresh contract returns to an evergreen waiver.
- dev-implement's Verify gate now runs `node <path-to-skill-scan>/scripts/skill-scan.mjs --json`, and dev-setup says that a project setting a `skill-scan:` root installs the `skill-scan` skill.
- Migration: a project already setting `skill-scan:` should install `skill-scan` alongside `dev-review` — `vegafactory skills add skill-scan`. Nothing the scanner checks, and none of the knob defaults, changed.
