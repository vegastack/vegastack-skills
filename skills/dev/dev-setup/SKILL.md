---
name: dev-setup
description: Bootstrap a project for issue-driven agent development — existing repo or brand-new empty directory. Use when asked to "set up the dev workflow", "bootstrap this project for agents", "install the dev workflow here", "set up this new project", "wire the release guards", "create the workflow labels", "set up the changelog convention", "fill the architecture profile section", to re-run setup after machinery appeared or knobs changed, or invoked as dev-setup; also run automatically when any dev-family skill finds no .vegastack/dev.md in the project. Not for architecture advice (dev-architect reads the section this skill writes), authoring skills (skillify), or general CI and app scaffolding.
---

# dev-setup

Act: give the project everything the dev workflow needs, asking only for the decisions detection cannot make.

Re-runnable bootstrap: a profile file holding the knobs and runbooks, a thin AGENTS.md section that both Claude Code and Codex read, the GitHub labels, and the decision register. The other dev skills call this automatically when `.vegastack/dev.md` is missing, then continue with their original request. The workflow-wide artifact spec — comment markers, operator identity, revision markers, scope classes, ledger format, `.vegastack/.tmp/` workspace — lives in [conventions](references/conventions.md); dev skills cite it rather than restating it.

Nearest neighbor: `dev-architect` consumes dev.md's `## Architecture` section and gives architecture advice; dev-setup detects the facts and writes the section. There is no separate architecture profile — dev.md is the one file.

## Step 1 — Detect before asking

Gather these silently and present them as findings — "here's what I found — correct me if wrong" — because facts are detection's job and decisions are the user's:

| What | How |
|---|---|
| repo, default branch | `git remote get-url origin` · `gh repo view --json nameWithOwner,defaultBranchRef` |
| org defaults (control room) | the repo's `control-room:` knob, else `gh api repos/<org>/vegafactory-control-room` — a control room that answers a knob removes that question from Round B; layout and precedence are the `vegafactory-setup` skill's |
| gh authenticated | `gh auth status` |
| operator username (the `architect:` knob) | `gh api user -q .login`, fallback `git config user.name` — written as the knob's value with no question, because the architecture owner defaults to whoever runs setup; the decision-register header uses the same lookup |
| the operator list (the `operators:` knob) | the same `gh api user -q .login` lookup, written as a one-name csv without asking — assignment needs a default owner from run one, and the operator edits the line to add colleagues |
| gh version | `gh --version` against the floors in [harness-facts](references/harness-facts.md); each feature the version lacks is named in the Step 4 report, so the operator upgrades once instead of hitting the gap mid-run |
| stack and commands | package.json scripts, lockfiles, framework configs |
| web app (UI evidence relevant) | framework dependencies (next, react, vue, …) |
| release/changelog machinery | match signals against [stack-playbooks](references/stack-playbooks.md) — the matched playbook drafts the `## Ship` runbook, the `changelog:` knob, and the guards to offer |
| environments and run commands | CI/deploy configs, env examples (names only), dev/start scripts — these draft `## Environments` and `## Verify` |
| architecture (app repos) | wrangler files, drizzle config, better-auth usage, S3/R2 bindings, pg-boss, `eve`/`ai` packages, Dockerfiles/compose, pubspec.yaml — these draft `## Architecture` (a `d1_databases` binding with no Postgres driver is the D1-only class) |
| existing files | AGENTS.md, CLAUDE.md, `.vegastack/dev.md`, a legacy `.vegastack/arch.md`, the decision register — read before writing, because hand edits in them are the truth |
| existing labels | `gh label list` |
| native issue types | `gh api orgs/<org>/issue-types` — an `Epic` type routes parents to it, otherwise the `epic` label ([conventions](references/conventions.md)); the enabled names draft the `issue-types:` knob, `none` where the call 404s |
| native issue fields | `gh api orgs/<org>/issue-fields` — every `single_select` field with its option names, ordered by each option's `priority` key (the array itself comes back alphabetical), drafts the `issue-fields:` knob, `none` where the call 404s; the Priority and Effort options are what dev-intake offers, so they are read, never assumed |
| harnesses present | `command -v claude codex hermes` and each present one's `--version` — the names and versions become the `harnesses:` knob line, and the AGENTS.md block, the CLAUDE.md import, the hook offer and the `review:` recommendation target only harnesses that exist. Any harness the drafted `harness-policy:` names but the box lacks is absent → record it in `## Environments` with the capability it gates (no Codex → cross-agent review is off and the review stage falls back to a fresh subagent), naming no install command, because the vendor's own docs own that |
| agent skills in the repo | a directory of skill folders, flat or one group deep, drafts the `skill-scan:` knob at that path (none found drafts `none`), declared once, because a second `skill-scan:` line makes the profile ambiguous and the guard refuses; the knob names the built directory where one exists, because unpackaged fixtures are adversarial on purpose |
| SkillSpector (skill scanning) | nothing to detect — dev-review's guard locates the CLI itself and, under `skillspector-update: auto`, installs and upgrades it; confirm the drafted `skillspector-update:` value instead (`auto` provisions silently, `notify` only reports, `off` stays offline) |

