# Dev profile — vegastack/vegastack-skills

This file is the project's handbook and its only process document: short directional bullets, not prose. Skills read the section they need. When reality disagrees with a line, fix the line; when a gotcha or repeated instruction surfaces, fold ONE line into the right section — never append a log. A section left as TODO because its machinery didn't exist yet: re-run dev-setup detection when the machinery appears.

repo: vegastack/vegastack-skills · default branch main
stack: Bun monorepo — authored skills under skills/<name>/ or skills/<group>/<name>/ (one level, GROUP.md per group; the packaged bundle stays flat), @vegastack/skills installer under packages/cli (Node >= 24)
commands: test `bun test` · check `bun run check` · build `bun run build`
authority: CONTRIBUTING.md → this file → skill-maintainer's release-ops.md (expanded release/rename detail) → skill defaults

## Knobs

review: cross-agent-risky   # subagent | cross-agent-risky | cross-agent — codex-cli 0.149.1 present (verified 29-08-2026)
ui-evidence: none           # no UI in this repo
gates: 3                    # 3 = approve/PR/merge · 2 = approve + one "ship it" · 1 = direct-to-main
tests: required             # scripts' deterministic branches; prose quality bar is the behavioral eval
merge: rebase               # meaningful commits, linear history
branch: <type>/<slug>       # type: feat | fix | docs | chore | refactor — the only place this list lives
labels: needs-operator needs-plan ready working for-operator risky research quick-build full-plan epic   # epic label marks map parents (org has no native Epic issue type)
changelog: changesets
decisions: .vegastack/decisions.md
release: on-request         # only when the operator says "release" — covers everything merged since the last one (switched from per-merge for the v3 epic, operator 28-08-2026)
chronicle: on               # story entry per behavior-changing branch in .vegastack/chronicle.md

## Ship — what happens after merge, in order

Line prefixes: `auto:` (agent just does it) · `ask:` (operator's word first) · `guard:` (deterministic check run locally at this position; its release.yml copy is the backstop).

- auto: `bunx changeset version && bun install` → commit `chore: release @vegastack/skills <version>` → push main — the install is there to carry dependency changes
- guard: changelog entry exists for the new version — `V=$(node -p "require('./packages/cli/package.json').version"); awk -v ver="$V" '$0=="## "ver{f=1;next} f&&/^## /{exit} f{print}' packages/cli/CHANGELOG.md | grep -q '[^[:space:]]'`
- auto: tag and push exactly `v$(node -p "require('./packages/cli/package.json').version")` — covered by the operator's release word (release: on-request); deriving the tag from the manifest is the local tag↔version guard; the push triggers the pipeline (tag↔version guard → check → changelog guard → npm trusted publishing → SBOM → GitHub release whose notes lead with the changelog entry); watch it to green
- auto: confirm `npm view @vegastack/skills version` matches (registry propagation can lag — retry briefly) and `npx @vegastack/skills@latest list` shows the bundled skills; report old → new
- Publishing is tag-triggered trusted publishing (OIDC, token-free, provenance by default — never pass `--provenance` explicitly, it conflicts with trusted-publishing config)
- Rollback is roll-forward: revert on main, release previous-good as a new patch, `npm deprecate` the bad version ("Broken — use <new>"); unpublish only for leaked secrets within 72h, in addition to roll-forward, never instead
- Content semver: new references/sections/recorded decisions/skill renames = minor · factual refreshes, wording, test-only = patch · removing a skill, weakening a normative rule, breaking the per-project profile format = major, and major is otherwise the operator's explicit call (pre-1.0 with zero deployed profile consumers, a profile-format break may ship minor — recorded decision 28-08-2026); installer changes follow ordinary semver on the same version, a release takes the higher bump — detail in skill-maintainer's release-ops.md

## Verify — how to see it working (pre-merge)

- `bun run check` is the whole local verification (validate + tests + lint + typecheck); CI adds a packed-tarball install smoke test

## Environments

- npm registry via tag-triggered trusted publishing — no local npm credentials exist or are needed
- GitHub Actions runs CI, release, and the weekly refresh (refresh/** branches are CI-restricted to refresh metadata)

## Decisions

Record a decision only when it is directional — it steers work beyond this issue: a real alternative was rejected; it constrains work not yet written; and no dev.md line, lint rule, or guard can enforce it instead (if one can, write the rule). Feature requests, one-off fixes, and routine implementation choices never qualify. Every entry needs the user's explicit yes. One line in the register (`decisions:` knob), append-only, no other metadata:

- DD-MM-YYYY operator (github-username) — the decision

## Stop and ask

Dark execution ends and the operator decides when work would involve: a change of scope or product behavior, a significant new dependency or runtime, spending money, anything destructive or touching production, or a blocker the brief cannot resolve. Nothing ships without the operator's explicit instruction — see the AGENTS.md dev section.

## Project rules

- Every behavior-changing PR carries its changeset, written directly as `.changeset/<slug>.md` (bump per the content-semver bullet in Ship); contributors never bump versions
- The single version lives in `packages/cli/package.json` (changesets-managed); the workspace root package.json is pinned at `0.0.0` — a placeholder `npm sbom` requires (purls need a version), never bumped, never a release identity; neither is the version `bun.lock` records for the workspace, which does not follow a version bump and is never hand-edited (mechanics: skill-maintainer's release-ops.md)
- Every skill change goes through skillify's contract (8-item checklist, eval before tests)
- Never commit generated files: dist/, packages/cli/skill/, skill-integrity.json
- Never hand-edit refresh checksums/versions/timestamps — runner only
