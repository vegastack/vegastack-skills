# Dev profile — vegastack/vegastack-skills

This file is the project's handbook and its only process document: short directional bullets, not prose. Skills read the section they need. When reality disagrees with a line, fix the line; when a gotcha or repeated instruction surfaces, fold ONE line into the right section — never append a log. A section left as TODO because its machinery didn't exist yet: re-run dev-setup detection when the machinery appears.

repo: vegastack/vegastack-skills · default branch main
stack: Bun monorepo — authored skills under skills/<name>/ or skills/<group>/<name>/ (one level, GROUP.md per group; the packaged bundle stays flat), @vegastack/skills installer under packages/cli (Node >= 24)
commands: test `bun test` · check `bun run check` · build `bun run build`
authority: CONTRIBUTING.md → this file → skill-maintainer's release-ops.md (expanded release/rename detail) → skill defaults

## Knobs

review: cross-agent-risky   # subagent | cross-agent-risky | cross-agent — codex-cli 0.149.1 present (verified 29-08-2026)
ui-evidence: none           # no UI in this repo
gates: 3                    # 3 = approve/PR/merge · 2 = approve + one "ship it" · 1 = direct-to-main, which main's branch protection makes unavailable here
tests: required             # scripts' deterministic branches; prose quality bar is the behavioral eval
skillspector-update: auto   # off | notify | auto — the CLI self-installs and self-upgrades through whatever channel holds it (uv here); a failed update falls back to the installed copy
skill-scan: packages/cli/skill   # the BUILT bundle — authored skills/ carries unpackaged tests/ fixtures that are deliberately adversarial and score higher than anything shipped; suppressions in .vegastack/skillspector-baseline.json
merge: rebase               # meaningful commits, linear history
branch: <type>/<slug>       # type: feat | fix | docs | chore | refactor — the only place this list lives
labels: needs-operator needs-plan ready working for-operator risky research quick-build full-plan epic   # epic label marks map parents (org has no native Epic issue type)
changelog: changesets
decisions: .vegastack/decisions.md
release: on-request         # only when the operator says "release" — covers everything merged since the last one (switched from per-merge for the v3 epic, operator 28-08-2026)
chronicle: on               # story entry per behavior-changing branch in .vegastack/chronicle.md

## Ship — what happens after merge, in order

