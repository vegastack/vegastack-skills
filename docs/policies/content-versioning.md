# Content versioning policy

Skill content (advisory prose, decision tables, references) is versioned with semver via the
single `@vegastack/skills` package version — there is no separate content-contract version to
track. This policy defines what counts as breaking for *content*.

## Semver mapping for skill content

**MAJOR**
- Removing or renaming a skill.
- A breaking change to the per-project profile format (e.g. `.vegastack/arch.md`'s expected
  shape) that invalidates existing committed profiles.

**MINOR**
- Adding a new reference file or a new section within one.
- Adding or changing a recorded decision (e.g. a new "use/not/why" row, a new red line).

**PATCH**
- Factual refreshes: pinned-fact updates, version pins, vendor mechanism names, source URLs,
  checksums in the refresh registry.
- Wording clarifications that do not change the recorded decision.
- Test/fixture-only changes.

Installer/CLI changes follow ordinary semver on the same package version; a release takes the
highest bump either side requires.

## One version identity

There is a single source of truth: `packages/cli/package.json` (changesets-managed). No skill
tracks a separate content-contract or foundation version, and no per-project profile carries a
schema version to validate against.
