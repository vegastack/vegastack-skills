---
name: dev-setup
description: Bootstrap a project for issue-driven agent development — existing repo or brand-new empty directory. Use when asked to "set up the dev workflow", "bootstrap this project for agents", "install the dev workflow here", "set up this new project", or invoked as dev-setup; also run automatically when dev-intake, dev-implement, or dev-ship find no .vegastack/dev.md in the project. Detects the stack and drafts its native release, changelog, and guard conventions; creates the project profile, the AGENTS.md dev section plus CLAUDE.md import, the workflow labels, and the decision register; offers release-guard workflows and the decision-capture hook on the user's yes. Not for architecture advice (that is dev-architect reading the dev.md Architecture section this skill writes), not for authoring skills, not for general CI or app scaffolding.
---

# dev-setup

Re-runnable bootstrap that gives a project everything the dev workflow needs: a profile file holding the knobs and runbooks, a thin AGENTS.md section that both Claude Code and Codex read, the GitHub labels, and the decision register. The other dev skills call this automatically when `.vegastack/dev.md` is missing, then continue with their original request. The workflow-wide artifact spec — comment markers, operator identity, revision markers, scope classes, ledger format, `.vegastack/.tmp/` workspace — lives in [conventions](references/conventions.md); every dev skill cites it rather than restating it.

Nearest neighbor: `dev-architect` consumes dev.md's `## Architecture` section and gives architecture advice; dev-setup detects the facts and writes the section. There is no separate architecture profile — dev.md is the one file.

## Step 1 — Detect before asking

Facts are your job; decisions are the user's. Gather these silently and present findings as "here's what I found — correct me if wrong", never as open questions:

| What | How |
|---|---|
| repo, default branch | `git remote get-url origin` · `gh repo view --json nameWithOwner,defaultBranchRef` |
| gh authenticated | `gh auth status` |
| stack and commands | package.json scripts, lockfiles, framework configs |
| web app (UI evidence relevant) | framework dependencies (next, react, vue, …) |
| release/changelog machinery | match signals against [stack-playbooks](references/stack-playbooks.md) — the matched playbook drafts the `## Ship` runbook, the `changelog:` knob, and the guards to offer |
| environments and run commands | CI/deploy configs, env examples (names only), dev/start scripts — these draft `## Environments` and `## Verify` |
| architecture (app repos) | wrangler files (a `d1_databases` binding with no Postgres driver = the D1-only class), drizzle config, better-auth usage, `@aws-sdk/client-s3`/R2 bindings, pg-boss dependency, `eve`/`ai` packages, Dockerfiles/compose, pubspec.yaml — these draft `## Architecture` |
| existing files | AGENTS.md, CLAUDE.md, `.vegastack/dev.md`, a legacy `.vegastack/arch.md`, the decision register |
| existing labels | `gh label list` |
| native issue types | `gh api orgs/<org>/issue-types` — an `Epic` type routes parents to it; absent endpoint or type → the `epic` label fallback ([conventions](references/conventions.md)) |
| Codex CLI (cross-agent review) | `command -v codex` — absent → record the gap in dev.md `## Environments` and recommend installing it |

Not a git repo, or no origin remote → this is a **greenfield run, not an error**: follow the greenfield playbook in [stack-playbooks](references/stack-playbooks.md) — interview for the intended stack, offer `git init` and `gh repo create` each on its own yes, and render dev.md from the chosen playbook's conventions with TODO lines where machinery doesn't exist yet. A declined remote skips labels and records the TODO plainly.

## Step 2 — The interview

Ask with your harness's question tool — AskUserQuestion in Claude Code, `request_user_input` in Codex where the mode allows it (availability details: [harness-facts](references/harness-facts.md)). When no question tool is available (headless run, gated mode), write the defaults, mark every unconfirmed knob `# TODO confirm`, and say so in your reply — a wrong invented preference costs more than a TODO.

**Round A — confirm the detected facts** in one compact summary (repo, stack, commands, web app or not, matched playbook, detected architecture facts). Ask only about what detection could not fill.

**Round B — the workflow knobs**, recommended default first:

1. Review of finished work: **subagent** · cross-agent (Codex↔Claude) · cross-agent only on `risky` issues
2. Proof for UI work: **playwright screenshots** · none
3. Gates: **3** (approve → PR → merge as separate user words) · 2 (approve → one "ship it" covers PR and merge) · 1 (direct-to-main for single-operator projects: the ship word merges locally and pushes, no PR — everything else unchanged)
4. Tests: **required for every change** · required for logic changes only

**Round C — only when the situation exists:**

- Playbook matched → show the drafted `## Ship` runbook (each step `auto:`, `ask:`, or `guard:` — every `guard:` line carries its runnable command inline), the `changelog:` convention, and the `release:` knob (per-merge or on-request) for confirmation; a keep-a-changelog convention with no CHANGELOG.md yet → offer to seed the skeleton; no machinery → "Ship: merge only" and move on
- Guards drafted → offer to write their CI backstop steps into the project's workflow files (the local `guard:` lines run without CI); each file on the user's yes — release guards only, never general CI
- Environments or run commands detected → confirm the drafted `## Environments` and `## Verify` bullets
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
| decision register | create the file the `decisions:` knob names (default `.vegastack/decisions.md`) when missing, with a two-line header stating the format: `- DD-MM-YYYY (github-username) — the decision` (username via `gh api user -q .login`, fallback `git config user.name`); a project with an existing register keeps it and the knob points there |
| guard workflows / hook files | only the ones the user said yes to in Round C |

## Step 4 — Report

One summary: what was created, what was skipped and why, what remains TODO. When `gh` was unauthenticated, print the exact `gh auth login` and `gh label create` commands the user can run later, and name the gap plainly.

## Re-runs

Re-running is safe and is how knobs get revisited and empty sections get filled: diff fresh detection against the existing dev.md, show what differs per target, and change only what the user confirms — propose the delta, never reset. The other dev skills send the user here when they notice an empty Ship/Verify section next to newly present machinery. The marked block is the only part of AGENTS.md this skill owns. Hand edits inside dev.md win — read them and keep them; the templates are for creation, not for resetting.
