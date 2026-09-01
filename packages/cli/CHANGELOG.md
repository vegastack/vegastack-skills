# @vegastack/skills

## 0.16.1

### Patch Changes

- 82bf062: Operator identity drops the word "operator": every workflow artifact now names the operator as `(<github-username>)` alone.

  - `conventions.md`'s `## Operator identity` is the one home for the rule; approval markers become `Approved by (<username>) on DD-MM-YYYY: "<their words>"` and register lines `- DD-MM-YYYY (<username>) — <decision>`.
  - The revision marker follows: `per (<username>) correction`.
  - `dev-chronicle`'s attribution line becomes `— approved by (<username>) · built by <agent> · branch <name>`.
  - `dev-setup`'s profile template seeds new projects with the short register format, and `dev-review`'s known-patterns template uses it for dismissal attribution.
  - Existing approval markers, chronicle entries and decision-register lines are append-only records and keep the form they were written in.

## 0.16.0

### Minor Changes

- 322ae75: The skill-scan baseline gains a `coverage` section, for files a scanner could not finish reading.

  - SkillSpector's own baseline suppresses findings only. It has no way to express "the scan of this file is incomplete", so a skill whose script the scanner cannot fully parse would block forever with no recourse. `coverage` entries accept that, named by `skill` and `file`, under the same discipline as a rule: a written reason carrying a "Still flag if:" clause, enforced by the guard.
  - An acceptance covers exactly the file it names. If a skill has a second unread file that is not accounted for, it still blocks — accepting a known cause must not silently cover an unknown one.
  - `AE1` findings are accepted through `coverage` too. Despite arriving as HIGH findings, they are completeness signals: the scanner's own text is "Referenced artifact was not completely inspected."
  - A degraded or partly-read scan no longer hides the findings it did produce. Only a failed execution short-circuits, where no field of the report can be trusted.
  - `skill-maintainer` documents the triage decision order — fix, rule, fingerprint, coverage, park — and the SkillSpector behaviours already traced on this repo, so future findings are adjudicated the same way rather than re-derived.

## 0.15.0

### Minor Changes

- 1407b93: Projects that author agent skills can now have them scanned for vulnerabilities as part of the workflow, before anything is pushed.

  - A new `skill-scan:` knob in `.vegastack/dev.md` names the directory holding the skills to scan; `none`, or no line at all, turns it off and the guard says it skipped rather than erroring.
  - `dev-review` ships `scripts/skill-scan.mjs`, which runs [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) over each skill and blocks on any unsuppressed HIGH or CRITICAL finding — never on the aggregate risk score, which a skills repo distorts by documenting the very mechanics being scanned.
  - `dev-implement` runs the guard at its Verify gate; `dev-review`'s Security axis triages what it surfaces into the normal review comment and fix loop, and treats every scanner hit as a candidate finding to trace, never a verdict.
  - Suppressions live in a JSON SkillSpector baseline whose every rule needs a reason carrying a "Still flag if:" clause — enforced by the guard, not trusted, and applied to fingerprint entries too so an auto-generated baseline cannot silence everything at once.
  - Baseline matchers must be **literal**: `*`, `?`, `[` and `]` are rejected. A single wildcard rule can silence every finding while the run still reports success, and rejecting wildcard spellings one at a time proved to be an arms race — naming the file is the only checkable form of "as narrow as its cause".
  - The guard refuses anything it cannot verify, not just findings: an unreadable profile or report, a report shape it does not recognise, an unrecognised severity, a scan that inspected zero files or left files partly read, an analyzer that did not finish, a crash, a profile giving `skill-scan` conflicting values, and any directory holding a `SKILL.md` that discovery did not reach — nested too deep, dot-prefixed, or behind a symlink. An unscanned skill nobody mentions looks exactly like a clean one.
  - Discovery reads two levels, so a grouped authored layout (`<root>/<group>/<skill>/`) scans instead of silently finding nothing.
  - `dev-setup` detects skills in a repo and drafts the knob, the Verify bullet, and a blocking pre-publish guard.
  - The scanner is contributor-installed; the guard refuses with the install command when it is missing rather than passing quietly, and it is deliberately not part of `bun run check`.