Line prefixes: `auto:` (agent just does it) · `ask:` (operator's word first) · `guard:` (deterministic check run locally at this position; its release.yml copy is the backstop).

- auto: `bunx changeset version && bun install` → commit `chore: release @vegastack/skills <version>` on a `chore/release-<version>` branch → open its PR — the install is there to carry dependency changes; main is branch-protected with no admin exemption, so the bump lands by merge and never by direct push
- ask: merge the release PR — the version bump is the last reviewable moment before the tag publishes, so it takes the operator's word of its own, not the release word
- guard: changelog entry exists for the new version — `V=$(node -p "require('./packages/cli/package.json').version"); awk -v ver="$V" '$0=="## "ver{f=1;next} f&&/^## /{exit} f{print}' packages/cli/CHANGELOG.md | grep -q '[^[:space:]]'`
- guard: the published bundle carries no unsuppressed HIGH/CRITICAL skill finding — `bun run build && node skills/dev-skills/dev-review/scripts/skill-scan.mjs --json` — runs here because the tag push below is what publishes, and the bundle is what the world installs; a failure stops the sequence and goes to the operator
- auto: pull main, then tag and push exactly `v$(node -p "require('./packages/cli/package.json').version")` on the merged bump commit — covered by the operator's release word (release: on-request); tags are not branch-protected, so this push still works; deriving the tag from the manifest is the local tag↔version guard; the push triggers the pipeline (tag↔version guard → check → changelog guard → npm trusted publishing → SBOM → GitHub release whose notes lead with the changelog entry); watch it to green
- auto: confirm `npm view @vegastack/skills version` matches (registry propagation can lag — retry briefly) and `npx @vegastack/skills@latest list` shows the bundled skills; report old → new
- Publishing is tag-triggered trusted publishing (OIDC, token-free). **Provenance is currently OFF**: `release.yml` runs on `[self-hosted, vsk-runners-mac]` and passes `--no-provenance`, because npm refuses a provenance bundle built anywhere but a GitHub-hosted runner and those are billing-locked (#57) — 0.13.0, 0.16.0, 0.16.1 and 0.17.0 shipped without an attestation. Restore both together: drop the flag when `runs-on` returns to `ubuntu-latest`, never one without the other, and never pass `--provenance` explicitly (it conflicts with trusted-publishing config)
- Rollback is roll-forward: revert the offending commits through a PR (main is protected — there is no direct revert push, and a rollback is exactly when that discipline matters most), release previous-good as a new patch, `npm deprecate` the bad version ("Broken — use <new>"); unpublish only for leaked secrets within 72h, in addition to roll-forward, never instead
- Content semver: new references/sections/recorded decisions/skill renames = minor · factual refreshes, wording, test-only = patch · removing a skill, weakening a normative rule, breaking the per-project profile format = major, and major is otherwise the operator's explicit call (pre-1.0 with zero deployed profile consumers, a profile-format break may ship minor — recorded decision 28-08-2026); installer changes follow ordinary semver on the same version, a release takes the higher bump — detail in skill-maintainer's release-ops.md

## Verify — how to see it working (pre-merge)

- `bun run check` is the whole local verification (validate + tests + lint + typecheck); CI adds a packed-tarball install smoke test
- Skill scanning is separate from `check` because it needs Python 3.12 + SkillSpector, while `check` must stay Bun+Node only: `bun run build && node skills/dev-skills/dev-review/scripts/skill-scan.mjs --json` — build first, the knob names the built bundle and `.vegastack/skillspector-baseline.json` is picked up by convention. Exit 2 blocks the hand-back; a new suppression needs the operator's word, never a widened rule to reach green

## Environments

- npm registry via tag-triggered trusted publishing — no local npm credentials exist or are needed
- GitHub Actions runs CI, release, and the weekly refresh (refresh/** branches are CI-restricted to refresh metadata)
- main is branch-protected: a PR is required, force-pushes and deletion are blocked, linear history and conversation resolution are enforced, and admins are NOT exempt — so every path to main, agent or human, goes through a PR. **`check (node 24)` is a required status check** (strict: a branch must be up to date with main before merging), enabled 02-09-2026 once `ci.yml` moved to `[self-hosted, vsk-runners-mac]` and started passing again (#87). The runners are the dependency now: if both are offline, nothing merges — check `gh api repos/vegastack/vegastack-skills/actions/runners` before assuming a stuck PR is a code problem

## Decisions

Record a decision only when it is directional — it steers work beyond this issue: a real alternative was rejected; it constrains work not yet written; and no dev.md line, lint rule, or guard can enforce it instead (if one can, write the rule). Feature requests, one-off fixes, and routine implementation choices never qualify. Every entry needs the user's explicit yes. One line in the register (`decisions:` knob), append-only, no other metadata:

- DD-MM-YYYY (github-username) — the decision

## Stop and ask

Dark execution ends and the operator decides when work would involve: a change of scope or product behavior, a significant new dependency or runtime, spending money, anything destructive or touching production, or a blocker the brief cannot resolve. Nothing ships without the operator's explicit instruction — see the AGENTS.md dev section.

## Project rules

- Every behavior-changing PR carries its changeset, written directly as `.changeset/<slug>.md` (bump per the content-semver bullet in Ship); contributors never bump versions
- The single version lives in `packages/cli/package.json` (changesets-managed); the workspace root package.json is pinned at `0.0.0` — a placeholder `npm sbom` requires (purls need a version), never bumped, never a release identity; neither is the version `bun.lock` records for the workspace, which does not follow a version bump and is never hand-edited (mechanics: skill-maintainer's release-ops.md)
- Every skill change goes through skillify's contract (8-item checklist, eval before tests)
- A repo-wide prose or format sweep must include `assets/*.template`: dev-setup's profile template and dev-review's known-patterns template carry normative format strings that a `--include="*.md"` grep silently misses
- Never commit generated files: dist/, packages/cli/skill/, skill-integrity.json
- Never hand-edit refresh checksums/versions/timestamps — runner only
