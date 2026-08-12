# architect

VegaStack's senior architecture advisor as a skill: it encodes MK's recorded stack
decisions, lean-first principles, and current platform facts so that any team member's
Claude Code/Codex session architects the way MK would — without re-briefing.

Built 2026-08 as a from-scratch replacement for the retired `arch-guardian` skill, distilled
from a full-corpus mining of seven months of session history (1,152 evidence-backed
findings), a cross-repo artifact audit, and live-docs platform research. It is advisory
only: it recommends, records accepted risk, and never gates.

## Shape

| Piece | Purpose |
|---|---|
| `SKILL.md` | Router: operating rules, red lines, and a task→reference table |
| `references/principles.md` | How VegaStack decides — lean-first, trigger-named services, pre-launch delete-not-migrate, each rule with its why |
| `references/stack.md` | The locked stack as a use/not/why decision table |
| `references/pinned-facts.md` | Dated, source-verified platform facts models under-know (the only file that decays — see refresh) |
| `references/project-profile.md` + `assets/arch-template.md` | First-run Q&A → `.vegastack/arch.md` per-project profile; repo wins on drift |
| `references/{web,data,infra,ai-agents,security,mobile}.md` | Domain taste, loaded only when a task touches them |
| `references/advisory.md` | Review discipline, severity honesty, and the team-briefing voice |
| `refresh/` | Freshness contract: weekly scheduled-agent PR over pinned facts + registry baselines |

## Try it

```sh
npx @vegastack/skills add architect
```

Then in a project session: "Should I add Redis for caching?" (expect a trigger-based no),
"Review this project's architecture", or "Set up the architecture profile".

## Maintaining

Taste changes land as normal PRs editing the references. Platform-fact drift arrives via
the weekly refresh PR (see `refresh/REFRESH.md`); never hand-wave a version — every pinned
fact keeps its source URL and verified date. Tests in `tests/` run under `bun test` and
enforce the routing/link/budget contract.