## 0.14.0

### Minor Changes

- 52cbf1b: Install a whole family of skills in one command: `add`, `verify`, and `remove` now take `--group <name>` or `--all` as well as a single skill name.

  - `npx @vegastack/skills add --group dev-skills` installs the ten dev-workflow skills; `--all` installs every skill worth having in a project.
  - Exactly one selector per invocation — a skill name, `--group`, or `--all`. Combining two is an error, not a merge.
  - A `--group` or `--all` install is one transaction: every skill is checked and staged before any is committed, so if one fails, none are installed and the destination is left as it was. `remove --group` runs every drift check before the first removal, for the same reason.
  - `--all` skips the repo-only skills (`skill-maintainer`, `skillify`), which operate on the vegastack-skills repository itself and do nothing useful elsewhere. Naming one explicitly still installs it.
  - `list` now groups its output and marks the repo-only skills.
  - The installed layout is unchanged: skills still land flat at `<surface>/<name>/`, so a group never appears in an install path.
  - The root README is rewritten around getting started, and `skill-maintainer` and `skillify` move into a `repo-tooling` group.

## 0.13.0

### Minor Changes

- 995571f: Authored skills may now be grouped one level deep under `skills/<group>/`, and the ten dev-workflow skills have moved into a `dev-skills` group.

  - Installed layout and install commands are unchanged: the packaged bundle stays flat, keyed by bare skill name, so `npx @vegastack/skills add dev-plan` is exactly what it was and existing installations are untouched.
  - `skillify`'s scaffolder gains `--group <name>`, which places a new skill in an existing group and writes its README row into that group's section. An unknown group is refused rather than created.
  - `skill-maintainer` gains the group rules and a create-or-maintain-a-group workflow, backed by a new repo-side structure check that blocks on illegal depth, name collisions, a malformed `GROUP.md`, missing skill meta files, packaging entries that disagree with the authored tree, and README rows that are absent, mispathed, or in the wrong section.
  - Ungrouped skills at `skills/<name>/` remain fully supported; `skill-maintainer` and `skillify` deliberately stay ungrouped.

### Patch Changes

- 05285a5: Every dev-family skill now cites `references/conventions.md` from its own SKILL.md, in one shape, and the register-line format is stated in one place instead of three.

  - dev-architect, dev-ship, dev-chronicle, and dev-debug shipped the packaged copy with no pointer to it from the agent entry point.
  - dev-architect, dev-ship, and dev-setup each spelled out their own variant of the register line; all three now point at conventions' Operator identity section.
  - dev-plan restated the approval marker and operator-identity format for an artifact it does not own, and told the reader to find the file "wherever dev-setup is installed" — wrong on a standalone install, which ships its own copy.
  - All ten citations now name the path the copy actually occupies, so they resolve on a single-skill install.

## 0.12.1

### Patch Changes

- 963b3d9: The release runbook's claim about the post-version install is corrected: it carries dependency changes into the lockfile, it does not update the workspace's own recorded version there.

  - dev-setup's npm playbook drafts the corrected step into every bootstrapped project.
  - Its version-identity note is package-manager-neutral: npm re-records a version-only bump on the next install, bun does not, so an older recorded version is a behavior to confirm rather than a defect — and never a hand-edit.
  - skill-maintainer's release ops records the observed bun behavior, including that `--frozen-lockfile` passes with the older record.

## 0.12.0

### Minor Changes

- f8dbacd: dev-status stops reporting already-recorded decisions as pending, and the workflow's shipped artifacts render correctly where they are actually read.

  - dev-status: a decision already in the register no longer stays "pending" forever when its gist carries a markdown link.
  - dev-status: `status.mjs` emits `titlePlain` and `gistPlain`, so the terminal board never prints raw link markup.
  - dev-review: the known-patterns template's four entry fields are list items, so a project's file renders one line per field; appended entries inherit the shape.
  - dev-implement: changeset entries carry a stated shape — one plain first sentence, detail as sub-bullets after a blank line.
  - dev-implement: the evidence tail's sha stays bare, with the reason on the record — GitHub auto-links it once the branch is pushed.
  - Docs: one-line rows in both README skills tables; legacy plan headers bulleted.

