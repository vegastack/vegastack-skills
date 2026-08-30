# dev-setup

The bootstrap for the issue-driven dev workflow: one re-runnable skill that gives a project — existing or brand-new — its profile (`.vegastack/dev.md`, the project's single canonical process doc), a thin marked section in AGENTS.md that both Claude Code and Codex read (with the one-line CLAUDE.md import Claude needs), the workflow labels on the GitHub repo, and the decision register. It detects the stack against per-stack playbooks and drafts the native release runbook, changelog convention, guards, and the `## Architecture` section dev-architect reads (migrating any legacy `.vegastack/arch.md`); on the user's yes it also scaffolds guard workflow steps, the shared evidence repo, and the decision-capture Stop hook. `dev-intake`, `dev-implement`, and `dev-ship` invoke it automatically when the profile is missing.

The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/skills add dev-setup
npx @vegastack/skills add --group dev-skills   # or the whole dev workflow at once
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: detect-first discipline, the interview rounds, write targets, re-run rules |
| [references/harness-facts.md](references/harness-facts.md) | Verified, refresh-tracked Claude Code and Codex mechanics (AGENTS.md handling, skill discovery, question tools, hooks) plus the shared decision-capture Stop-hook recipe |
| [references/stack-playbooks.md](references/stack-playbooks.md) | Per-stack detection → draft mapping (npm/changesets, Node app, Flutter, Python, Go, generic), the guard library, and the greenfield playbook |
| [assets/dev-profile.md.template](assets/dev-profile.md.template) | The `.vegastack/dev.md` starting point |
| [assets/agents-section.md.template](assets/agents-section.md.template) | The marked AGENTS.md block this skill owns |
| [refresh/sources.json](refresh/sources.json) + [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract tracking the official harness-doc sources |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and the trigger-query fixture (never packaged) |

## Behavior contract

Detect first, ask second: everything findable (repo, stack, commands, existing files, labels) is presented as findings to correct, never as questions. The interview is three short rounds with recommended defaults; only four knobs are real questions. Writes are idempotent — the marked AGENTS.md block is the only thing the skill owns there, hand edits to dev.md always win, and re-runs show diffs before changing anything. With no question tool available (headless runs), it writes documented defaults marked `# TODO confirm` and says so — it never invents preferences.
