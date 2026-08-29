# Release, rename, and rollback operations

The expanded release/rename/rollback detail behind the `## Ship` runbook and content-semver bullet in `.vegastack/dev.md` at the repo root. dev.md is the canonical process doc and wins on any disagreement; this file only elaborates it and must never contradict it.

## Semver for skill content

Content is advisory prose and decision tables — no rule IDs, no machine-extracted rule format.

| Bump | Content change |
|---|---|
| MAJOR | Removing a skill. A breaking change to the per-project profile format (`.vegastack/dev.md`) that invalidates existing committed profiles — the operator may also declare any other change major. |
| MINOR | Renaming a skill (default — the operator declares major when the break warrants it). New reference file or reference section. New or changed recorded decision (e.g. a new "use/not/why" row, a new red line). New skill. |
| PATCH | Factual refreshes: pinned-fact updates, version pins, vendor mechanism names, URLs, registry checksums. Wording clarifications that don't change the recorded decision. Test/fixture-only changes. |

Installer/CLI changes follow ordinary semver on the same package version; a release takes the highest bump either side requires.

## One version identity

There is a single source of truth: the **package version** (`packages/cli/package.json`,
changesets-managed) — the npm release identity for the installer and every bundled skill's
content snapshot. No skill tracks a separate content-contract version, and no per-project
profile carries a schema version to validate against.

## Release flow (tag-driven)

1. Every PR that changes released behavior lands with a changeset — a `.changeset/<slug>.md` written directly, since the `changeset` add prompt is interactive (`bunx changeset version` at release time is the only CLI use) — whose bump follows the table above and whose shape follows dev-implement's changelog rule.
2. Maintainer, at release time: `bunx changeset version` (applies changesets to `packages/cli/package.json` and the changelog), then `bun install` so `bun.lock` does not go stale, commit. The release record is `packages/cli/CHANGELOG.md`, changesets-written — never by hand; the root `CHANGELOG.md` is the frozen pre-0.3.0 record pointing there.
3. Tag the release commit `v<version>`, push the tag.
4. The release workflow runs on the tag: `bun run check`, tag↔version guard, `npm publish` via trusted publishing (OIDC, token-free, provenance by default; idempotently skipped if already on the registry), SBOM, GitHub release. Never pass `--provenance` explicitly — it conflicts with trusted-publishing config.

Contributors do not bump versions in PRs; releases are maintainer-driven.

## Rollback

`npm unpublish` is limited to 72 hours and breaks pinned consumers — it is not the rollback mechanism.

1. **Roll forward:** revert the offending commits on `main`, changeset, tag, release the previous known-good content as a **new patch version**.
2. **Deprecate the bad version:** `npm deprecate @vegastack/skills@<bad> "Broken — use <new>"`.
3. Unpublish only if the bad version leaked secrets or is actively harmful, still within 72 hours, and always *in addition to* steps 1–2, never instead.

## Rename a skill

Skill names are consumer-facing identifiers — treat a rename as a stable-ID break:

1. Rename the directory and the frontmatter `name` in the same commit — they must always stay equal.
2. Update every wiring point in the same PR: the skill's entry in `packages/cli/packaging.json`, the root README skills table row, and any cross-skill or docs links.
3. Changeset: MINOR by default — major only when the operator declares it. Either way, note the migration in `CHANGELOG.md`: copies installed under the old name are orphaned, and installer operations addressed to the old name stop resolving once the shipped manifest no longer knows it.
4. Registry source IDs inside `refresh/sources.json` are skill-internal and unaffected, but every `affected` ref must still resolve to a real reference in the renamed tree.
5. Re-run `node packages/cli/scripts/validate-skill.mjs skills/<new-name>` and the skill's tests — name/directory equality is validated.

## Deprecate / remove a skill

1. Announce deprecation in the root README table and `CHANGELOG.md` at least one release before removal when practical.
2. Removal: delete `skills/<name>/`, remove its allowlist entries and README row, MAJOR changeset with migration notes.
3. Removing a skill in a new MAJOR does **not** deprecate previously published package versions — `npm deprecate` only versions that are themselves broken.

## Refresh branches

Branches named `refresh/**` are reserved for the automated freshness loop and are CI-restricted to `skills/*/refresh/`. Human content changes go on normal branches. Never hand-edit checksums/versions/timestamps anywhere — CI re-fetches claimed baselines, so hand-edited values cannot merge.
