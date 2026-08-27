# Harness facts

Verified mechanics of the two harnesses this workflow targets. Everything here is volatile — vendors change these — so each claim carries its source; the refresh contract tracks them. Verified 2026-08-27.

## Claude Code

- Claude Code does **not** read AGENTS.md natively. The documented pattern is a CLAUDE.md that imports it: a line containing `@AGENTS.md` (import syntax is `@path/to/file`, resolved relative to the containing file, maximum 4 hops of recursion; `@` inside backticks stays literal). <!-- source: CC-MEMORY -->
- `CLAUDE.local.md` in the project root loads after CLAUDE.md and is meant to be gitignored — leave it alone; it is the user's personal file. <!-- source: CC-MEMORY -->
- Project skills load from `.claude/skills/<name>/SKILL.md`; personal skills from `~/.claude/skills/`. <!-- source: CC-SKILLS -->
- The structured question tool is **AskUserQuestion**. It is unavailable in non-interactive runs (`claude -p`); a configurable timeout can auto-submit pre-selected options. <!-- source: CC-TOOLS -->

## Codex

- Codex reads AGENTS.md natively: from `~/.codex/` (global; `AGENTS.override.md` wins over `AGENTS.md`), then from the repo root down to the working directory, one file per directory, concatenated root-first so closer files override. Combined size is capped by `project_doc_max_bytes`, default 32 KiB. There is **no** `@file` import mechanism — layering is directory-based only. <!-- source: CODEX-AGENTS -->
- Skills load from `.agents/skills/` in each directory from the working directory up to the repo root, plus `~/.agents/skills/` for the user. Frontmatter requires only `name` and `description`; an optional `agents/openai.yaml` adds display metadata and invocation policy. <!-- source: CODEX-SKILLS -->
- The structured question tool is **`request_user_input`** — collaboration-mode-gated (available in Plan mode; elsewhere it fails fast with a clear error, and it is not available to subagents). Community posts mention an "ask_user_question"/"clarify" tool; that is a proposal, not a shipped tool — do not design against it. <!-- source: CODEX-SKILLS -->
- Non-interactive mode is `codex exec`: fully unattended, human-input tools unavailable, AGENTS.md discovery unchanged. <!-- source: CODEX-EXEC -->

## What this means for the dev skills

- AGENTS.md is the shared instruction file; the one-line CLAUDE.md import makes it reach Claude Code. Keep the marked section small — it counts against Codex's 32 KiB budget along with everything else in AGENTS.md.
- Any skill that wants to ask the user must degrade cleanly: no question tool available → use documented defaults, mark them `# TODO confirm`, and say so.