### Patch Changes

- 21ffb4b: dev-architect's pinned facts adopted to the refreshed baselines, live-verified 29-08-2026.

  - Better Auth 1.7 is stable; the 1.6.x hold is retired.
  - MCP support moved to `@better-auth/mcp`, with its renames.
  - SAML IdP-initiated flows are default-off.
  - `apiKey` corrected to the standalone `@better-auth/api-key` package.
  - `twoFactor`'s discriminated-method break noted, plus four further 1.7.0 breaks.
  - EVE at 0.47.3 — beta, multiple releases daily; pin behavior, not minor versions.

- 6c1db6b: dev-chronicle: the entry format now renders correctly in GitHub file views.

  - Fields are list items — single newlines otherwise soft-wrap into one paragraph.
  - Titles carry a full markdown link to the issue.
  - Bare `#N` references are banned from entries; file views never auto-link them.
  - The footer sits after a blank line as its own paragraph.

## 0.11.2

### Patch Changes

- 60dcd31: Refresh runner: verify-mode drift is now registry-anchored on the 200 path — a warm cache that already stored a drifted checksum can no longer mask registry drift on subsequent verify runs against servers without etag/last-modified support (the 304 path already caught this class). Drift items report `baseline: 'registry'` with a `cacheDisagrees` annotation when the cache also differs; accept mode and the 304 branch are unchanged.

## 0.11.1

### Patch Changes

- 13ed5ea: Refresh runner: an overdue manual-review source whose content is verifiably byte-identical to its reviewed baseline no longer deadlocks every accepting run. Under --accept-baselines, a verified-unchanged checksum (fresh hash, or a 304 against the cached etag) refreshes the review clock — scoped to manual-review sources only, so ordinary sources don't churn timestamp diffs into every weekly PR. Real content changes keep today's behavior exactly; read-only verification runs still write nothing to the registry and fail closed.

## 0.11.0

### Minor Changes

