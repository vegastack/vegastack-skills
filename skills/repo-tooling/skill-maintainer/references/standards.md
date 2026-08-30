# Tri-harness skill standards

The complete standards reference for skills in this repository, covering the three target harnesses — Claude Code, Codex, Hermes — and the agentskills.io open standard they converge on. Verified 2026-08-08.

Sentences carrying volatile vendor facts end with an HTML `source:` comment naming a registry ID; each ID maps to an entry in [sources.json](../refresh/sources.json). When a source changes, the marked sentences are the edit surface — see [REFRESH.md](../refresh/REFRESH.md). Items flagged **UNVERIFIED** must never be asserted as fact in skill content or reviews.

## agentskills.io open standard

Source: https://agentskills.io/specification. Reference validator: `skills-ref validate` from github.com/agentskills/agentskills. <!-- source: AGENTSKILLS-SPEC -->

- Directory layout: `skill-name/SKILL.md` required; optional `scripts/`, `references/`, `assets/`. <!-- source: AGENTSKILLS-SPEC -->
- Frontmatter — the spec defines exactly six fields: <!-- source: AGENTSKILLS-SPEC -->
  - `name` (required): 1–64 chars, `[a-z0-9-]` only, no leading/trailing hyphen, no consecutive hyphens, must match the parent directory name. <!-- source: AGENTSKILLS-SPEC -->
  - `description` (required): 1–1024 chars, what + when, keyword-rich. <!-- source: AGENTSKILLS-SPEC -->
  - `license` (optional): short string or bundled-file reference. <!-- source: AGENTSKILLS-SPEC -->
  - `compatibility` (optional): 1–500 chars, environment requirements only. <!-- source: AGENTSKILLS-SPEC -->
  - `metadata` (optional): string→string map. <!-- source: AGENTSKILLS-SPEC -->
  - `allowed-tools` (optional): space-separated string; experimental, support varies across harnesses. <!-- source: AGENTSKILLS-SPEC -->
- Progressive disclosure: metadata costs ~100 tokens at startup; SKILL.md body should stay under 5,000 tokens (under 500 lines); bundled resources load on demand; relative file references one level deep. <!-- source: AGENTSKILLS-SPEC -->
- The spec's own version identifier: **UNVERIFIED** — do not cite a spec version number.

## Claude Code

Source: https://code.claude.com/docs/en/skills. <!-- source: CLAUDE-CODE-SKILLS -->

- Discovery: project `.claude/skills/<name>/SKILL.md`, loaded from the start directory and every parent up to the repo root; personal `~/.claude/skills/`; enterprise via managed settings; nested `<subdir>/.claude/skills/` lazy-loaded; plugin `<plugin>/skills/`. Precedence: enterprise > personal > project. Symlinks are followed; skill changes are detected live mid-session. <!-- source: CLAUDE-CODE-SKILLS -->
- Frontmatter: all fields optional in Claude Code itself (directory name is the command name; description recommended). It accepts an extended set beyond the spec six — `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context` (fork), `agent`, `background`, `hooks`, `paths`, `shell`, plus `license`/`compatibility`/`metadata` (accepted but not acted on). <!-- source: CLAUDE-CODE-SKILLS -->
- **Packaging trap:** claude.ai uploads, the Skills API, and `package_skill.py` hard-error on any key outside the spec six (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) — a skill that works in Claude Code can still be unpackageable. <!-- source: CLAUDE-CODE-SKILLS -->
- Context budgets: each skill's `description` (+`when_to_use`) is always in context, truncated at 1,536 chars combined per skill; the body loads on invocation and persists — the first 5,000 tokens are re-attached after compaction, within a 25,000-token budget shared across skills. <!-- source: CLAUDE-CODE-SKILLS -->
- Invocation: implicit matching on description, or direct `/skill-name`. `allowed-tools` is a per-turn permission pre-grant only, not a sandbox. <!-- source: CLAUDE-CODE-SKILLS -->
- Claude-only body features — **never use in this repo's skills** (broken or dead weight elsewhere): <!-- source: CLAUDE-CODE-SKILLS -->
  - `` !`cmd` `` dynamic command-output injection
  - `$ARGUMENTS`, `$0`, `$name` argument placeholders
  - `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}` environment paths
- 2026 changes: commands and skills merged; `context: fork` subagents; skill-level hooks; `paths` glob gating; `skillOverrides`; skills-dir plugins; bundled skills. <!-- source: CLAUDE-CODE-SKILLS -->

## Codex (OpenAI)

Source: https://developers.openai.com/codex/skills (canonical content at learn.chatgpt.com/docs/build-skills.md). <!-- source: CODEX-SKILLS -->

- Discovery order: `$CWD/.agents/skills` → parent directories' `.agents/skills` within a git repo → `$REPO_ROOT/.agents/skills` → `$HOME/.agents/skills` → `/etc/codex/skills` → bundled. Symlinks followed. <!-- source: CODEX-SKILLS -->
- Legacy `~/.codex/skills` discovery: **UNVERIFIED** — no longer documented; do not rely on it.
- Frontmatter: `name` + `description` required; same SKILL.md format as the spec. <!-- source: CODEX-SKILLS -->
- Unknown frontmatter keys: officially undocumented; community evidence says ignored — **UNVERIFIED** officially.
- Optional per-skill `agents/openai.yaml`: <!-- source: CODEX-SKILLS -->
  - `interface`: `display_name`, `short_description`, `icon_small`, `icon_large`, `brand_color`, `default_prompt`
  - `policy`: `allow_implicit_invocation: false` (default true)
  - `dependencies`: `tools: [{type: "mcp", value: "..."}]`
