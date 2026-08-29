# dev-review

Independent review as a specified system instead of a vibe. Finished work (a diff, against its brief and plan) is judged by parallel fresh-context reviewers on separate axes — spec (does it do what the brief says), standards (project rules + a fixed code-smell baseline the repo's own docs override), and security (data-flow-traced, on risky work or security surfaces) — reported apart so one axis can't mask another. Findings carry `Finding [N]` ids, `[CRITICAL]`/`[MUST-FIX]`/`[SHOULD-FIX]`/`[NIT]` severities, confidence levels, and land in ONE review comment per cycle with a merge-readiness verdict up top and nitpicks collapsed. Must-fix findings enter a bounded loop (3 rounds, scoped re-reviews, fresh implementer on round 3), then open adjudication — every dismissal on the record. Cross-agent mode runs the review on the other agent (Codex ↔ Claude) with an announced invocation and a defined handoff, so independence is verifiable. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-review
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [references/dispatch-prompts.md](references/dispatch-prompts.md) | Verbatim reviewer briefs per axis + the scoped re-review brief |
| [references/security-axis.md](references/security-axis.md) | Data-flow method, security finding format, severity rules |
| [references/cross-agent.md](references/cross-agent.md) | The Codex↔Claude handoff, announcements, fallbacks |
| [assets/review-known-patterns.md.template](assets/review-known-patterns.md.template) | Per-project never-flag seed (every entry needs "Still flag if:") |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract (evergreen waiver) |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and fixtures (never packaged) |

## Behavior

Invoked by dev-implement per the project's `review:` knob, by a direct "review this" ask, or by a cross-agent REVIEW REQUEST. Builds a review-package file in `.vegastack/.tmp/`, dispatches the axes as fresh subagents that write reports to disk and return short status, posts the single review comment, and drives the fix loop to a clean verdict or an open adjudication. Guardrails: never pre-judge a reviewer ("do not flag…" is forbidden in dispatches), noise is controlled by hard filters (quiet profile + the known-patterns file), and every run ends with a plain-language summary for the operator.