Not a git repo, or no origin remote → a greenfield run, not an error: follow the greenfield playbook in [stack-playbooks](references/stack-playbooks.md) — interview for the intended stack, offer `git init` and `gh repo create` each on its own yes, and render dev.md from the playbook's conventions with TODO lines where machinery doesn't exist yet. A declined remote skips labels and records the TODO plainly.

## Step 2 — The interview

Ask with your harness's question tool — AskUserQuestion in Claude Code, `request_user_input` in Codex where the mode allows it, `clarify` in Hermes ([harness-facts](references/harness-facts.md)). When none is available (headless run, gated mode), write the defaults, mark every unconfirmed knob `# TODO confirm`, and say so, because a wrong invented preference costs more than a TODO. The route the other dev skills take when no tool is available is [ask-route](references/ask-route.md); dev-setup can run before any issue exists, so its own fallback stays the documented defaults above.

**Round A — confirm the detected facts** in one compact summary (repo, stack, commands, web app or not, matched playbook, detected architecture facts). Ask only about what detection could not fill. The summary names which knobs came from the control room and which are this repo's own, because an inherited answer and a local one are corrected in different files.

**Round B — the workflow knobs**, recommended default first:

Every knob `groups/<g>/group.md` or `org.md` already answers is stated as inherited rather than asked — the questions below are only the ones no layer has answered.

1. Review of finished work (`review:` knob, mapped by dev-review): **cross-agent-risky** (subagent axes, the other agent on `risky` — recommended where the Codex CLI was detected; otherwise recommend `subagent`) · `subagent` (no cross-agent) · `cross-agent` (always). Detection found only one harness on the box → recommend `subagent` and say cross-agent is off until a second harness exists, because a knob promising an independent reviewer that cannot run is worse than an honest self-review; the `harness-policy:` line is still drafted in full, so the stage set does not change with the box
2. Proof for UI work: **playwright screenshots** · none
3. Gates: **3** (approve → PR → merge as separate user words) · 2 (approve → one "ship it" covers PR and merge) · 1 (direct-to-main for single-operator projects: the ship word merges locally and pushes, no PR — everything else unchanged)
4. Tests: **required for every change** · required for logic changes only
5. Who may be assigned issues here (`operators:` knob): **just you** (the detected login) · a csv of logins — every human who can receive a `needs-operator` or `for-operator` issue

**Round C — only when the situation exists:**

- Playbook matched → confirm the drafted `## Ship` runbook (steps `auto:`, `ask:`, or `guard:`, each guard with its command inline), the `changelog:` convention and the `release:` knob; keep-a-changelog with no CHANGELOG.md yet → offer to seed the skeleton; no machinery → "Ship: merge only"
- Guards drafted → offer their CI backstop steps for the project's workflow files, each file on the user's yes — release guards only, because general CI is the project's own
- Environments or run commands detected → confirm the drafted `## Environments` and `## Verify` bullets
- Agent skills detected → confirm the drafted `skill-scan:` root, the `skillspector-update:` value (`auto` installs and upgrades the CLI without asking again; `notify` or `off` opt out — say so plainly), the `## Verify` bullet running the guard after the build, and a blocking `guard:` line in `## Ship` before publish, because the published artifact is what the world installs; a declined scan → `skill-scan: none`, said plainly
- Evidence repo (`ui-evidence: playwright`) → default is the owner's shared `<owner>/dev-review-evidence`, created once with `gh repo create <owner>/dev-review-evidence --private --add-readme` plus the layout/retention README when missing; a naming policy that rejects the name → the closest compliant name, recorded in the knob
- App architecture detected → confirm the drafted `## Architecture`, asking hosting, stage and kind, which detection can't fill; nothing detected → delete the section, the `stack:` line is enough
- A legacy `.vegastack/arch.md` exists → fold its knob lines into `## Architecture`, offer each dated `notes:` line to the decision register on the user's yes, then offer to delete arch.md
- Harnesses detected → confirm the drafted `harness-policy:` line — the six stages are fixed, the models and efforts are the operator's, and the flags each value turns into are in [harness-facts](references/harness-facts.md); a model id the account cannot use fails loudly on first run, and the fix is this knob line, never a skill edit
- Hooks package → offer each of the four hooks in [harness-facts](references/harness-facts.md) separately, one plain sentence each: the ship guard asks before a command your `## Environments` and `## Ship` lines say needs your word; the SessionStart context opens each session with your queue and the worktree this checkout holds; the Stop heartbeat asks a session holding a `working` claim to checkpoint its ledger; the decision nudge asks whether this session settled a directional choice. Each is written only on its own yes, merging into existing hook config, because an overwritten hook is a silent regression — the one exception is an entry already pointing at `decision-nudge.sh`, which is this package's own earlier shape and is replaced in place with the report saying so. The ship guard reads `## Environments` policy lines and the `gates:` knob, so confirm those first; on Codex, say that project-local hooks load only once the repo's `.codex/` layer is trusted, and a worktree needs its own trust
- AGENTS.md already has content → append the marked section (default) or show a merge proposal first
- CLAUDE.md already has content → add the `@AGENTS.md` import as its first line (default) or move its content into AGENTS.md and leave only the import
- Gitignored files a fresh checkout needs (`.env`) or a setup command detected → confirm `worktree-include:`, `commands: setup` and `worktree-retention:` (default 14d), replayed into every new worktree; nothing detected → `worktree-include: none`
- No control room exists and the operator wants one → hand the request to `vegafactory-setup`, which bootstraps it; this skill never creates the org repository itself
- Different label names, `gates: 1` under branch protection (it blocks direct pushes — surface the conflict), or a different decision-register path, when the situation or the user brings it up

