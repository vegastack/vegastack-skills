# vegastack-skills — agent guide

<!-- vsk-dev:start -->
## Dev workflow

Read `.vegastack/dev.md` for this project's stack, commands, and workflow knobs. The workflow's stages are the dev-family skills: dev-setup (bootstrap) · dev-intake (ideas to briefs) · dev-plan (approved briefs to plans) · dev-architect (stack judgment) · dev-implement (dark builds) · dev-debug (reproduce-first fixes) · dev-review (independent review) · dev-ship (gated landing) · dev-status (the operator's board) · dev-chronicle (the project's story).

Work flows through GitHub issues. An issue labeled `ready` carries the user's recorded approval and a complete brief — implement it end to end per the `dev-implement` skill, post the evidence in the issue, and hand it back with `for-operator`. Start only on `ready` issues. The workflow vocabulary is the labels dev.md's `labels:` knob names (defaults — state: `needs-operator` waiting on the user → `needs-plan` awaiting the planning stage → `ready` approved → `working` claimed → `for-operator` result awaiting review; modifiers: `risky` for security/money/data/production, scope `research`/`quick-build`/`full-plan`, `epic` on map parents) — use them and no others. Artifact formats (comment markers, ledger, revisions, operator identity) follow the dev-setup skill's `references/conventions.md`.

**Nothing ships without the operator's explicit instruction** — no push to the default branch, merge, tag, publish, or deploy on green checks, schedules, or standing approvals alone. The `gates` knob in dev.md changes how many of those actions one instruction covers, never whether an instruction is needed. Behavior changes carry their changelog entry per dev.md's `changelog:` knob before hand-back; after merge, the `## Ship` runbook in dev.md says what happens next and which steps need the operator's word.

Directional decisions — see `## Decisions` in dev.md for what qualifies — get one dated line in the register dev.md names. When any session, skill-driven or not, settles a choice that passes that test, propose the line and add it only on the user's yes.

dev.md is the project's self-maintained handbook: when a gotcha, surprise, or repeated instruction surfaces in any run, propose one line for the right dev.md section that would have prevented it — fold into existing lines, never append a log — and add it on the user's yes.
<!-- vsk-dev:end -->

## Repo specifics

This repo *is* the dev-skills it ships, and it runs on them: `.vegastack/` is a live instance of the workflow described above, so the process docs here are also a worked example of the product.

- **Process authority:** CONTRIBUTING.md → `.vegastack/dev.md` → `skill-maintainer`'s release-ops.md → skill defaults. dev.md's `authority:` line is the one home for that order, and its `## Ship` runbook is the release flow.
- **`skills/` is the only source of truth.** `packages/cli/skill/` and `packages/cli/skill-integrity.json` are build output — written by `bun run build`, gitignored, never edited and never committed. A repo-wide search hits both trees and returns the same content twice; the copy under `packages/cli/skill/` is the stale one.
- **Layout is exactly two levels:** `skills/<group>/<name>/`, never deeper, with a `GROUP.md` per group — currently `dev-skills` and `repo-tooling`. The published bundle is flat, so skill names are unique across the whole tree and install commands never carry a group.
- **Authoring and standards:** new or changed skills go through `skillify`, which scaffolds the tree and performs the repo wiring itself; repo, release and scan-triage standards live in `skill-maintainer`. Both are listed in `packages/cli/repo-only.json`, so `add --all` skips them.
- **Verification is two commands, not one.** `bun run check` is the local gate. The SkillSpector scan is deliberately outside it — the scan needs Python 3.12 and the `skillspector` CLI while `check` stays Bun and Node only — and it reads the **built** bundle, so `bun run build` comes first; the authored tree's unpackaged test fixtures are adversarial on purpose and would score higher than anything that ships. Install line in CONTRIBUTING.md, invocation in dev.md's `## Verify`.
- **Agent-tool directories:** `.claude/` is gitignored, so installing skills there pollutes nothing. `.agents/` is **not** ignored — add the ignore line before installing into it.
