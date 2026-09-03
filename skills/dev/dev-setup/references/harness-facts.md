# Harness facts

Verified mechanics of the three harnesses this workflow targets — Claude Code, Codex, Hermes — and the GitHub CLI floor. Everything here is volatile — vendors change these — so each claim carries its source; the refresh contract tracks them. Verified 2026-09-03.

## Claude Code

- Claude Code does **not** read AGENTS.md natively. The documented pattern is a CLAUDE.md that imports it: a line containing `@AGENTS.md` (import syntax is `@path/to/file`, resolved relative to the containing file, maximum 4 hops of recursion; `@` inside backticks stays literal). <!-- source: CC-MEMORY -->
- `CLAUDE.local.md` in the project root loads after CLAUDE.md and is meant to be gitignored — leave it alone; it is the user's personal file. <!-- source: CC-MEMORY -->
- Project skills load from `.claude/skills/<name>/SKILL.md`; personal skills from `~/.claude/skills/`. <!-- source: CC-SKILLS -->
- The structured question tool is **AskUserQuestion**. It is unavailable in non-interactive runs (`claude -p`); a configurable timeout can auto-submit pre-selected options. <!-- source: CC-TOOLS -->
- Hooks live in settings files (`.claude/settings.json` project-level) under a `hooks` key mapping event names to command entries. The `Stop` event fires when Claude finishes a turn; its stdin JSON includes `session_id`, `stop_hook_active`, and `last_assistant_message`; a hook keeps the agent going by emitting `{"decision": "block", "reason": "…"}` (or exit 2 with the reason on stderr) — `reason` is shown to the agent. `SessionEnd` cannot block. `SubagentStop` is a separate event — leave it unwired so subagents don't fire nudges. <!-- source: CC-HOOKS -->
- **Worktrees.** Hook paths do not follow the worktree: `${CLAUDE_PROJECT_DIR}` "still points at the project root where the session started", while the hook input's `cwd` "is the worktree root, and it moves again when Claude runs `cd`" — a hook that needs the worktree reads `cwd`. A permission approval granted in a worktree is saved to the **main checkout's** `.claude/settings.local.json`, "so it applies in the main checkout and in every other worktree of the repository, and it survives the worktree's removal" (the exception is Windows and the other cases where Claude Code does not use the repository root, where the rule stays with that worktree). Non-interactive `-p` runs "have no exit prompt, so Claude doesn't clean up their worktrees" — cleanup belongs to whatever created them. Claude Code itself refuses to create a worktree when `.claude`, `.claude/worktrees`, or the worktree directory is a symlink. <!-- source: CC-HOOKS -->
- The Agent SDK's `claude_code` system-prompt preset is Claude Code's own system prompt (`systemPrompt: { type: 'preset', preset: 'claude_code' }`); anything that prompt already says reaches every Claude Code session without a skill repeating it. <!-- source: CC-SDK-PRESET -->

## Codex

