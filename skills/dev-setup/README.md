# dev-setup

The bootstrap for the issue-driven dev workflow: one re-runnable skill that gives a project its profile (`.vegastack/dev.md` with the workflow knobs), a thin marked section in AGENTS.md that both Claude Code and Codex read (with the one-line CLAUDE.md import Claude needs), the five workflow labels on the GitHub repo, and the decision register. `dev-intake`, `dev-implement`, and `dev-ship` invoke it automatically when the profile is missing.

The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/skills add dev-setup
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: detect-first discipline, the interview rounds, write targets, re-run rules |
| [references/harness-facts.md](references/harness-facts.md) | Verified, refresh-tracked Claude Code and Codex mechanics (AGENTS.md handling, skill discovery, question tools) |
| [assets/dev-profile.md.template](assets/dev-profile.md.template) | The `.vegastack/dev.md` starting point |
| [assets/agents-section.md.template](assets/agents-section.md.template) | The marked AGENTS.md block this skill owns |
| [refresh/sources.json](refresh/sources.json) + [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract tracking the six official harness-doc sources |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and the trigger-query fixture (never packaged) |

## Behavior contract

Detect first, ask second: everything findable (repo, stack, commands, existing files, labels) is presented as findings to correct, never as questions. The interview is three short rounds with recommended defaults; only four knobs are real questions. Writes are idempotent — the marked AGENTS.md block is the only thing the skill owns there, hand edits to dev.md always win, and re-runs show diffs before changing anything. With no question tool available (headless runs), it writes documented defaults marked `# TODO confirm` and says so — it never invents preferences.
