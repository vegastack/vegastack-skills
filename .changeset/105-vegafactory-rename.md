---
"@vegastack/vegafactory": minor
---

The product is now VegaFactory: the package is `@vegastack/vegafactory`, the bin is `vegafactory`, and installer verbs live under a `skills` namespace.

- `@vegastack/skills` is orphaned with no shim, alias, or deprecation pointer — a direct cutoff.
- Installer verbs require the namespace: `vegafactory skills add|verify|list|doctor|remove`. A bare `vegafactory add …` is a usage error naming the new form.
- The top-level verbs `dispatch`, `service`, `status`, `worktree`, `sync`, `stats` and `dashboard` are reserved: they appear in usage and refuse until they land.
- The authored group `dev-skills` is now `dev`, so `--group dev-skills` becomes `--group dev`. Skill names are unchanged and the published bundle stays flat.
- Existing installs are replaced by re-running `npx @vegastack/vegafactory skills add --group dev --global --force`.