- Codex reads AGENTS.md natively: from `~/.codex/` (global; `AGENTS.override.md` wins over `AGENTS.md`), then from the repo root down to the working directory, one file per directory, concatenated root-first so closer files override. Combined size is capped by `project_doc_max_bytes`, default 32 KiB. There is **no** `@file` import mechanism — layering is directory-based only. <!-- source: CODEX-AGENTS -->
- Skills load from `.agents/skills/` in each directory from the working directory up to the repo root, plus `~/.agents/skills/` for the user. Frontmatter requires only `name` and `description`; an optional `agents/openai.yaml` adds display metadata and invocation policy. <!-- source: CODEX-SKILLS -->
- The structured question tool is **`request_user_input`** — collaboration-mode-gated (available in Plan mode; elsewhere it fails fast with a clear error, and it is not available to subagents). Community posts mention an "ask_user_question"/"clarify" tool; that is a proposal, not a shipped tool — do not design against it. <!-- source: CODEX-SKILLS -->
- Non-interactive mode is `codex exec`: fully unattended, human-input tools unavailable, AGENTS.md discovery unchanged. <!-- source: CODEX-EXEC -->
- Codex hooks are stable: `~/.codex/hooks.json` or `<repo>/.codex/hooks.json` (inline `[hooks]` tables in config.toml also work); events `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Stop`; the same stdin-JSON contract as Claude Code — `{"decision": "block", "reason": "…"}` or exit 2 blocks, `Stop` carries `stop_hook_active` and `last_assistant_message`, `SubagentStop` is separate — with one gap: `permissionDecision: "ask"` is parsed but unsupported, so a hook that needs a human answer blocks instead. Non-managed hooks run only after the user trusts their exact definition, project-local hooks only when the repo's `.codex/` layer is trusted; `codex exec --dangerously-bypass-hook-trust` runs enabled hooks headless for automation that vets hook sources itself. <!-- source: CODEX-HOOKS -->
- Project trust is per-path in `~/.codex/config.toml`: a `[projects."<abs path>"]` table with `trust_level = "trusted"`. "If you mark a project as untrusted, Codex skips project-scoped `.codex/` layers, including project-local config, hooks, and rules" — user- and system-level config keep working. A new worktree is a new path, so it needs its own entry before any run there can see the repo's `.codex/` layer. <!-- source: CODEX-CONFIG -->
- Codex multi-agent is stable: built-in agents `default`, `worker` (implementation) and `explorer` (read-only exploration); custom agents are `.codex/agents/<name>.toml` files, a custom name overriding a built-in of the same name; `agents.max_concurrent_threads_per_session` in config.toml caps parallel threads. <!-- source: CODEX-AGENTS-MULTI -->

## Hermes

- Hermes hooks: a shell `pre_tool_call` hook can block a tool call or fail closed; plugin hooks register `pre_tool_call`, `post_tool_call`, `pre_llm_call` and `post_llm_call` through `ctx.register_hook`, bounded by `plugins.hook_callback_timeout` (default 30s). There is no Stop-style turn hook, so the decision-capture recipe below has no Hermes wiring. <!-- source: HERMES-HOOKS -->
- Hermes tools: the structured question tool is `clarify`; `delegate_task` spawns subagents; both are ordinary toolset entries (`clarify`, `delegation`), so a headless Hermes run with the toolset off degrades exactly like a Claude Code `-p` run. Skills load from `~/.hermes/skills/` only — no project-level discovery. <!-- source: HERMES-TOOLS -->

## Model, effort, and concurrency controls

Which model and which reasoning effort a stage runs at is dev.md's `harness-policy:` knob; these are the flags each value turns into.

