# dev-review

Independent review as a specified system instead of a vibe. Finished work (a diff, against its brief and plan) is judged by parallel fresh-context reviewers on separate axes — spec (does it do what the brief says), standards (project rules + a fixed code-smell baseline the repo's own docs override), and security (data-flow-traced, on risky work or security surfaces) — reported apart so one axis can't mask another. Findings carry `Finding [N]` ids, `[CRITICAL]`/`[MUST-FIX]`/`[SHOULD-FIX]`/`[NIT]` severities, confidence levels, and land in ONE review comment per cycle with a merge-readiness verdict up top and nitpicks collapsed. Must-fix findings enter a bounded loop (3 rounds, scoped re-reviews, fresh implementer on round 3), then open adjudication — every dismissal on the record. Cross-agent mode runs the review on the other agent (Codex ↔ Claude) with an announced invocation and a defined handoff, so independence is verifiable. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/vegafactory skills add dev-review --global
```

Or the whole dev workflow at once:

```sh
npx @vegastack/vegafactory skills add --group dev --global
```

`--global` installs into your home directory, where the skill is available in every project; drop it for a project-local install. See the [installer README](../../../packages/cli/README.md) for all flags.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [references/dispatch-prompts.md](references/dispatch-prompts.md) | Verbatim reviewer briefs per axis + the scoped re-review brief |
| [references/security-axis.md](references/security-axis.md) | Data-flow method, security finding format, severity rules |
| [references/cross-agent.md](references/cross-agent.md) | The Codex↔Claude handoff, announcements, fallbacks |
| [assets/review-known-patterns.md.template](assets/review-known-patterns.md.template) | Per-project never-flag seed (every entry needs "Still flag if:") |
| [scripts/lib/skillspector.mjs](scripts/lib/skillspector.mjs) | Locating, installing, upgrading and version-reading the SkillSpector CLI itself — every command behind an injected runner |
| [scripts/skill-scan.mjs](scripts/skill-scan.mjs) | The skill-scan guard: runs NVIDIA SkillSpector over the project's skills, blocks on unsuppressed HIGH/CRITICAL |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract: the upstream command surfaces the guard parses |
| [refresh/sources.json](refresh/sources.json) | Source registry: the SkillSpector install, version and release surfaces the guard parses |
| `tests/` | Bun tests and fixtures (never packaged) |
| `evals/` | Behavioral evals in the agentskills.io format (never packaged) |

## Behavior

Invoked by dev-implement per the project's `review:` knob, by a direct "review this" ask, or by a cross-agent REVIEW REQUEST. Builds a review-package file in `.vegastack/.tmp/`, dispatches the axes as fresh subagents that write reports to disk and return short status, posts the single review comment, and drives the fix loop to a clean verdict or an open adjudication. Guardrails: never pre-judge a reviewer ("do not flag…" is forbidden in dispatches), noise is controlled by hard filters (quiet profile + the known-patterns file), and every run ends with a plain-language summary for the operator.

## Scanning skills

Projects that author agent skills set a `skill-scan:` root in `.vegastack/dev.md`; `none` (or no line) turns the whole thing off and the guard says it skipped. A profile it cannot read is a different answer — that blocks, so the gate can never disable itself by being run from the wrong directory. The guard finds [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) through whatever channel installed it — uv, Homebrew, or pipx — and runs it by absolute path, so it works even when your shell's `PATH` does not have it (a common split between an operator's terminal and an agent's long-running shell). Only a scanner that no channel reports **and** that is not on `PATH` refuses, and that message names every remedy: the install command, `VSK_SKILLSPECTOR` for a wrapper or container, and `skill-scan: none` for a project with no skills.

It also keeps the CLI current. `.vegastack/dev.md`'s `skillspector-update:` knob takes `off | notify | auto` (absent reads as `auto`):

| Value | Behaviour |
|---|---|
| `auto` | installs SkillSpector when absent, upgrades it before every scan; any failure falls back to the installed copy and the scan continues |
| `notify` | reports the newest upstream release and changes nothing |
| `off` | no network, no installs, no upgrades |

The mode is read from the profile on **every** run, `--root` included: `--root` chooses what to scan, never whether this machine may be written to. `--no-provision` forces a single run to leave the machine alone. No version comparison happens before an upgrade, deliberately — `uv tool upgrade` moves the whole dependency tree while the version string can hold steady, so "already current" is not a claim this guard can honestly make. An upgrade that changes anything is reported before the findings, because after an upgrade a new finding is the tool having learned something, not the diff having broken something.

Run it **from your project root**, with `SKILL` standing in for wherever the skill is installed (`.claude/skills/dev-review`, `.agents/skills/dev-review`, …):

```sh
node $SKILL/scripts/skill-scan.mjs --json      # reads the knob and the project baseline; exit 2 = blocked
node $SKILL/scripts/skill-scan.mjs --llm       # adds the semantic pass — advisory, never a gate
node $SKILL/scripts/skill-scan.mjs --root path/to/skills --baseline path/to/baseline.json
node $SKILL/scripts/skill-scan.mjs --no-provision   # this run installs and upgrades nothing
```

With no `--root`, the knob names what to scan and `.vegastack/skillspector-baseline.json` is applied by convention. An explicit `--root` never inherits that baseline — a rule written for your own content should not silence a finding in someone else's skill.

Discovery reads two levels — `<root>/<skill>/` and `<root>/<group>/<skill>/` — matching the authored layout. Anything else holding a `SKILL.md` **blocks rather than being skipped**: buried deeper, dot-prefixed, or behind a symlink (never followed, since a scanner that walks out of its root reports on something it wasn't pointed at). An unscanned skill nobody mentions looks exactly like a clean one, which is the failure this guard exists to prevent.

The baseline has three sections. `rules` suppress a finding by literal `id`/`path`; `fingerprints` accept a one-off by content hash; **`coverage`** accepts a file the scanner could not finish reading, named by `skill` + `file`. That last one is ours rather than SkillSpector's — its baseline suppresses findings only, and has no way to express "I could not finish reading this", which a skill shipping ordinary JavaScript will hit. An acceptance covers exactly the file it names: leave a second unread file unaccounted for and the skill still blocks.

Baseline matchers must be **literal** — `*`, `?`, `[` and `]` are rejected. A single `{"id": "*"}` once silenced every finding while the run reported success, and a fix that rejected `*` was bypassed by `?*` immediately; naming the file is the only version of "as narrow as its cause" a guard can actually check.

It blocks on any unsuppressed **HIGH or CRITICAL** finding, never on the aggregate risk score: that score is inflated by documentation of the very mechanics being scanned and deflated by unrelated suppressions. Suppressions live in a JSON baseline whose every rule carries a `reason` with a **"Still flag if:"** clause — the same discipline as the known-patterns file, enforced here rather than trusted. A degraded scan blocks too: a run whose analyzer failed reports a *higher* score with fewer filtered findings, so its silence proves nothing.

### Vetting a skill you did not write

The same guard answers "should I install this?" for a third-party skill — point `--root` at the directory before it reaches your agent, since an installed skill runs with your agent's authority:

```sh
node $SKILL/scripts/skill-scan.mjs --root ~/Downloads/some-skill
```

The report carries each finding's rule, severity, and `file:line`, plus every entry the baseline suppressed, so the [security axis](references/security-axis.md) can trace them rather than take a score on trust. Treat a hit as a candidate finding, not a verdict — and never downgrade an unexplained HIGH or CRITICAL on the strength of who published it.
