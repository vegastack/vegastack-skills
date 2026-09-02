---
name: dev-setup
description: Bootstrap a project for issue-driven agent development — existing repo or brand-new empty directory. Use when asked to "set up the dev workflow", "bootstrap this project for agents", "install the dev workflow here", "set up this new project", "wire the release guards", "create the workflow labels", "set up the changelog convention", "fill the architecture profile section", to re-run setup after machinery appeared or knobs changed, or invoked as dev-setup; also run automatically when any dev-family skill finds no .vegastack/dev.md in the project. Not for architecture advice (dev-architect reads the section this skill writes), authoring skills (skillify), or general CI and app scaffolding.
---

# dev-setup

Re-runnable bootstrap that gives a project everything the dev workflow needs: a profile file holding the knobs and runbooks, a thin AGENTS.md section that both Claude Code and Codex read, the GitHub labels, and the decision register. The other dev skills call this automatically when `.vegastack/dev.md` is missing, then continue with their original request. The workflow-wide artifact spec — comment markers, operator identity, revision markers, scope classes, ledger format, `.vegastack/.tmp/` workspace — lives in [conventions](references/conventions.md); dev skills cite it rather than restating it (the v3 rewrites adopt it skill by skill).

Nearest neighbor: `dev-architect` consumes dev.md's `## Architecture` section and gives architecture advice; dev-setup detects the facts and writes the section. There is no separate architecture profile — dev.md is the one file.

## Step 1 — Detect before asking

Facts are your job; decisions are the user's. Gather these silently and present findings as "here's what I found — correct me if wrong", never as open questions:

| What | How |
|---|---|
| repo, default branch | `git remote get-url origin` · `gh repo view --json nameWithOwner,defaultBranchRef` |
| gh authenticated | `gh auth status` |
| gh version | `gh --version` against the floors in [harness-facts](references/harness-facts.md): below 2.94.0, native issue types, sub-issues and dependencies through `gh issue edit` are unavailable; below 2.97.0, name-based `gh project item-edit --field` is — each missing feature is named in the Step 4 report so the operator upgrades once instead of hitting the gap mid-run |
| stack and commands | package.json scripts, lockfiles, framework configs |
| web app (UI evidence relevant) | framework dependencies (next, react, vue, …) |
| release/changelog machinery | match signals against [stack-playbooks](references/stack-playbooks.md) — the matched playbook drafts the `## Ship` runbook, the `changelog:` knob, and the guards to offer |
| environments and run commands | CI/deploy configs, env examples (names only), dev/start scripts — these draft `## Environments` and `## Verify` |
| architecture (app repos) | wrangler files (a `d1_databases` binding with no Postgres driver = the D1-only class), drizzle config, better-auth usage, `@aws-sdk/client-s3`/R2 bindings, pg-boss dependency, `eve`/`ai` packages, Dockerfiles/compose, pubspec.yaml — these draft `## Architecture` |
| existing files | AGENTS.md, CLAUDE.md, `.vegastack/dev.md`, a legacy `.vegastack/arch.md`, the decision register |
| existing labels | `gh label list` |
| native issue types | `gh api orgs/<org>/issue-types` — an `Epic` type routes parents to it; absent endpoint or type → the `epic` label fallback ([conventions](references/conventions.md)) |
| harnesses present | `command -v claude codex hermes` and each present one's `--version` — the AGENTS.md block, the CLAUDE.md import, the Round C hook offer and the `review:` recommendation target only harnesses that exist; Codex absent → record the gap in dev.md `## Environments` and recommend installing it, because cross-agent review needs it |
| agent skills in the repo | a directory holding skill folders, flat or one group deep — each folder carrying its own entry point — drafts the `skill-scan:` knob at that path; none found drafts `none`. Declare it **once**: a second `skill-scan:` line with a different value, even in a prose example, makes the profile ambiguous and the guard refuses. Where the project builds a flattened bundle the knob names the **built** directory, because unpackaged test fixtures are deliberately adversarial and score higher than anything that ships |
| SkillSpector (skill scanning) | nothing to detect — dev-review's guard locates the CLI through whatever channel holds it (uv, brew, pipx) and, under `skillspector-update: auto`, installs it when absent and upgrades it before each scan. Confirm the drafted `skillspector-update:` value with the operator instead: `auto` is the default and provisions silently, `notify` only reports what upstream published, `off` never touches the network |

Not a git repo, or no origin remote → this is a **greenfield run, not an error**: follow the greenfield playbook in [stack-playbooks](references/stack-playbooks.md) — interview for the intended stack, offer `git init` and `gh repo create` each on its own yes, and render dev.md from the chosen playbook's conventions with TODO lines where machinery doesn't exist yet. A declined remote skips labels and records the TODO plainly.

## Step 2 — The interview

Ask with your harness's question tool — AskUserQuestion in Claude Code, `request_user_input` in Codex where the mode allows it, `clarify` in Hermes (availability details: [harness-facts](references/harness-facts.md)). When no question tool is available (headless run, gated mode), write the defaults, mark every unconfirmed knob `# TODO confirm`, and say so in your reply — a wrong invented preference costs more than a TODO.

**Round A — confirm the detected facts** in one compact summary (repo, stack, commands, web app or not, matched playbook, detected architecture facts). Ask only about what detection could not fill.

**Round B — the workflow knobs**, recommended default first:

