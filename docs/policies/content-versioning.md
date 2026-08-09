# Content versioning policy

Skill content (rules, references, workflows) is versioned with semver via the `@vegastack/skills` package version. This policy defines what counts as breaking for *content*, since consumers depend on rule IDs and rule strength, not on an API surface.

## Semver mapping for skill content

**MAJOR**
- Removing or renaming a rule ID. IDs are stable and permanent; never renumber or reuse one.
- Changing a `MUST`/`MUST NOT` rule so that it permits something it previously forbade (weakening a normative guarantee).

**MINOR**
- Adding new rules or new rule IDs.
- Adding new references or reference sections.
- Loosening ceremony (shorter required response forms, fewer required fields) without weakening any `MUST`.
- Tightening a `SHOULD` to a `MUST` (consumers may see new findings, but nothing previously forbidden becomes allowed).

**PATCH**
- Factual refreshes: version pins, vendor mechanism names, URLs, checksums in the source registry.
- Typos, wording clarifications that do not change normative meaning.
- Test/fixture-only changes.

Installer/CLI changes follow ordinary semver on the same package version; the release takes the highest bump either side requires.

## Two decoupled version identities

| Identity | Current | Lives in | Governs |
|---|---|---|---|
| Package version | see `packages/cli/package.json` | `packages/cli/package.json` (changesets) | npm releases of installer + content snapshot |
| Foundation version | `0.4.0` | `profile-tool.mjs` draft default, `references/foundation-compatibility.json` | the profile/schema contract that deployed `.vegastack/architecture` profiles are validated against (profile schema v4; `foundationVersion` optional in profiles) |

They move independently and must never be conflated:

- Bumping the **package** (even MAJOR) must never invalidate a deployed profile. Profiles bind to the foundation version.
- Bumping the **foundation** version is a content-contract event: it requires a compatibility entry in `foundation-compatibility.json` describing how existing baselines are treated, and at minimum a MINOR package release to ship it.
- Each identity has a single source of truth; do not introduce additional copies of either number.
