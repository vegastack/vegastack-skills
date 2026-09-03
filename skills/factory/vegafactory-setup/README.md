# vegafactory-setup

TODO: one-paragraph summary for humans and agents browsing the repo. The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/vegafactory skills add vegafactory-setup --global
```

Or the whole factory family at once:

```sh
npx @vegastack/vegafactory skills add --group factory --global
```

`--global` installs into your home directory, where the skill is available in every project; drop it for a project-local install.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [references/control-room.md](references/control-room.md) | The control room's layout, precedence, read path, and file rules |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract |
| [refresh/sources.json](refresh/sources.json) | Source registry for volatile claims |
| `tests/` | Bun tests and fixtures (never packaged) |
| `evals/` | Behavioral evals in the agentskills.io format (never packaged) |

## Behavior

TODO: what the skill does when invoked, its output contract, and its guardrails.