- Invocation: `$` mention, `/skills` list, implicit matching on description. The skill list is capped at 2% of the context window / 8,000 chars — descriptions are shortened first, so front-load trigger words. <!-- source: CODEX-SKILLS -->

## Hermes (Nous Research)

Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills. <!-- source: HERMES-SKILLS -->

- Hermes Agent is Nous Research's open agent harness (github.com/NousResearch/hermes-agent; CLI + desktop + messengers; v0.9.0 Apr 2026), explicitly compatible with the agentskills.io standard. <!-- source: HERMES-SKILLS -->
- Discovery: a single global directory `~/.hermes/skills/` — **no project-level discovery at all**. Extra directories only via `~/.hermes/config.yaml` under `skills.external_dirs` (e.g. `[~/.agents/skills]`). `hermes skills install <source>` installs from hubs/URLs into the global directory after a security scan. <!-- source: HERMES-SKILLS -->
- Frontmatter: `name` + `description` required; optional Hermes fields: `version`, `platforms` (macos, linux), `required_environment_variables`, `requires_toolsets`, `fallback_for_toolsets`, `metadata.hermes.{tags, category, config}`. Name pattern `^[a-z][a-z0-9_-]*$` — must start with a letter (underscores allowed by Hermes but not by the spec; use hyphens). <!-- source: HERMES-SKILLS -->
- Unknown-key handling, and treatment of `allowed-tools`/`license`/`compatibility`: **UNVERIFIED** (presumed ignored; no error reports).
- Triggering: every skill becomes a slash command (`/name args`, chainable); model-side progressive disclosure via `skills_list()` (~3k tokens) then `skill_view(name)`. `/learn` auto-authors SKILL.md. <!-- source: HERMES-SKILLS -->

## Install surfaces

| Harness | Project install | Global install | Notes |
|---|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | parents scanned to repo root; nested dirs lazy-loaded <!-- source: CLAUDE-CODE-SKILLS --> |
| Codex | `.agents/skills/` | `~/.agents/skills/` | also `/etc/codex/skills` and bundled <!-- source: CODEX-SKILLS --> |
| Hermes | — none | `~/.hermes/skills/` | **global only**; extension only via `skills.external_dirs` config <!-- source: HERMES-SKILLS --> |

Installer implication: the `@vegastack/skills` installer must treat Hermes as global-only — a "project install" for Hermes does not exist.

These paths are the harnesses' own discovery rules and are unaffected by how skills are selected. The installer's `--group` and `--all` flags choose *which* skills to act on; an installed skill is always `<surface>/<bare-name>/`, never `<surface>/<group>/<name>/`.

## Portability rules (this repo's policy)

One authored tree, three harnesses. Every skill in `skills/` follows all seven:

1. **Frontmatter:** only `name` + `description` (spec also allows `license`, `compatibility`, `metadata` — off by default here). Never depend on `allowed-tools`. No Claude-only keys: they break claude.ai packaging and are dead weight elsewhere.
2. **Name:** equals the directory name; grammar intersection across harnesses: starts with a lowercase letter, then `[a-z0-9-]`, no consecutive hyphens, no underscores, ≤ 64 chars.
3. **Description:** ≤ 1024 chars, trigger words front-loaded (Codex 2%/8,000-char list budget; Claude Code 1,536-char per-skill listing truncation).
4. **Body syntax:** no Claude-only tokens (list above); scripts referenced as plain relative paths runnable from the skill directory; relative links one level deep.
5. **Size:** SKILL.md under 500 lines / under 5k tokens; detail in `references/`, executables in `scripts/`, templates in `assets/`.
6. **Extra files:** `agents/openai.yaml` is safe to ship — Claude Code and Hermes ignore unknown files.
7. **Per-harness metadata** that must survive claude.ai packaging goes under `metadata:` with namespaced keys (e.g. `metadata.hermes.*`).

Repo enforcement: `packages/cli/scripts/validate-skill.mjs` (run by `bun run check`) accepts exactly the spec six (`name`, `description`, `license`, `compatibility`, `allowed-tools`, `metadata`) and rejects everything else, enforces the full name grammar (lowercase-letter start, no consecutive hyphens, ≤64 chars, name equals the skill directory name), and rejects empty or over-length descriptions and angle brackets. Policy (rule 1) is stricter than the validator; the minimal two keys are the default.

## UNVERIFIED register

Do not assert any of these; if one becomes load-bearing, verify against the live source first and move it into a marked sentence:

- agentskills.io spec version identifier.
- Codex official unknown-frontmatter-key behavior (community: ignored).
- Codex legacy `~/.codex/skills` discovery.
- Hermes unknown-key handling and its treatment of `allowed-tools`/`license`/`compatibility`.
