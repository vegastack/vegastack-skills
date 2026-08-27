# Dev profile — vegastack/vegastack-skills

This file is the project's handbook: short directional bullets, not prose. Skills read the section they need. When reality disagrees with a line, fix the line; when a gotcha or repeated instruction surfaces, fold ONE line into the right section — never append a log.

repo: vegastack/vegastack-skills · default branch main
stack: Bun monorepo — authored skills under skills/, @vegastack/skills installer under packages/cli (Node >= 24)
commands: test `bun test` · check `bun run check` · build `bun run build`

## Knobs

review: subagent            # subagent | cross-agent | cross-agent-risky
ui-evidence: none           # no UI in this repo
gates: 3                    # 3 = approve/PR/merge · 2 = approve/ship
tests: required             # scripts' deterministic branches; prose quality bar is the behavioral eval
merge: rebase               # meaningful commits, linear history
branch: <type>/<slug>       # type: feat | fix | docs | chore | refactor
decisions: docs/decisions.md
release: on-request         # releases batch up until the operator says "release"

## Ship — what happens after merge, in order

- auto: content PRs carry their changesets; contributors never bump versions (docs/policies/release-and-rollback.md)
- On "release":
- auto: `bunx changeset version && bun install` → commit `chore: release @vegastack/skills <version>` → push main
- auto: `git tag v<version> && git push origin v<version>` — the tag triggers the pipeline (check → tag↔version guard → npm trusted publishing → SBOM → GitHub release); watch it to green
- auto: confirm `npm view @vegastack/skills version` matches; report old → new version
- Rollback is roll-forward: publish previous-good as a new patch + `npm deprecate` the bad version

## Verify — how to see it working

- `bun run check` is the whole local verification (validate + tests + lint + typecheck); CI adds a packed-tarball install smoke test
- After a release: `npx @vegastack/skills@latest list` shows the bundled skills

## Environments

- npm registry via tag-triggered trusted publishing — no local npm credentials exist or are needed
- GitHub Actions runs CI, release, and the weekly refresh (refresh/** branches are CI-restricted to refresh metadata)

## Project rules

- CONTRIBUTING.md and docs/policies/ are authoritative over any skill's advice on repo process
- Every skill change goes through skillify's contract (8-item checklist, eval before tests)
- Never commit generated files: dist/, packages/cli/skill/, skill-integrity.json
- Never hand-edit refresh checksums/versions/timestamps — runner only
