---
name: dev-setup
description: Bootstrap a project for issue-driven agent development — existing repo or brand-new empty directory. Use when asked to "set up the dev workflow", "bootstrap this project for agents", "install the dev workflow here", "set up this new project", or invoked as dev-setup; also run automatically when dev-intake, dev-implement, or dev-ship find no .vegastack/dev.md in the project. Detects the stack and drafts its native release, changelog, and guard conventions; creates the project profile, the AGENTS.md dev section plus CLAUDE.md import, the workflow labels, and the decision register; offers release-guard workflows and the decision-capture hook on the user's yes. Not for architecture profiles or advice (that is architect and .vegastack/arch.md), not for authoring skills, not for general CI or app scaffolding.
---

# dev-setup

Re-runnable bootstrap that gives a project everything the dev workflow needs: a profile file holding the knobs and runbooks, a thin AGENTS.md section that both Claude Code and Codex read, the GitHub labels, and the decision register. The other dev skills call this automatically when `.vegastack/dev.md` is missing, then continue with their original request.

Nearest neighbor: `architect` owns `.vegastack/arch.md` (architecture facts and advice); dev-setup owns `.vegastack/dev.md` (workflow facts and knobs). When arch.md exists, point dev.md at it for stack facts instead of duplicating them.

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
| existing files | AGENTS.md, CLAUDE.md, `.vegastack/dev.md`, `.vegastack/arch.md`, the decision register |
| existing labels | `gh label list` |

Not a git repo, or no origin remote → this is a **greenfield run, not an error**: follow the greenfield playbook in [stack-playbooks](references/stack-playbooks.md) — interview for the intended stack, offer `git init` and `gh repo create` each on its own yes, and render dev.md from the chosen playbook's conventions with TODO lines where machinery doesn't exist yet. A declined remote skips labels and records the TODO plainly.

## Step 2 — The interview

Ask with your harness's question tool — AskUserQuestion in Claude Code, `request_user_input` in Codex where the mode allows it (availability details: [harness-facts](references/harness-facts.md)). When no question tool is available (headless run, gated mode), write the defaults, mark every unconfirmed knob `# TODO confirm`, and say so in your reply — a wrong invented preference costs more than a TODO.

**Round A — confirm the detected facts** in one compact summary (repo, stack, commands, web app or not, matched playbook). Ask only about what detection could not fill.

**Round B — the workflow knobs**, recommended default first:

1. Review of finished work: **subagent** · cross-agent (Codex↔Claude) · cross-agent only on `risky` issues
2. Proof for UI work: **playwright screenshots** · none
3. Gates: **3** (approve → PR → merge as separate user words) · 2 (approve → one "ship it" covers PR and merge) · 1 (direct-to-main for single-operator projects: the ship word merges locally and pushes, no PR — everything else unchanged)
4. Tests: **required for every change** · required for logic changes only

**Round C — only when the situation exists:**

- Playbook matched → show the drafted `## Ship` runbook (each step `auto:`, `ask:`, or `guard:`), the `changelog:` convention, and the `release:` knob (per-merge or on-request) for confirmation; no machinery → "Ship: merge only" and move on
- Guards drafted → offer to write their CI backstop steps into the project's workflow files (the local `guard:` lines run without CI); each file on the user's yes — release guards only, never general CI
- Environments or run commands detected → confirm the drafted `## Environments` and `## Verify` bullets
- Evidence repo (`ui-evidence: playwright`) → default is the owner's **shared** `<owner>/dev-review-evidence`; if it doesn't exist, offer `gh repo create <owner>/dev-review-evidence --private --add-readme` + the layout/retention README — created once, every project points at it. An org naming policy that rejects the name → pick the closest compliant name with the user and record it in the knob (the name is a knob value, not a contract)
- Decision-capture hook → offer the Stop-hook from [harness-facts](references/harness-facts.md) for the harnesses in use; hook files and settings wiring are written only on the user's explicit yes, merging into existing hook config, never overwriting
- AGENTS.md already has content → append the marked section (default) or show a merge proposal first
- CLAUDE.md already has content → add the `@AGENTS.md` import as its first line (default) or move its content into AGENTS.md and leave only the import
- Different label names, `gates: 1` with branch protection on the default branch (it blocks direct pushes — surface the conflict), or a different decision-register path, if the situation or the user brings it up

Everything else — merge style, branch naming, the stop-and-ask list — takes its documented default straight into dev.md. The profile is plain text the user can edit anytime; the interview is a convenience, not the source of truth.

## Step 3 — Write

| Target | Action |
|---|---|
| `.vegastack/dev.md` | render [dev-profile template](assets/dev-profile.md.template) with the answers — the project's single canonical process doc (short directional bullets; Ship/Verify/Environments/Design drafted from the playbook, Decisions test included, placeholders deleted, TODO lines where machinery is absent) |
| `AGENTS.md` | create it, or insert/replace only the block between `<!-- vsk-dev:start -->` and `<!-- vsk-dev:end -->` using the [agents-section template](assets/agents-section.md.template); content outside the markers is the user's and stays untouched |
| `CLAUDE.md` | ensure its first line is `@AGENTS.md` — Claude Code does not read AGENTS.md natively and needs this import ([harness-facts](references/harness-facts.md)); create the file when absent |
| labels | `gh label create <name> --color <hex> --description "<text>"` for the names the `labels:` knob records, skipping ones that exist; default names and creation colors: `needs-operator` FBCA04 (waiting on the user) · `ready` 0E8A16 (approved, agent may start) · `working` 1D76DB (claimed by an agent) · `for-operator` 5319E7 (result awaiting user review) · `risky` B60205 (security, money, data, or production) |
| decision register | create the file the `decisions:` knob names (default `.vegastack/decisions.md`) when missing, with a two-line header stating the format: `- DD-MM-YYYY (github-username) — the decision` (username via `gh api user -q .login`, fallback `git config user.name`); a project with an existing register keeps it and the knob points there |
| guard workflows / hook files | only the ones the user said yes to in Round C |

## Step 4 — Report

One summary: what was created, what was skipped and why, what remains TODO. When `gh` was unauthenticated, print the exact `gh auth login` and `gh label create` commands the user can run later, and name the gap plainly.

## Re-runs

Re-running is safe and is how knobs get revisited and empty sections get filled: diff fresh detection against the existing dev.md, show what differs per target, and change only what the user confirms — propose the delta, never reset. The other dev skills send the user here when they notice an empty Ship/Verify section next to newly present machinery. The marked block is the only part of AGENTS.md this skill owns. Hand edits inside dev.md win — read them and keep them; the templates are for creation, not for resetting.