| Harness | Model control | Effort control | Concurrency cap |
|---|---|---|---|
| Claude Code | `--model` takes an alias or a full model name — aliases `fable`, `sonnet`, `opus`, `haiku` (plus `best`, `default`, `opusplan`, `sonnet[1m]`, `opus[1m]`), full names look like `claude-sonnet-5`; overrides the `model` setting and `ANTHROPIC_MODEL` <!-- source: CC-CLI --> | `--effort` sets the level for the session; overrides the `modelSettings` and `effortLevel` settings and does not persist <!-- source: CC-CLI --> | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (nesting depth below the main conversation, default 3; `1` turns nesting off) and `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (simultaneous subagents, default 20) — both env vars, settable under settings.json's `env` <!-- source: CC-SUBAGENT-ENV --> |
| Codex | `codex exec -m <model>`, or `-c model=<id>` as a config override <!-- source: CODEX-CONFIG --> | `-c model_reasoning_effort=<level>` — the config key the docs demonstrate as `"high"` and do not enumerate, so read the level names off the model's own documentation before promising one <!-- source: CODEX-CONFIG --> | `agents.max_concurrent_threads_per_session` in config.toml caps concurrently open spawned-agent threads, excluding the primary; unset means Codex picks the default <!-- source: CODEX-AGENTS-MULTI --> <!-- source: CODEX-CONFIG --> |
| Hermes | none documented | none documented | `plugins.hook_callback_timeout` bounds hooks, not agents <!-- source: HERMES-HOOKS --> |

Hermes has no documented model or effort flag, so a `harness-policy:` entry never names it as the agent — a policy value that cannot be passed as a flag is a promise the dispatcher cannot keep.

Verified 03-09-2026: Claude Code's effort levels are low, medium, high, xhigh and max on Fable 5.1, Fable 5, Opus 5 and Sonnet 5 (high is the default on every model except Opus 4.7, whose default is xhigh), and `ultracode` is a Claude Code setting on top that starts the session at xhigh with dynamic workflows on and needs v2.1.203 or later; `claude --version` here reads 2.1.247 and its `--help` lists the first five. Model ids move, which is why dev.md's `harness-policy:` knob holds them and this file only dates them. <!-- source: CC-CLI -->

### The `codex exec` skill-loading drill

Whether a headless Codex run discovers project skills on its own decides one thing downstream: if it does not, every dispatched Codex run has to name the SKILL.md path in its prompt. The drill answers it in one command. **The operator runs it by hand.** It starts a real Codex session, so it spends the operator's own Codex quota on the operator's own account — no skill, hook or dispatcher may run it unasked, and dev-setup only ever prints it for the operator to copy. Run it from a scratch directory so the repo's un-ignored `.agents/` is never written to:

```sh
codex login status                      # must print "Logged in"; a revoked session still prints it — the run below is the real check
PROBE=$(mktemp -d)
mkdir -p "$PROBE/.agents/skills/vsk-probe"
printf -- '---\nname: vsk-probe\ndescription: Probe skill for the harness drill. Use when asked for the probe token.\n---\n\nWhen asked for the probe token, reply with exactly VSK-PROBE-OK-7413 and nothing else.\n' > "$PROBE/.agents/skills/vsk-probe/SKILL.md"
codex exec -C "$PROBE" --skip-git-repo-check -s read-only 'Use the vsk-probe skill and reply with the probe token, nothing else.'
codex --version
```

The token `VSK-PROBE-OK-7413` in the reply means project skills load under `codex exec`; its absence means they do not. Record the answer with the date and the exact `codex --version` string.

Attempted 03-09-2026 on codex-cli 0.149.1 and **not answered**: `codex login status` printed "Logged in using ChatGPT" while the run itself failed with `refresh_token_invalidated` / `token_revoked` (401) before reaching the model — the expired-session case dev.md's Environments section anticipates. The verdict line stays unwritten rather than guessed; re-run the drill after `codex login`. <!-- source: CODEX-SKILLS --> <!-- source: CODEX-EXEC -->


## GitHub CLI

- Floor **2.94.0**: `gh issue create` and `gh issue edit` take `--type`, `--parent` / `--add-sub-issue`, and `--blocked-by` (edit forms `--add-…`/`--remove-…`) — native issue types, sub-issues and dependencies without the API (GitHub.com; GHES 3.17+ for types and sub-issues, 3.19+ for relationships). <!-- source: GH-CLI -->
- Floor **2.97.0**: `gh project item-edit --field <name> --value <text>` and `gh project item-list --field <name>` address project fields and single-select options by name; below it, fields need their IDs. <!-- source: GH-CLI -->
- Below a floor, dev-setup names the missing feature in its report and dev-intake uses the `epic` label and the REST API instead; the floors live here and nowhere else because they move with every gh release.

## The hooks package (optional, offered in Round C)

Four hooks, one Node file each, written to `.vegastack/hooks/` and wired only on the operator's explicit yes, merged into existing hook config rather than replacing it.

| Event | File | What it does | Harnesses |
|---|---|---|---|
| `PreToolUse` | `ship-guard.mjs` | Asks before a command the profile says needs the operator's word — a merge, a tag, a publish, a production deploy. | Claude Code · Codex · Hermes |
| `SessionStart` | `session-start.mjs` | Opens the session with the operator's queue and the worktree claim this checkout holds. | Claude Code · Codex |
| `Stop` | `stop-heartbeat.mjs` | Asks a session holding a `working` claim to checkpoint its ledger before it stops. | Claude Code · Codex |
| `Stop` | `decision-nudge.mjs` | Asks whether this session settled a directional choice worth a register line. | Claude Code · Codex |

The four files ship as packaged assets — `assets/hooks/ship-guard.mjs`, `assets/hooks/session-start.mjs`, `assets/hooks/stop-heartbeat.mjs`, `assets/hooks/decision-nudge.mjs` — and are copied verbatim into `.vegastack/hooks/`. Because both Stop contracts match, one script per event serves both harnesses; the `--harness` flag selects the output shape. Each hook uses Node rather than `jq`, which is not guaranteed on an operator's machine, and every marker file lives under the OS temp dir, never inside the repo. The wiring shape is doubly nested — matcher groups each holding their own `hooks` array — in Claude Code's `.claude/settings.json` and Codex's `<repo>/.codex/hooks.json` alike (merge into existing hook config, never overwrite): <!-- source: CC-HOOKS --> <!-- source: CODEX-HOOKS -->

```json
{ "hooks": {
  "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node .vegastack/hooks/ship-guard.mjs --harness claude" } ] } ],
  "SessionStart": [ { "hooks": [ { "type": "command", "command": "node .vegastack/hooks/session-start.mjs --harness claude" } ] } ],
  "Stop": [ { "hooks": [ { "type": "command", "command": "node .vegastack/hooks/stop-heartbeat.mjs --harness claude" }, { "type": "command", "command": "node .vegastack/hooks/decision-nudge.mjs --harness claude" } ] } ]
} }
```

The Codex block is the same file, `--harness codex`, written to `<repo>/.codex/hooks.json`:

```json
{ "hooks": {
  "PreToolUse": [ { "hooks": [ { "type": "command", "command": "node .vegastack/hooks/ship-guard.mjs --harness codex" } ] } ],
  "SessionStart": [ { "hooks": [ { "type": "command", "command": "node .vegastack/hooks/session-start.mjs --harness codex" } ] } ],
  "Stop": [ { "hooks": [ { "type": "command", "command": "node .vegastack/hooks/stop-heartbeat.mjs --harness codex" }, { "type": "command", "command": "node .vegastack/hooks/decision-nudge.mjs --harness codex" } ] } ]
} }
```

Codex's `PreToolUse` entry carries **no matcher**: the name of Codex's shell tool is **unverified** — `codex --help` on 0.149.1 names no tool, and the hooks documentation does not enumerate matcher values — so guessing one would silently disable the guard. Unmatched is both safe and correct here, because the ship guard resolves any payload carrying no shell command to allow and only ever speaks about commands it can read. Replace it with the real matcher once the tool name is verified.

Codex parses `permissionDecision: "ask"` but does not support it, so the ship guard sends Codex `{"decision":"block","reason":"<command> needs the operator's word — run it by hand"}` instead; a Codex operator answers by running the command themselves. <!-- source: CODEX-HOOKS -->

Project-local Codex hooks load only once the repo's `.codex/` layer is trusted, and a worktree is a separate path that needs its own trust — dev-setup says so before it offers the wiring. <!-- source: CODEX-CONFIG -->

Hermes takes only the ship guard, as a `pre_tool_call` entry in `~/.hermes/config.yaml`:

```yaml
hooks:
  pre_tool_call:
    - command: node .vegastack/hooks/ship-guard.mjs --harness codex
      fail_closed: true
