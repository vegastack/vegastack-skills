---
"@vegastack/skills": patch
---

A feature request typed in chat now routes to dev-intake, and a trivial fix stays on dev-implement's direct path, on Claude Code and Codex alike.

- The AGENTS.md dev block gains a six-row routing table (request kind → skill), restates the ship rule as a reversibility principle with the concrete list of actions that wait for the operator's word (push to the default branch, merge, tag, publish, deploy, force-push, `git reset --hard`, branch or worktree deletion, `--no-verify`), and adds a short harness-neutral "Agent conduct" paragraph. Installed projects pick it up on their next dev-setup re-run — the block between the `vsk-dev` markers is the only part of AGENTS.md the skill owns.
- dev-implement, dev-intake, and dev-architect descriptions read as calm conditionals: intake claims "add support for X" phrasings, implement's chat clause is limited to a trivial one-or-two-file fix, and architect's "Consult it BEFORE" becomes "Use when proposing".
- README quick start says how to load a skill by name (`/dev-intake` in Claude Code and Hermes, `$dev-intake` in Codex) when routing needs bypassing.
