# Release and rollback policy

Applies to `@vegastack/skills` published from this repository.

## Release flow (tag-driven)

1. Changes land on `main` with a changeset (`bunx changeset`) describing the semver impact — see [content-versioning.md](content-versioning.md) for how skill-content changes map to semver.
2. When releasing, a maintainer runs `bunx changeset version` (applies pending changesets to `packages/cli/package.json` and the changelog), then `bun install` so `bun.lock` does not go stale, and commits.
3. Tag the release commit `v<version>` and push the tag.
4. `.github/workflows/release.yml` runs on the tag: `bun run check`, `npm publish` via trusted publishing (OIDC, token-free, provenance by default), SBOM generation, and a GitHub release with the SBOM attached.

## First-publish bootstrap

Trusted publishing cannot be configured for a package that does not exist on the registry. The first-ever publish is manual:

1. Create a short-lived granular npm token scoped to the `@vegastack` org.
2. `cd packages/cli && npm publish --access public` (run `bun run check` first; `prepack` builds via Bun).
3. On npmjs.com, configure the trusted publisher for `@vegastack/skills`: GitHub Actions, repository `vegastack/vegastack-skills`, workflow `release.yml`.
4. Revoke the token. All subsequent releases go through the tag-driven workflow.

Do not pass `--provenance` explicitly anywhere — it is the default under trusted publishing and the explicit flag conflicts with trusted-publishing config (npm/cli#8036).

## Rollback

`npm unpublish` is limited to 72 hours and breaks consumers pinned to the bad version, so unpublish is not the rollback mechanism. Instead:

1. **Roll forward:** publish the previous known-good content as a **new patch version** (revert the offending commits on `main`, changeset, tag, release).
2. **Deprecate the bad version:** `npm deprecate @vegastack/skills@<bad-version> "Broken — use <new-version>"` so installs of it warn.
3. If the bad version leaked secrets or is actively harmful and it is still within 72 hours, unpublish it *in addition to* steps 1–2, never instead of them.

## Version identities

Two versions live in this repo and move independently:

- **Package version** (`packages/cli/package.json`, changesets-managed) — the npm release identity.
- **Foundation version** (currently `0.3.0`; in the profile schema and `foundation-compatibility.json`) — the skill-content contract deployed profiles are validated against.

Bumping the package must never invalidate deployed profiles. Details in [content-versioning.md](content-versioning.md).
