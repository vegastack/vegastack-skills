# dev-review

Independent review as a specified system instead of a vibe. Finished work (a diff, against its brief and plan) is judged by parallel fresh-context reviewers on separate axes — spec (does it do what the brief says), standards (project rules + a fixed code-smell baseline the repo's own docs override), and security (data-flow-traced, on risky work or security surfaces) — reported apart so one axis can't mask another. Findings carry `Finding [N]` ids, `[CRITICAL]`/`[MUST-FIX]`/`[SHOULD-FIX]`/`[NIT]` severities, confidence levels, and land in ONE review comment per cycle with a merge-readiness verdict up top and nitpicks collapsed. Must-fix findings enter a bounded loop (3 rounds, scoped re-reviews, fresh implementer on round 3), then open adjudication — every dismissal on the record. Cross-agent mode runs the review on the other agent (Codex ↔ Claude) with an announced invocation and a defined handoff, so independence is verifiable. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-review
npx @vegastack/skills add --group dev-skills   # or the whole dev workflow at once
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
| [scripts/skill-scan.mjs](scripts/skill-scan.mjs) | The skill-scan guard: runs NVIDIA SkillSpector over the project's skills, blocks on unsuppressed HIGH/CRITICAL |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract (evergreen waiver) |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and fixtures (never packaged) |

## Behavior

Invoked by dev-implement per the project's `review:` knob, by a direct "review this" ask, or by a cross-agent REVIEW REQUEST. Builds a review-package file in `.vegastack/.tmp/`, dispatches the axes as fresh subagents that write reports to disk and return short status, posts the single review comment, and drives the fix loop to a clean verdict or an open adjudication. Guardrails: never pre-judge a reviewer ("do not flag…" is forbidden in dispatches), noise is controlled by hard filters (quiet profile + the known-patterns file), and every run ends with a plain-language summary for the operator.

## Scanning skills

Projects that author agent skills set a `skill-scan:` root in `.vegastack/dev.md`; `none` (or no line) turns the whole thing off and the guard says it skipped. A profile it cannot read is a different answer — that blocks, so the gate can never disable itself by being run from the wrong directory. The guard needs [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) on PATH — `uv tool install git+https://github.com/NVIDIA/skillspector.git` — and refuses with that instruction when it is absent, rather than passing quietly.

Run it **from your project root**, with `SKILL` standing in for wherever the skill is installed (`.claude/skills/dev-review`, `.agents/skills/dev-review`, …):

```sh
node $SKILL/scripts/skill-scan.mjs --json      # reads the knob and the project baseline; exit 2 = blocked
node $SKILL/scripts/skill-scan.mjs --llm       # adds the semantic pass — advisory, never a gate
node $SKILL/scripts/skill-scan.mjs --root path/to/skills --baseline path/to/baseline.json
```

With no `--root`, the knob names what to scan and `.vegastack/skillspector-baseline.json` is applied by convention. An explicit `--root` never inherits that baseline — a rule written for your own content should not silence a finding in someone else's skill.

Discovery reads two levels — `<root>/<skill>/` and `<root>/<group>/<skill>/` — matching the authored layout. Anything else holding a `SKILL.md` **blocks rather than being skipped**: buried deeper, dot-prefixed, or behind a symlink (never followed, since a scanner that walks out of its root reports on something it wasn't pointed at). An unscanned skill nobody mentions looks exactly like a clean one, which is the failure this guard exists to prevent.

Baseline matchers must be **literal** — `*`, `?`, `[` and `]` are rejected. A single `{"id": "*"}` once silenced every finding while the run reported success, and a fix that rejected `*` was bypassed by `?*` immediately; naming the file is the only version of "as narrow as its cause" a guard can actually check.

It blocks on any unsuppressed **HIGH or CRITICAL** finding, never on the aggregate risk score: that score is inflated by documentation of the very mechanics being scanned and deflated by unrelated suppressions. Suppressions live in a JSON baseline whose every rule carries a `reason` with a **"Still flag if:"** clause — the same discipline as the known-patterns file, enforced here rather than trusted. A degraded scan blocks too: a run whose analyzer failed reports a *higher* score with fewer filtered findings, so its silence proves nothing.

### Vetting a skill you did not write

The same guard answers "should I install this?" for a third-party skill — point `--root` at the directory before it reaches your agent, since an installed skill runs with your agent's authority:

```sh
node $SKILL/scripts/skill-scan.mjs --root ~/Downloads/some-skill
```

The report carries each finding's rule, severity, and `file:line`, plus every entry the baseline suppressed, so the [security axis](references/security-axis.md) can trace them rather than take a score on trust. Treat a hit as a candidate finding, not a verdict — and never downgrade an unexplained HIGH or CRITICAL on the strength of who published it.
