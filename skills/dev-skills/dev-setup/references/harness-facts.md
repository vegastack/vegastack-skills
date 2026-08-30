# Harness facts

Verified mechanics of the two harnesses this workflow targets. Everything here is volatile — vendors change these — so each claim carries its source; the refresh contract tracks them. Verified 2026-08-27.

## Claude Code

- Claude Code does **not** read AGENTS.md natively. The documented pattern is a CLAUDE.md that imports it: a line containing `@AGENTS.md` (import syntax is `@path/to/file`, resolved relative to the containing file, maximum 4 hops of recursion; `@` inside backticks stays literal). <!-- source: CC-MEMORY -->
- `CLAUDE.local.md` in the project root loads after CLAUDE.md and is meant to be gitignored — leave it alone; it is the user's personal file. <!-- source: CC-MEMORY -->
- Project skills load from `.claude/skills/<name>/SKILL.md`; personal skills from `~/.claude/skills/`. <!-- source: CC-SKILLS -->
- The structured question tool is **AskUserQuestion**. It is unavailable in non-interactive runs (`claude -p`); a configurable timeout can auto-submit pre-selected options. <!-- source: CC-TOOLS -->
- Hooks live in settings files (`.claude/settings.json` project-level) under a `hooks` key mapping event names to command entries. The `Stop` event fires when Claude finishes a turn; its stdin JSON includes `session_id`, `stop_hook_active`, and `last_assistant_message`; a hook keeps the agent going by emitting `{"decision": "block", "reason": "…"}` (or exit 2 with the reason on stderr) — `reason` is shown to the agent. `SessionEnd` cannot block. `SubagentStop` is a separate event — leave it unwired so subagents don't fire nudges. <!-- source: CC-HOOKS -->

## Codex

- Codex reads AGENTS.md natively: from `~/.codex/` (global; `AGENTS.override.md` wins over `AGENTS.md`), then from the repo root down to the working directory, one file per directory, concatenated root-first so closer files override. Combined size is capped by `project_doc_max_bytes`, default 32 KiB. There is **no** `@file` import mechanism — layering is directory-based only. <!-- source: CODEX-AGENTS -->
- Skills load from `.agents/skills/` in each directory from the working directory up to the repo root, plus `~/.agents/skills/` for the user. Frontmatter requires only `name` and `description`; an optional `agents/openai.yaml` adds display metadata and invocation policy. <!-- source: CODEX-SKILLS -->
- The structured question tool is **`request_user_input`** — collaboration-mode-gated (available in Plan mode; elsewhere it fails fast with a clear error, and it is not available to subagents). Community posts mention an "ask_user_question"/"clarify" tool; that is a proposal, not a shipped tool — do not design against it. <!-- source: CODEX-SKILLS -->
- Non-interactive mode is `codex exec`: fully unattended, human-input tools unavailable, AGENTS.md discovery unchanged. <!-- source: CODEX-EXEC -->
- Codex has lifecycle hooks too: configured in `~/.codex/hooks.json` / `<repo>/.codex/hooks.json` (or inline `[hooks]` tables in config.toml); project-local hooks load only when the repo's `.codex/` layer is trusted, and older Codex versions gate the engine behind a features flag. Its `Stop` event mirrors Claude Code's: stdin JSON with `stop_hook_active` and `last_assistant_message`, `{"decision": "block", "reason": "…"}` or exit 2 to continue the turn, `SubagentStop` separate. <!-- source: CODEX-HOOKS -->

## Decision-capture Stop hook (optional, offered in Round C)

Because both Stop contracts match, one shared script serves both harnesses. Write it to `.vegastack/hooks/decision-nudge.sh` and wire it as `sh .vegastack/hooks/decision-nudge.sh` (no exec bit needed). Only on the user's explicit yes, and only the `Stop` event. The wiring shape is doubly nested — matcher groups each holding their own `hooks` array — identical in Claude Code's `.claude/settings.json` and Codex's `<repo>/.codex/hooks.json` (merge into existing hook config, never overwrite): <!-- source: CC-HOOKS --> <!-- source: CODEX-HOOKS -->

```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "sh .vegastack/hooks/decision-nudge.sh" } ] } ] } }
```

```sh
#!/bin/sh
# Nudge at most once per session, and only when the last message smells directional.
command -v jq >/dev/null 2>&1 || exit 0        # no jq -> no nudge, never break the harness
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active')" = "true" ] && exit 0
marker="${TMPDIR:-/tmp}/vsk-decision-nudge-$(printf '%s' "$input" | jq -r '.session_id')"
[ -e "$marker" ] && exit 0
printf '%s' "$input" | jq -r '.last_assistant_message // ""' \
  | grep -qiE 'decided|chose|instead of|convention|from now on|standardi[sz]|switch(ed|ing)? to' || exit 0
: > "$marker"
printf '%s' '{"decision":"block","reason":"Before finishing: if this session settled a directional choice (the Decisions test in .vegastack/dev.md), propose one dated register line and ask the user to confirm; otherwise finish."}'
```

The marker lives under the OS temp dir, never inside the repo. The prose instruction in the AGENTS.md dev section is the portable base on both harnesses; this hook is a deterministic nudge on top, not a replacement.

## What this means for the dev skills

- AGENTS.md is the shared instruction file; the one-line CLAUDE.md import makes it reach Claude Code. Keep the marked section small — it counts against Codex's 32 KiB budget along with everything else in AGENTS.md.
- Any skill that wants to ask the user must degrade cleanly: no question tool available → use documented defaults, mark them `# TODO confirm`, and say so.