Everything else — merge style, branch naming, the stop-and-ask list, the `architect:` owner (the detected username), `chronicle-style: plain`, and `emoji: none` — takes its documented default straight into dev.md, because the profile is plain text the user can edit anytime.

## Step 3 — Write

| Target | Action |
|---|---|
| `.vegastack/dev.md` | render [dev-profile template](assets/dev-profile.md.template) with the answers — the project's single canonical process doc (Ship/Verify/Environments/Design from the playbook, Architecture from detection, Decisions test included, placeholders deleted, TODO lines where machinery is absent; `architect:` and `operators:` from the detected username, `harnesses:` from Step 1's detection and `harness-policy:` from the confirmed Round C line, `chronicle-style` and `emoji` at their template defaults). dev.md is short directional bullets — one line per knob or rule — because every skill reads it on every run |
| `AGENTS.md` | create it, or insert/replace only the block between `<!-- vsk-dev:start -->` and `<!-- vsk-dev:end -->` using the [agents-section template](assets/agents-section.md.template); content outside the markers is the user's and stays untouched |
| `CLAUDE.md` | ensure its first line is `@AGENTS.md` — Claude Code does not read AGENTS.md natively and needs this import ([harness-facts](references/harness-facts.md)); create the file when absent |
| labels | `gh label create <name> --color <hex> --description "<text>"` for the names the `labels:` knob records, skipping ones that exist; creation colors ([conventions](references/conventions.md) holds meanings): state `needs-operator` FBCA04 · `needs-plan` E36209 · `ready` 0E8A16 · `working` 1D76DB · `for-operator` 5319E7; modifiers `risky` B60205 · scope `research` C5DEF5 · `quick-build` 76C7C0 · `full-plan` 2A9D8F · `epic` 24292E (only when the org has no native Epic issue type) |
| decision register | create the file the `decisions:` knob names (default `.vegastack/decisions.md`) when missing, with a two-line header stating conventions' register-line format (username via `gh api user -q .login`, fallback `git config user.name`); an existing register is kept and the knob points there |
| project `.gitignore` | add `.vegastack/.worktrees/` when absent — every branch is checked out there ([conventions](references/conventions.md)), never as untracked files in the main checkout |
| guard workflows / hook files | only the ones the user said yes to in Round C; a hook or dev.md section the control room's `templates/` overrides is taken from there and this skill's own asset is the fallback, because the org's template is a deliberate default and these are not; hook files are copied verbatim from `assets/hooks/` (or the control room's override) to `.vegastack/hooks/`, and the wiring goes to `.claude/settings.json` (Claude Code), `<repo>/.codex/hooks.json` (Codex) and `~/.hermes/config.yaml` (Hermes, ship guard only), merged never replaced |

## Step 4 — Report

One summary: what was created, what was skipped and why, what remains TODO, what the `issue-types:` and `issue-fields:` knobs ended up holding — and where either is `none`, one plain sentence saying issues here carry their labels and nothing else — what the drafted `harness-policy:` line ended up holding and which harnesses it names that the box does not have, and every gh feature the detected version lacks with the floor that unlocks it (on gh 2.92.0: "native issue types, sub-issues and dependencies need gh 2.94.0; name-based project field edits need gh 2.97.0"). When `gh` was unauthenticated, print the exact `gh auth login` and `gh label create` commands to run later, and name the gap plainly.

## Re-runs

Re-running is how knobs get revisited and empty sections get filled: diff fresh detection against the existing dev.md, show what differs per target, and change only what the user confirms — propose the delta, because a reset discards the hand edits that made the profile true. The other dev skills send the user here when they notice an empty Ship/Verify section next to newly present machinery. The marked block is the only part of AGENTS.md this skill owns; hand edits inside dev.md win, and the templates are for creation.
