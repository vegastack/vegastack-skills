# Contributing

## Dev setup

Requirements: [Bun](https://bun.sh) 1.3.14 (pinned in `packageManager`) and Node >= 20.11.

```sh
bun install --frozen-lockfile
bun run check      # validate:skill + test + lint + typecheck
bun run build      # builds the CLI and syncs the skill copy into packages/cli
```

`bun run check` must pass before every PR. CI runs it on a Node 20.11/22/24 matrix plus a packed-tarball install smoke test.

## Repo layout

| Path | What it is |
|---|---|
| `skills/` | Authored skill content — the single source of truth. Edit here. |
| `skills/vegastack-arch-guardian/` | The arch-guardian skill: `SKILL.md`, references, deterministic check scripts, tests. |
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

Then: add the skill's packaged files to the allowlist in `packages/cli/scripts/sync-skill.mjs` (the build fails loudly on unlisted files), add a row to the root README skills table, and note that the installer's multi-skill generalization is tracked for the second skill — coordinate before shipping it.

## Adding or modifying rules

- **Rule IDs are stable and permanent.** Never renumber or reuse an ID. Removing or renaming a rule ID is a MAJOR content change — see [docs/policies/content-versioning.md](docs/policies/content-versioning.md).
- Rules use `MUST` / `MUST NOT` / `SHOULD` / `MAY` and are written in the machine-extracted format the check scripts and `rule-model.json` rely on — follow the existing entries exactly; the corpus tests will fail on format drift.
- New rules are MINOR; changing a `MUST` to permit what it previously forbade is MAJOR.
- Keep volatile facts (version pins, vendor mechanism names) in their tagged locations so the refresh system can track them.

## Refresh PRs

Branches named `refresh/**` are reserved for the automated freshness loop and are CI-restricted to `skills/*/refresh/` and `skills/*/references/foundation-compatibility.json`. Human content changes go on normal branches.

## Dependency note: jsdom and mermaid

The root devDependencies `jsdom` and `mermaid` look unused by the app code, but they are loaded by `skills/vegastack-arch-guardian/scripts/verify-corpus.mjs` for formal Mermaid diagram parsing during `bun run check`. Do not remove them in a dependency cleanup — `check` will break.

## Releases

Versioning and publishing are maintainer-driven via changesets and tag-triggered CI — see [docs/policies/release-and-rollback.md](docs/policies/release-and-rollback.md). Contributors do not bump versions in PRs.
