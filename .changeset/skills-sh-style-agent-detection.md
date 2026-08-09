---
"@vegastack/skills": minor
---

skills.sh-style install UX: auto-detect installed agents (~/.claude, ~/.codex or ~/.agents, ~/.hermes) and target them without prompting; a simple numbered picker appears only when nothing is detected. The confusing "codex, claude, hermes, both, all" free-text question and the project/global question are gone — installs are project-local by default, `--global` and `--agent` still override.