1. Review of finished work (`review:` knob, mapped by dev-review): **cross-agent-risky** (subagent axes, the other agent on `risky` — recommended where the Codex CLI was detected; otherwise recommend `subagent`) · `subagent` (never cross-agent) · `cross-agent` (always)
2. Proof for UI work: **playwright screenshots** · none
3. Gates: **3** (approve → PR → merge as separate user words) · 2 (approve → one "ship it" covers PR and merge) · 1 (direct-to-main for single-operator projects: the ship word merges locally and pushes, no PR — everything else unchanged)
4. Tests: **required for every change** · required for logic changes only

**Round C — only when the situation exists:**

- Playbook matched → show the drafted `## Ship` runbook (each step `auto:`, `ask:`, or `guard:` — every `guard:` line carries its runnable command inline), the `changelog:` convention, and the `release:` knob (per-merge or on-request) for confirmation; a keep-a-changelog convention with no CHANGELOG.md yet → offer to seed the skeleton; no machinery → "Ship: merge only" and move on
- Guards drafted → offer to write their CI backstop steps into the project's workflow files (the local `guard:` lines run without CI); each file on the user's yes — release guards only, never general CI
- Environments or run commands detected → confirm the drafted `## Environments` and `## Verify` bullets
- Agent skills detected → confirm the drafted `skill-scan:` root, the `skillspector-update:` value (`auto` by default — say plainly that it installs and upgrades the SkillSpector CLI on this machine without asking again, and that `notify` or `off` opt out), the `## Verify` bullet running the guard (preceded by the build command when the root is a build output), and a blocking `guard:` line in `## Ship` before the publish step — the published artifact is what the world installs. Skills detected but the operator declines the scan → `skill-scan: none`, said plainly, not silently omitted
- Evidence repo (`ui-evidence: playwright`) → default is the owner's **shared** `<owner>/dev-review-evidence`; if it doesn't exist, offer `gh repo create <owner>/dev-review-evidence --private --add-readme` + the layout/retention README — created once, every project points at it. An org naming policy that rejects the name → pick the closest compliant name with the user and record it in the knob (the name is a knob value, not a contract)
- App architecture detected → confirm the drafted `## Architecture` (hosting, stage, and kind are what detection usually can't fill — ask those); nothing detected → delete the section, the `stack:` line is enough
- A legacy `.vegastack/arch.md` exists → fold its knob lines into `## Architecture`, offer each dated `notes:` line to the decision register on the user's yes, then offer to delete arch.md
- Decision-capture hook → offer the Stop-hook from [harness-facts](references/harness-facts.md) for the harnesses in use; hook files and settings wiring are written only on the user's explicit yes, merging into existing hook config, never overwriting
- AGENTS.md already has content → append the marked section (default) or show a merge proposal first
- CLAUDE.md already has content → add the `@AGENTS.md` import as its first line (default) or move its content into AGENTS.md and leave only the import
- Different label names, `gates: 1` with branch protection on the default branch (it blocks direct pushes — surface the conflict), or a different decision-register path, if the situation or the user brings it up

Everything else — merge style, branch naming, the stop-and-ask list — takes its documented default straight into dev.md. The profile is plain text the user can edit anytime; the interview is a convenience, not the source of truth.

## Step 3 — Write

| Target | Action |
|---|---|
| `.vegastack/dev.md` | render [dev-profile template](assets/dev-profile.md.template) with the answers — the project's single canonical process doc (short directional bullets; Ship/Verify/Environments/Design drafted from the playbook, Architecture drafted from detection, Decisions test included, placeholders deleted, TODO lines where machinery is absent) |
| `AGENTS.md` | create it, or insert/replace only the block between `<!-- vsk-dev:start -->` and `<!-- vsk-dev:end -->` using the [agents-section template](assets/agents-section.md.template); content outside the markers is the user's and stays untouched |
| `CLAUDE.md` | ensure its first line is `@AGENTS.md` — Claude Code does not read AGENTS.md natively and needs this import ([harness-facts](references/harness-facts.md)); create the file when absent |
| labels | `gh label create <name> --color <hex> --description "<text>"` for the names the `labels:` knob records, skipping ones that exist; default names and creation colors ([conventions](references/conventions.md) holds meanings): state `needs-operator` FBCA04 · `needs-plan` E36209 · `ready` 0E8A16 · `working` 1D76DB · `for-operator` 5319E7; modifiers `risky` B60205 · scope `research` C5DEF5 · `quick-build` 76C7C0 · `full-plan` 2A9D8F · `epic` 24292E (only when the org has no native Epic issue type) |
| decision register | create the file the `decisions:` knob names (default `.vegastack/decisions.md`) when missing, with a two-line header stating the register-line format conventions' Operator identity section defines (username via `gh api user -q .login`, fallback `git config user.name`); a project with an existing register keeps it and the knob points there |
| guard workflows / hook files | only the ones the user said yes to in Round C |

## Step 4 — Report

One summary: what was created, what was skipped and why, what remains TODO, and every gh feature the detected version lacks with the floor that unlocks it (on gh 2.92.0: "native issue types, sub-issues and dependencies need gh 2.94.0; name-based project field edits need gh 2.97.0"). When `gh` was unauthenticated, print the exact `gh auth login` and `gh label create` commands the user can run later, and name the gap plainly.

## Re-runs

Re-running is safe and is how knobs get revisited and empty sections get filled: diff fresh detection against the existing dev.md, show what differs per target, and change only what the user confirms — propose the delta, never reset. The other dev skills send the user here when they notice an empty Ship/Verify section next to newly present machinery. The marked block is the only part of AGENTS.md this skill owns. Hand edits inside dev.md win — read them and keep them; the templates are for creation, not for resetting.
