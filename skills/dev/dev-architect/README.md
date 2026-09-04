# dev-architect

VegaStack's architecture advisor as a skill — the fifth member of the dev family.
It encodes MK's recorded stack decisions, rejections, lean-first principles, and current
platform facts so that any team member's Claude Code/Codex session architects the way the
architecture owner (dev.md `architect:`) would, without re-briefing — and it verifies
platform claims against live docs before recommending on them (the
verify-before-you-recommend protocol) instead of trusting training-data memory.

Rebuilt 2026-08 from the original `architect` skill (itself distilled from a full-corpus
mining of seven months of session history): renamed into the dev family,
deduplicated to one-rule-one-home, and integrated with the workflow — `dev-setup` writes
the `## Architecture` section of `.vegastack/dev.md` this skill consumes, `dev-intake`
routes stack-bearing approach choices here, and decisions land as one-line entries in
`.vegastack/decisions.md`. It is advisory only: it recommends, records accepted risk, and
never gates.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Router: operating rules, the verify protocol, red lines, and a task→reference table |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [references/principles.md](references/principles.md) | How VegaStack decides, reviews, and talks — lean-first, trigger-named services, severity honesty, the briefing voice |
| [references/stack.md](references/stack.md) | The locked stack as a use/not/why decision table |
| [references/pinned-facts.md](references/pinned-facts.md) | Dated, source-verified platform facts models under-know — the verify protocol's cache (the only file that decays; see refresh) |
| [references/web.md](references/web.md) | Domain taste for the web, loaded only when a task touches it |
| [references/data.md](references/data.md) | Domain taste for data, loaded only when a task touches it |
| [references/infra.md](references/infra.md) | Domain taste for infrastructure, loaded only when a task touches it |
| [references/ai-agents.md](references/ai-agents.md) | Domain taste for AI agents, loaded only when a task touches it |
| [references/security.md](references/security.md) | Domain taste for security, loaded only when a task touches it |
| [references/mobile.md](references/mobile.md) | Domain taste for mobile, loaded only when a task touches it |
| `refresh/` | Freshness contract: weekly scheduled-agent PR over pinned facts + registry baselines |
| `tests/` | Bun tests and fixtures (never packaged) |
| `evals/` | Behavioral evals in the agentskills.io format (never packaged) |

The per-project architecture facts live in the `## Architecture` section of
`.vegastack/dev.md` (created by `dev-setup`), and directional decisions in the project's
decision register — this skill ships no templates of its own.

## Try it

```sh
npx @vegastack/vegafactory skills add dev-architect --global
```

Or the whole dev workflow at once:

```sh
npx @vegastack/vegafactory skills add --group dev --global
```

Then in a project session: "Should I add Redis for caching?" (expect a trigger-based no),
"Review this project's architecture", or "Does Hyperdrive support Postgres 18?" (expect a
verified answer with its source).

`--global` installs into your home directory, where the skill is available in every project; drop it for a project-local install. See the [installer README](../../../packages/cli/README.md) for all flags.

## Maintaining

Taste changes land as normal PRs editing the references — one rule, one home; cross-refs
by filename. Platform-fact drift arrives via the weekly refresh PR (see
`refresh/REFRESH.md`); never hand-wave a version — every pinned fact keeps its source URL
and verified date. Tests in `tests/` run under `bun test` and enforce the
routing/link/budget contract.
