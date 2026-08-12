# Contributing

## Dev setup

Requirements: [Bun](https://bun.sh) 1.3.14 (pinned in `packageManager`) and Node >= 24.

```sh
bun install --frozen-lockfile
bun run check      # validate:skill + test + lint + typecheck
bun run build      # builds the CLI and syncs the skill copy into packages/cli
```

`bun run check` must pass before every PR. CI runs it on Node 24 plus a packed-tarball install smoke test.

## Repo layout

| Path | What it is |
|---|---|
| `skills/` | Authored skill content — the single source of truth. Edit here. |
| `skills/architect/` | The architect skill: `SKILL.md`, decision-table references, per-project profile template, tests. |
| `skills/*/refresh/` | Freshness contract: source registry and refresh instructions consumed by the weekly refresh automation. |
| `packages/cli/` | The `@vegastack/skills` installer. `packages/cli/skill/` and `skill-integrity.json` are **generated at build** from `skills/` — never edit or commit them. |
| `docs/policies/` | Release/rollback and content-versioning policies. |

## Never commit generated files

`dist/`, `packages/cli/skill/`, `packages/cli/skill-integrity.json`, `work/`, and `.vegastack/evidence-*.json` are build or tooling outputs. They are gitignored; `prepack` regenerates what the package needs. PRs that add them will be rejected.

## Adding a new skill

Every skill lives at `skills/<name>/` and is self-contained:

| File/dir | Required | Purpose |
|---|---|---|
| `SKILL.md` | yes | Agent entry point — valid frontmatter (`name`, `description`), progressive routing to references |
| `README.md` | yes | Human/agent walkthrough of the whole skill (repo-side only; not packaged) |
| `references/` | yes | Normative content, loaded on demand |
| `scripts/` | if applicable | Deterministic, dependency-free Node scripts |
| `assets/` | if applicable | Templates, schemas, examples |
| `tests/` | yes | Bun tests (never packaged) |
| `refresh/sources.json` + `refresh/REFRESH.md` | yes | Freshness contract for the weekly refresh automation |
| `agents/openai.yaml` | for Codex | Codex interface metadata |

Then: add the skill's packaged files to the allowlist in `packages/cli/scripts/sync-skill.mjs` (the build fails loudly on unlisted files), add a row to the root README skills table, and add a per-skill packaging allowlist entry — the installer is multi-skill and bundles every listed skill automatically.

## Adding or modifying content

Skill content is advisory prose and decision tables, not a rule corpus — there are no rule IDs
and no machine-extracted rule format to follow.

- New reference files or reference sections, and new/changed recorded decisions (e.g. a new
  "use/not/why" row, a new red line) are MINOR content changes — see
  [docs/policies/content-versioning.md](docs/policies/content-versioning.md).
- Factual refreshes and non-normative wording clarifications are PATCH.
- Removing or renaming a skill, or a breaking change to a per-project profile format, is MAJOR.
- Keep volatile facts (version pins, vendor mechanism names) in `pinned-facts.md`-style dated
  entries so the refresh system can track them.

## Refresh PRs

Branches named `refresh/**` are reserved for the automated freshness loop and are CI-restricted to `skills/*/refresh/`. Human content changes go on normal branches.

## Releases

Versioning and publishing are maintainer-driven via changesets and tag-triggered CI — see [docs/policies/release-and-rollback.md](docs/policies/release-and-rollback.md). Contributors do not bump versions in PRs.
