# Release, rename, and rollback operations

Condensed operational playbook. The authoritative policies live at the repo root — `docs/policies/release-and-rollback.md` and `docs/policies/content-versioning.md` — and this file must never contradict them; when in doubt, they win.

## Semver for skill content

Consumers depend on rule IDs and rule strength, not an API surface.

| Bump | Content change |
|---|---|
| MAJOR | Removing or renaming a rule ID (IDs are stable and permanent — never renumber or reuse). Changing a `MUST`/`MUST NOT` so it permits something previously forbidden. Removing or renaming a skill. |
| MINOR | New rules or rule IDs. New references or reference sections. New skill. Loosening ceremony without weakening a `MUST`. Tightening a `SHOULD` to a `MUST`. |
| PATCH | Factual refreshes: version pins, vendor mechanism names, URLs, registry checksums. Typos and non-normative wording. Test/fixture-only changes. |

Installer/CLI changes follow ordinary semver on the same package version; a release takes the highest bump either side requires.

## Two version identities — never conflate

| Identity | Lives in | Governs |
|---|---|---|
| Package version | `packages/cli/package.json` (changesets) | npm releases of installer + content snapshot |
| Foundation version | profile schema const, `profile-tool.mjs` default, `foundation-compatibility.json` | the profile/schema contract deployed `.vegastack/architecture` profiles validate against |

- Bumping the **package** (even MAJOR) must never invalidate a deployed profile — profiles bind to the foundation version.
- Bumping the **foundation** version is a content-contract event: it requires a compatibility entry describing how existing baselines are treated, and at minimum a MINOR package release.
- Each identity has one source of truth; never introduce additional copies of either number.

## Release flow (tag-driven)

1. Every PR that changes released behavior lands with a changeset (`bunx changeset`) whose bump follows the table above.
2. Maintainer, at release time: `bunx changeset version` (applies changesets to `packages/cli/package.json` and the changelog), then `bun install` so `bun.lock` does not go stale, commit. Root `CHANGELOG.md` gets a human-readable entry for every release.
3. Tag the release commit `v<version>`, push the tag.
4. The release workflow runs on the tag: `bun run check`, tag↔version guard, `npm publish` via trusted publishing (OIDC, token-free, provenance by default; idempotently skipped if already on the registry), SBOM, GitHub release. Never pass `--provenance` explicitly — it conflicts with trusted-publishing config.

Contributors do not bump versions in PRs; releases are maintainer-driven.

## Rollback

`npm unpublish` is limited to 72 hours and breaks pinned consumers — it is not the rollback mechanism.

1. **Roll forward:** revert the offending commits on `main`, changeset, tag, release the previous known-good content as a **new patch version**.
2. **Deprecate the bad version:** `npm deprecate @vegastack/skills@<bad> "Broken — use <new>"`.
3. Unpublish only if the bad version leaked secrets or is actively harmful, still within 72 hours, and always *in addition to* steps 1–2, never instead.

## Rename a skill

Derived from the stable-ID logic in content-versioning (skill names are consumer-facing identifiers like rule IDs):

1. Rename the directory and the frontmatter `name` in the same commit — they must always stay equal.
2. Update every wiring point in the same PR: the packaging allowlist in `packages/cli/scripts/sync-skill.mjs`, the root README skills table row, and any cross-skill or docs links.
3. Changeset: MAJOR. Note the migration in `CHANGELOG.md`: copies installed under the old name are orphaned, and installer operations addressed to the old name stop resolving once the shipped manifest no longer knows it.
4. Registry source IDs inside `refresh/sources.json` are skill-internal and unaffected, but every `affected` ref must still resolve to a real reference in the renamed tree.
5. Re-run `node packages/cli/scripts/validate-skill.mjs skills/<new-name>` and the skill's tests — name/directory equality is validated.

## Deprecate / remove a skill

1. Announce deprecation in the root README table and `CHANGELOG.md` at least one release before removal when practical.
2. Removal: delete `skills/<name>/`, remove its allowlist entries and README row, MAJOR changeset with migration notes.
3. Removing a skill in a new MAJOR does **not** deprecate previously published package versions — `npm deprecate` only versions that are themselves broken.

## Refresh branches

Branches named `refresh/**` are reserved for the automated freshness loop and are CI-restricted to `skills/*/refresh/` and `skills/*/references/foundation-compatibility.json`. Human content changes go on normal branches. Never hand-edit checksums/versions/timestamps anywhere — CI re-fetches claimed baselines, so hand-edited values cannot merge.