- 52ea6cd: New dev-chronicle skill: the project's narrative record. One story-language entry per behavior-changing branch in `.vegastack/chronicle.md` (outcome-named title, what/why/how-it-went/changed/decisions, operator-attributed, append-only newest-first), written by dev-implement at hand-back and presence-checked by ship-gate under the `chronicle: on` knob. "Catch me up on this project" renders the digest — story so far, recent chapters, open threads — from the chronicle and decision register only.
- 18e6d7f: New dev-debug skill: reproduce-first bug discipline in six phases with checkable completion criteria — the red-capable command gate (no red command, no theorizing; can't build one → handback trading tried ladder rungs for artifacts), shrink-to-load-bearing minimisation, 3–5 ranked falsifiable suspects posted to the ledger and proceeded on without pausing, one-variable-at-a-time probes tagged [DEBUG-<4hex>] (ship-gate blocks survivors), regression-test-before-fix at a correct seam with the missing-seam case recorded as a finding, and a cleanup phase that names the winning suspect in evidence and commit. Ships the eight-rung loop ladder reference.
- 09c698b: New dev-plan skill: the planning stage between intake and implementation. Full-plan issues get a fresh-grounded session — approaches/system-design/risk questionnaire with recommended answers, brief challenge, strict plan format (exact files, Interfaces blocks, failing-test-first steps, banned placeholders) — and the operator approves the plan before any code. Quick-build issues use its inline mode inside the intake conversation so one approval covers brief and plan. The one-way scope ratchet lives here — conventions.md now points at dev-plan as its single home.
- 60af6c8: New dev-review skill: independent review as a specified system. Parallel fresh-context reviewers per axis — spec (diff vs the current brief/plan, with a tests-are-real rubric), standards (project known-patterns + repo docs overriding a fixed 12-smell baseline), security (data-flow-traced, on risky work or security surfaces) — reported separately, never merged. One review comment per cycle with verdict, `Finding [N]` ids, CRITICAL/MUST-FIX/SHOULD-FIX/NIT severities, collapsed nitpicks, and a reviewed-SHA stamp. Bounded fix loop (3 rounds, scoped re-reviews, fresh implementer on round 3) ending in open adjudication; never-pre-judge rule; hard noise filters via a per-project review-known-patterns file whose entries require "Still flag if:" clauses; announced Codex↔Claude cross-agent mode with a defined REVIEW REQUEST handoff. dev-implement's review step now invokes this skill.
- 953c286: New dev-status skill: the operator's board. A deterministic, read-only script gathers open issues per state label (age, scope, risky), task progress from plan-comment checkboxes, ledger staleness for working issues, open PRs with check state, unrecorded decision proposals, and the last chronicle chapter; the skill renders the needs-you-first report with names-never-numbers and a single Next action. Cannot-verify states are reported, never guessed.
- a8c31f7: Workflow conventions v3: new `dev-setup/references/conventions.md` is the single spec for comment metadata markers (`<!-- vsk:v1 type=... -->`), operator identity (`operator (<username>)`), revision markers, scope classes (research / quick-build / full-plan) with the one-way ratchet, the expanded label vocabulary (`needs-plan` + scope + `epic`), title prefixes and native issue types, the ledger format with its resume protocol, the `.vegastack/.tmp/` workspace, and the verification-gate doctrine (facts block, heuristics warn). dev-setup detects native issue types and the Codex CLI, creates the new labels, and its profile template gains the `chronicle:` knob.
- 08bf66d: dev-implement v3: the ledger comment (created as the claim's first write, checkpointed per task/ruling/fix-round, plan checkboxes ticked in the same pass) with the strict resume protocol (brief → plan → ledger → git log, nothing else); red-before-green TDD at brief-named seams with the tests-are-real rubric applied pre-review; the verification gate function (identify → run fresh → read → claim); the scope ratchet as a named stop condition; chronicle entries branch-carried next to the changeset; the evidence comment gains Docs and surfaced-rulings lines with evidence-check enforced; the corrections loop moves code and docs together (revision markers, evidence sha bump, known-patterns appends); the direct chat path is bounded to trivial.
- 997f906: dev-intake v3: every issue gets an announced scope call (research / quick-build / full-plan, with the objective quick-build test) applied as a label; quick-build issues get brief + inline dev-plan plan in one conversation under a single approval; epics use the map body format (Destination / Decisions so far / Not clear yet / Out of scope) with native sub-issues; bug intake requires reproduction steps and routes fix: issues to dev-debug; seams are settled in the Tests section; approvals are recorded as vsk:v1 marker comments in the operator (username) format; pushback-on-vague with diagrams; brief template carries the marker, scope, and Reproduction section.
- 89a6863: dev-ship v3: Gate 1 leads with ship-gate.mjs (fresh check re-run, docs-match-reality, changelog + chronicle presence, review verdict, [DEBUG- grep — chronicle check new); standing merge instructions gain a staleness bound (behavior-touching rebase or >7 days → one-sentence re-confirm); decision recording uses the operator (username) register format; every ship closes with the retro question (the one dev.md line that would have prevented this issue's gotcha); the runbook maps ship-gate exit codes onto guard-line semantics.
- 38cdc19: Deterministic guard scripts across the workflow (facts block with exit 2, heuristics only warn, unverifiable state fails closed): dev-implement's `preflight.mjs` (approval marker, scope label, plan approval, Assumptions, blockers, assignee, repo match) and `evidence-check.mjs` (evidence-comment shape incl. the Docs line), dev-intake's `brief-lint.mjs` (per-scope required sections, grounded touch-point paths; vague-wording warnings), dev-plan's `plan-lint.mjs` (banned placeholders — its single home — task structure, checkboxes), and dev-ship's `ship-gate.mjs` (fresh check-command re-run, strict evidence-sha equality with head (the corrections loop, which always updates the evidence sha, is the only reconciliation path), changelog presence, review verdict/adjudication, `[DEBUG-` tag grep; rationalization-phrase warnings). All dependency-free Node with `--json`, unit-tested per branch, shipped via the packaging manifest, and wired into their skills' phase boundaries.
- 2f5ea63: v3 hardening from the drill and the epic-final adversarial sweep: ship-gate's adjudication detection no longer accepts routine surfaced rulings (parked/adjudicated phrasing required) and warns when dev.md has no check command; plan-lint blocks failing-test steps without fenced test code and Task lines missing their checkbox; preflight warns on a missing repo: line; brief-lint gains --fix (Reproduction required) and the Scope-line check; guard fail-closed paths are stub-tested and every guard header documents its exit codes; every dev-family install now ships its own copy of conventions.md (packaging supports @source shared entries — authored files stay single-homed); dev-implement routes fix: issues through dev-debug; the cross-agent handoff carries a resolvable conventions path and the agent=codex literal; the resume protocol re-names its exclusions; the plan template fence gains the Revisions slot; dev-ship names the Docs line, forbids patching docs from inside ship, and carries the drill-observed rationalization table ("a PR is just preparation" → the PR is a gate); READMEs list every shipped file; dev-status covers chronicle-parse, empty-board, and CLI fail-closed branches.
- 05e39d0: dev-architect: (inferred) directives gain a ratification mechanism — first-use confirmation proposes an operator register line and recording it drops the tag in the same change; the red-lines heading no longer hand-maintains a count. skillify's eval playbook gains the family-level trigger re-run rule (full installed set on any family change, ambiguous_with cases first) and the workflow-skill note (multi-turn gh-stateful skills get end-to-end proof from a sandbox drill; single-prompt evals cover prose and format).

### Patch Changes

- dd72d80: Description hygiene across the dev family: every SKILL.md description now carries triggers and boundaries only — process/content summaries stripped from dev-setup, dev-ship, and dev-architect, with dev-setup's lost trigger nouns (labels, changelog convention, release guards, architecture profile) restored as Use-when phrases. The family-level trigger eval ran across all twelve skills (149 queries): one fixture contradiction found (dev-status and dev-chronicle both claiming the same must-win query) and resolved. CONTRIBUTING, the AGENTS.md template, and the README rows share one family order.

## 0.10.0

### Minor Changes

- d829d2f: The `architect` skill is now `dev-architect`, the fifth member of the dev-skills family, rebuilt around one-rule-one-home references and a verify-before-you-recommend protocol (platform capability/version claims are checked against pinned facts, then live docs, before shaping a recommendation). The per-project `.vegastack/arch.md` profile is retired: architecture facts live in a `## Architecture` section of `.vegastack/dev.md` (written by dev-setup, which also migrates legacy arch.md files), and ADRs are retired in favor of the `.vegastack/decisions.md` register. dev-intake, dev-implement, and dev-setup now cross-reference dev-architect explicitly; `doctor` checks `.vegastack/dev.md` instead of arch.md. Migration: copies installed under the old `architect` name are orphaned — reinstall with `npx @vegastack/skills add dev-architect`; installer operations addressed to `architect` no longer resolve. Renaming a skill now ships minor by default (major is the operator's explicit call); removing a skill stays major.

## 0.9.1

### Patch Changes

- 0c92956: Restore a pinned `0.0.0` placeholder version on the workspace root: `npm sbom` purl generation requires every package to carry a version, so the 0.9.0 release pipeline failed at the SBOM step (after a successful npm publish — 0.9.0 has no GitHub release/SBOM as a result). The stack playbook's npm guidance now says to pin `0.0.0` instead of deleting the field. No package content changes.

## 0.9.0

### Minor Changes

- 022d1bf: Dev workflow v2 — ground-up overhaul of the dev skill family for any stack, greenfield included.

  - `.vegastack/dev.md` becomes each project's **single canonical process doc**: release runbook, changelog convention, versioning policy, and rollback fold in as `## Ship` bullets — no separate policy docs. New `authority:` line, `labels:` and `changelog:` knobs, `gates: 1` (direct-to-main for single-operator projects), and a `## Decisions` section carrying the qualification test. The decision register default moves to `.vegastack/decisions.md` with the format `- DD-MM-YYYY (github-username) — decision`; every entry needs the user's explicit yes.
  - **dev-setup**: new `references/stack-playbooks.md` maps detection signals to stack-native drafts (npm/changesets, Node app, Flutter, Python, Go, generic) — Ship runbook, changelog convention, version identity, guards, rollback line each. Greenfield repos are a supported path (intended-stack interview, git init / gh repo create on yes) instead of a hard stop. Round C can scaffold release-guard CI steps, the shared cross-project evidence repo (`<owner>/dev-review-evidence`, contents-API uploads, no clones), and an optional decision-capture Stop hook for both Claude Code and Codex (recipe + sourced hook facts in harness-facts.md).
  - **dev-implement**: changelog entry is a first-class step before hand-back (changesets written non-interactively as `.changeset/<slug>.md`); evidence comment gains `**Changelog:**` and `**Decision:**` lines; branch pattern reads solely from dev.md.
  - **dev-ship**: new `references/runbook.md` — `auto:`/`ask:`/`guard:` semantics (guards run locally, CI is the backstop), release batching, direct-to-main mechanics, bot PRs (merging one is shipping: green checks qualify, only the operator's word merges), roll-forward rollback. Gate 1 verifies the changelog entry; Gate 2 names pending decisions in the merge confirmation before recording them.
  - **AGENTS.md section**: hard consent rule — nothing ships without the operator's explicit instruction; the gates knob changes coverage, never the need for a word — plus portable ad-hoc decision capture on both harnesses.
  - **dev-intake**: brief template gains docs/changelog surfaces and a Version impact line; `Decision:` comments are gated by the dev.md test.

  This repo dogfoods the result: `docs/policies/` is folded into `.vegastack/dev.md` and deleted, the register moved to `.vegastack/decisions.md`, and the release workflow now leads its GitHub release notes with the changelog entry and fails if the entry is missing.

## 0.8.0

### Minor Changes

- 4656b81: dev.md becomes the project's self-maintained handbook: new Ship (post-merge runbook with auto/ask steps), Verify, Environments, and Design sections plus a release knob (per-merge | on-request); dev-setup detects release/deploy machinery and drafts them; dev-ship follows the Ship runbook after merge and stops at ask-lines and failures; dev-implement follows the Verify runbook for live evidence. The retro-fold rule lands in the shared AGENTS.md section: gotchas become one proposed dev.md line, folded into existing sections, never a log. Labels renamed for role clarity: needs-you → needs-operator, for-you → for-operator (re-run dev-setup to create them; old labels remain on historical issues). This repo now dogfoods the workflow with its own dev.md whose Ship runbook is the changesets release flow.

## 0.7.0

### Minor Changes

- 899bb5b: Add the dev-implement skill: implements an approved issue end to end without user input — fail-closed preflight (label plus recorded approval), claim by assignee and working label, dark execution bounded by the brief and the dev.md stop-list, tests, independent review, one in-place evidence comment, hand-back with for-you. Direct user requests in chat bypass the issue machinery on the user's own authority.
- 899bb5b: Add the dev-intake skill: turns brainstorms, feature requests, and SOWs into agent-ready GitHub issues — grilling-style rounds with recommended answers, vertical-slice briefs from a template, native dependencies/milestones, and quoted-approval recording that flips needs-you to ready.
- 899bb5b: Add the dev-setup skill: re-runnable project bootstrap for the issue-driven dev workflow — detect-first interview, `.vegastack/dev.md` profile with knobs, marked AGENTS.md section plus CLAUDE.md import, the five workflow labels, and the decision register; degrades to documented defaults marked TODO when no question tool is available.
- 899bb5b: Add the dev-ship skill: the last two gates, each spent only by the user's words — PR creation linked to the issue's evidence, then a separate merge instruction that re-verifies the reviewed head, squash-merges, and appends recorded decisions to the register.
- 3b989bb: skillify v2 — lean contract. The checklist shrinks from 13 to 8 items with stable additive numbering: unit tests are now required only for bundled scripts' deterministic branches (a prose-only skill's quality bar is the behavioral eval), the per-skill consistency test becomes a repo-wide relative-link check inside validate-skill.mjs, and the claim-classification taxonomy collapses to one volatile-facts rule with a one-line evergreen waiver default. New: a "sharp boundary" item requiring each skill to name its nearest-neighbor skill and the axis of difference; trigger-query fixtures become ~10 hard queries with `ambiguous_with`; authoring.md gains writing-style doctrine (prompt the positive, hunt no-ops and sediment, 50–150-line body budget). The scaffolder now performs repo wiring itself — packaging entry (moved from sync-skill.mjs code into packaging.json data), root README row, and changeset — idempotently, degrading to explicit skipped statuses outside the monorepo.

## 0.6.0

### Minor Changes

- 3beee21: Replace arch-guardian with architect — a from-scratch rebuild of the VegaStack architecture skill.

  The retired arch-guardian (106 rules, 18 reference files, profile/schema/refresh tooling, its own test corpus) is deleted. The new `architect` skill encodes the same intent — consistent, MK-grade architecture decisions from any team member's agent — as a lean advisory skill: an evidence-distilled decision-table stack reference, dated source-verified platform facts, lean-first principles with their reasoning, domain taste references (web, data, infra, AI/agents, security, mobile), and a per-project `.vegastack/arch.md` profile created by a first-run Q&A where the repository always wins over the stored file.

  Breaking for existing installs: `npx @vegastack/skills add architect` (the old skill name is gone; remove old arch-guardian installs manually or with `remove`). `doctor` now checks for `.vegastack/arch.md` instead of `architecture.json`. The repo-shared refresh runner moved from the skill to `tooling/refresh/`.

## 0.5.0

### Minor Changes

- 3a6c2da: skills.sh-style install UX: auto-detect installed agents (~/.claude, ~/.codex or ~/.agents, ~/.hermes) and target them without prompting; a simple numbered picker appears only when nothing is detected. The confusing "codex, claude, hermes, both, all" free-text question and the project/global question are gone — installs are project-local by default, `--global` and `--agent` still override.

## 0.4.0

### Minor Changes

- a0fa476: Housekeeping: standardize on Node 24 and current GitHub Actions

  - `engines.node` raised from `>=20.11` to `>=24` (Node 20 is EOL; Node 24 is LTS and what CI/release run on)
  - CI matrix collapsed to Node 24; deprecated actions bumped: `actions/checkout` v4→v7, `actions/setup-node` v4→v7, `softprops/action-gh-release` v2→v3

## 0.3.0

### Minor Changes

- 868f939: arch-guardian v2: advisory-only redesign (breaking content change under 0.x)

  - **Profile schema v4** (foundation 0.4.0): slim ~12-line profile — name, kind, **tier** (`prototype`/`production`/`enterprise`), tenancy, hosting, enabled capability list, notes. Versions come from lockfiles; exceptions removed. `profile-tool.mjs migrate` converts v3 profiles (exceptions become notes).
  - **Checker removed**: `architecture-check.mjs`, `control-catalog.json`, and the PASS/FAIL/EXCEPTED outcome and exception machinery are deleted. Reviews now follow the evidence-backed advisory report contract (`references/advisory-report.md`) with severities `critical`/`production-gate`/`enterprise-gate`/`consider`, per-area grades, and a stable JSON block for downstream automation.
  - **Tiers gate concerns, never tools**: rules carry tier floors; tool choices (OpenBao, pg-boss, EVE, Valkey) become defaults with named escalation triggers under the new minimum-viable-architecture principle. Rule `FOUND-002` retired (never reused).
  - **Freshness upgrades**: OSV.dev advisory watch for every pinned package (fail-closed on critical sources), `reviewBy` overdue warnings for foundation baselines, verified `llms.txt` URLs in the source registry, and proportionate freshness (full check only for design reviews leaning on critical pins).
  - CLI `doctor` validates v4 profiles and runs profile validation instead of the deleted checker.

## 0.2.0

### Minor Changes

- Rename vegastack-arch-guardian to arch-guardian (clean break); generalize the installer to N bundled skills with schemaVersion-2 integrity manifest and journal; add skill-maintainer and skillify skills; add Hermes install surface (~/.hermes/skills, global-only) and a list command; enforce the full cross-harness skill name grammar and six-field frontmatter ceiling.
