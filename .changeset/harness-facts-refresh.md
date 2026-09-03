---
"@vegastack/vegafactory": minor
---

dev-setup's harness facts are current as of 02-09-2026 and now cover three harnesses and the GitHub CLI.

- `references/harness-facts.md` gains Codex hooks (stable: the full event list, `hooks.json` locations, trust gating, `codex exec --dangerously-bypass-hook-trust`), Codex multi-agent (built-in `default`/`worker`/`explorer`, `.codex/agents/*.toml`, the concurrency cap), a Hermes section (`clarify`, `delegate_task`, `pre_tool_call` hooks), the Claude Code `claude_code` preset note, and a `## GitHub CLI` section stating the floors: gh 2.94.0 for native issue types, sub-issues and dependencies, gh 2.97.0 for name-based project field edits.
- Five refresh sources (`CC-SDK-PRESET`, `CODEX-AGENTS-MULTI`, `HERMES-HOOKS`, `HERMES-TOOLS`, `GH-CLI`) join the registry with runner-seeded baselines; a test now holds the source markers and the registry in bijection.
- dev-setup's Step 1 detects `gh --version` and which of `claude`, `codex`, `hermes` are installed, and its report names every gh feature the detected version lacks.
- dev-implement and skillify's eval playbook no longer describe a harness without subagents; all three target harnesses spawn them.