```

Hermes has no Stop-style turn hook and no SessionStart event, so only the ship guard wires there; it reuses the Codex block shape because Hermes reads the same `{"decision":"block"}` contract. <!-- source: HERMES-HOOKS -->

The ship guard's only source of policy is `.vegastack/dev.md` — the `## Environments` policy lines, the `gates:` knob and the `## Ship` runbook's `ask:` lines — so a project changes its guard by editing one file and never by editing the script. A command inside the shipping family that no line classifies resolves to ask, never allow.

The prose instruction in the AGENTS.md dev section is the portable base on both harnesses; these hooks are deterministic nudges on top, not a replacement.

## What this means for the dev skills

- AGENTS.md is the shared instruction file; the one-line CLAUDE.md import makes it reach Claude Code. Keep the marked section small — it counts against Codex's 32 KiB budget along with everything else in AGENTS.md.
- Any skill that wants to ask the user must degrade cleanly: no question tool available → use documented defaults, mark them `# TODO confirm`, and say so.
- Observed 02-09-2026: the `claude_code` preset already carries the current model guidance on autonomy, delivering work, readability and parallel tool calls; Codex and Hermes get none of it. That is why the AGENTS.md conduct paragraph exists and why skill bodies never restate harness behaviour — a restated instruction competes with the harness's own wording.
- Every target harness spawns subagents (Claude Code's Task tool, Codex agents, Hermes `delegate_task`), so dev.md's `review:` knob means the same thing on each; only a headless run that cannot spawn falls back to a labeled self-review.
