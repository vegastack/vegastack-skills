---
name: dev-setup
description: Bootstrap a project for issue-driven agent development. Use when asked to "set up the dev workflow", "bootstrap this project for agents", "install the dev workflow here", or invoked as dev-setup; also run automatically when dev-intake, dev-implement, or dev-ship find no .vegastack/dev.md in the project. Creates the project profile, the AGENTS.md dev section plus CLAUDE.md import, the five workflow labels on the GitHub repo, and the decision register. Not for architecture profiles or advice (that is architect and .vegastack/arch.md), not for authoring skills, not for repos without git.
---

# dev-setup

Re-runnable bootstrap that gives a project everything the dev workflow needs: a profile file holding the knobs, a thin AGENTS.md section that both Claude Code and Codex read, the GitHub labels, and the decision register. The other dev skills call this automatically when `.vegastack/dev.md` is missing, then continue with their original request.

Nearest neighbor: `architect` owns `.vegastack/arch.md` (architecture facts and advice); dev-setup owns `.vegastack/dev.md` (workflow facts and knobs). When arch.md exists, point dev.md at it for stack facts instead of duplicating them.

## Step 1 — Detect before asking

Facts are your job; decisions are the user's. Gather these silently and present findings as "here's what I found — correct me if wrong", never as open questions:

| What | How |
|---|---|
| repo, default branch | `git remote get-url origin` · `gh repo view --json nameWithOwner,defaultBranchRef` |
| gh authenticated | `gh auth status` |
| stack and commands | package.json scripts, lockfiles, framework configs |
| web app (UI evidence relevant) | framework dependencies (next, react, vue, …) |
| release/deploy machinery | changesets config, publish or deploy workflows, wrangler/Docker/compose files, registry configs — these draft the `## Ship` runbook |
| environments and run commands | CI/deploy configs, env examples (names only), dev/start scripts — these draft `## Environments` and `## Verify` |
| existing files | AGENTS.md, CLAUDE.md, `.vegastack/dev.md`, `.vegastack/arch.md`, docs/decisions.md |
| existing labels | `gh label list` |

Not a git repo, or no origin remote: stop and say exactly what is missing. A half-installed workflow is worse than none.

## Step 2 — The interview

Ask with your harness's question tool — AskUserQuestion in Claude Code, `request_user_input` in Codex where the mode allows it (availability details: [harness-facts](references/harness-facts.md)). When no question tool is available (headless run, gated mode), write the defaults, mark every unconfirmed knob `# TODO confirm`, and say so in your reply — a wrong invented preference costs more than a TODO.

**Round A — confirm the detected facts** in one compact summary (repo, stack, commands, web app or not). Ask only about what detection could not fill.

**Round B — the four workflow knobs**, recommended default first:

1. Review of finished work: **subagent** · cross-agent (Codex↔Claude) · cross-agent only on `risky` issues
2. Proof for UI work: **playwright screenshots** · none
3. Gates: **3** (approve → PR → merge as separate user words) · 2 (approve → one "ship it" covers PR and merge)
4. Tests: **required for every change** · required for logic changes only

**Round C — only when the situation exists:**

- Release/deploy machinery detected → show the drafted `## Ship` runbook (each step `auto:` or `ask:`) and the `release:` knob (per-merge or on-request) for confirmation; no machinery → "Ship: merge only" and move on
- Environments or run commands detected → confirm the drafted `## Environments` and `## Verify` bullets
- AGENTS.md already has content → append the marked section (default) or show a merge proposal first
- CLAUDE.md already has content → add the `@AGENTS.md` import as its first line (default) or move its content into AGENTS.md and leave only the import
- Evidence repo for UI screenshots → default `<owner>/dev-review-assets`; offer to create it (`gh repo create --private`) if missing
- Different label names or a different decision-register path, if the user brings it up

Everything else — merge style, branch naming, the stop-and-ask list — takes its documented default straight into dev.md. The profile is plain text the user can edit anytime; the interview is a convenience, not the source of truth.

## Step 3 — Write

| Target | Action |
|---|---|
| `.vegastack/dev.md` | render [dev-profile template](assets/dev-profile.md.template) with the answers — it is the project's self-maintained handbook (short directional bullets; Ship/Verify/Environments/Design sections drafted from detection, placeholders deleted) |
| `AGENTS.md` | create it, or insert/replace only the block between `<!-- vsk-dev:start -->` and `<!-- vsk-dev:end -->` using the [agents-section template](assets/agents-section.md.template); content outside the markers is the user's and stays untouched |
| `CLAUDE.md` | ensure its first line is `@AGENTS.md` — Claude Code does not read AGENTS.md natively and needs this import ([harness-facts](references/harness-facts.md)); create the file when absent |
| labels | `gh label create <name> --color <hex> --description "<text>"`, skipping ones that exist: `needs-operator` FBCA04 (waiting on the user) · `ready` 0E8A16 (approved, agent may start) · `working` 1D76DB (claimed by an agent) · `for-operator` 5319E7 (result awaiting user review) · `risky` B60205 (security, money, data, or production) |
| decision register | create the file the `decisions:` knob names (default `docs/decisions.md`) with a two-line header and one example entry, when missing; a project with an existing register keeps it and the knob points there |

## Step 4 — Report

One summary: what was created, what was skipped and why, what remains TODO. When `gh` was unauthenticated, print the exact `gh auth login` and `gh label create` commands the user can run later, and name the gap plainly.

## Re-runs

Re-running is safe and is how knobs get revisited: show what differs per target and change only what the user confirms. The marked block is the only part of AGENTS.md this skill owns. Hand edits inside dev.md win — read them and keep them; the templates are for creation, not for resetting.
