# VegaStack Skills

Authored Agent Skills for Claude Code, Codex, and Hermes, plus the `@vegastack/skills` npm installer that ships them. Each skill is self-contained: its own entry point, references, deterministic scripts, freshness contract, and walkthrough README.

## Skills

| Skill | What it does | Docs |
|---|---|---|
| [skill-maintainer](skills/skill-maintainer/) | Encodes the verified Agent Skills standards for Claude Code, Codex, Hermes, and agentskills.io — every create/update/rename/release of a skill in this repo runs through its workflows and hard limits | [Walkthrough](skills/skill-maintainer/README.md) · [SKILL.md](skills/skill-maintainer/SKILL.md) |
| [skillify](skills/skillify/) | Repo-local skill factory and auditor: gates whether something should be a skill at all, scaffolds the per-skill contract with automatic repo wiring, and scores existing skills against an 8-item completeness checklist with behavioral-eval-before-tests discipline | [Walkthrough](skills/skillify/README.md) · [SKILL.md](skills/skillify/SKILL.md) |
| [dev-architect](skills/dev-architect/) | VegaStack's architecture advisor: the locked stack, recorded rejections, and lean-first principles as evidence-distilled decision tables, dated source-verified platform facts behind a verify-before-you-recommend protocol, reading the `## Architecture` section of `.vegastack/dev.md` | [Walkthrough](skills/dev-architect/README.md) · [SKILL.md](skills/dev-architect/SKILL.md) |
| [dev-setup](skills/dev-setup/) | Bootstraps any project — greenfield included — for the issue-driven dev workflow: `.vegastack/dev.md` as the single canonical process doc (stack-playbook-drafted release runbook, changelog convention, guards), a marked AGENTS.md section plus the CLAUDE.md import, the workflow labels (names from the `labels:` knob), and the decision register — detect-first, idempotent re-runs, auto-invoked by the other dev skills | [Walkthrough](skills/dev-setup/README.md) · [SKILL.md](skills/dev-setup/SKILL.md) |
| [dev-intake](skills/dev-intake/) | Turns brainstorms, feature requests, and SOWs into agent-ready GitHub issues: grilling-style rounds with recommended answers, vertical-slice issues wired with native dependencies and milestones, and quoted-approval recording that flips `needs-operator` to `ready` | [Walkthrough](skills/dev-intake/README.md) · [SKILL.md](skills/dev-intake/SKILL.md) |
| [dev-plan](skills/dev-plan/) | The planning stage between intake and implementation: fresh-grounded questionnaire (approaches, system design, risk, brief challenge) with recommended answers, a strict no-placeholder plan format with per-task Interfaces blocks and failing-test-first steps, the one-way scope ratchet, and an inline mode for quick-build issues | [Walkthrough](skills/dev-plan/README.md) · [SKILL.md](skills/dev-plan/SKILL.md) |
| [dev-implement](skills/dev-implement/) | Implements an approved issue end to end without user input: fail-closed preflight, claim by assignee + `working` label, dark execution bounded by the brief and the dev.md stop-list, tests, independent review, one in-place evidence comment, hand-back with `for-operator` | [Walkthrough](skills/dev-implement/README.md) · [SKILL.md](skills/dev-implement/SKILL.md) |
| [dev-review](skills/dev-review/) | Independent multi-axis review of finished work: spec, standards, and security reviewers run as parallel fresh subagents with severity-tiered `Finding [N]` output in one in-place review comment, a 3-round bounded fix loop with open adjudication, hard noise filters, and announced Codex↔Claude cross-agent mode | [Walkthrough](skills/dev-review/README.md) · [SKILL.md](skills/dev-review/SKILL.md) |
| [dev-ship](skills/dev-ship/) | The shipping gates, each spent only by the user's words: PR creation linked to the issue's evidence, a merge instruction that re-verifies the reviewed head, merges per the project's `merge:` knob, and appends approved decisions to the register — then runs the dev.md `## Ship` runbook (releases, local guards, deploys) | [Walkthrough](skills/dev-ship/README.md) · [SKILL.md](skills/dev-ship/SKILL.md) |
| [dev-status](skills/dev-status/) | The operator's board: a deterministic gh-backed script gathers state labels, plan-checkbox progress, ledger staleness, open PRs, and unrecorded decision proposals; the skill renders the needs-you-first report with one Next action | [Walkthrough](skills/dev-status/README.md) · [SKILL.md](skills/dev-status/SKILL.md) |
| [dev-chronicle](skills/dev-chronicle/) | The project's narrative record: story-language entries per behavior-changing branch in `.vegastack/chronicle.md` (what/why/how-it-went, append-only, newest first) and the "catch me up" digest — story so far, recent chapters, open threads — read from the chronicle and register only | [Walkthrough](skills/dev-chronicle/README.md) · [SKILL.md](skills/dev-chronicle/SKILL.md) |

Install any skill by name:

```sh
npx @vegastack/skills add dev-architect
```

Requires Node >= 24. Project installs target `.claude/skills` (Claude Code) and `.agents/skills` (Codex); `--global` additionally supports `--agent hermes` (`~/.hermes/skills` — Hermes discovers skills globally only). `list` shows bundled skills; `verify` re-checks installed bytes against the shipped checksum manifest; `remove` uninstalls; `doctor` diagnoses. All commands and flags: [installer README](packages/cli/README.md).

The installer is fully offline with one exception: `doctor` checks npmjs.org for a newer release. No telemetry.

## Repository structure

| Path | Purpose |
|---|---|
| `skills/<name>/` | Authored skill content — the source of truth. Every skill carries `SKILL.md` (agent entry), `README.md` (human/agent walkthrough), `tests/`, and `refresh/` (freshness contract), plus `references/`, `scripts/`, and `assets/` where the skill needs them |
| `tooling/refresh/` | Repo-shared deterministic refresh runner (checksum/version verification), used by every skill's `refresh/sources.json` and both refresh workflows |
| `packages/cli/` | The `@vegastack/skills` installer. Its skill copy and checksum manifest are generated at build time and are never committed |
| `.vegastack/` | This repo's own dev workflow instance (dogfooding the dev skills): [dev.md](.vegastack/dev.md) — the canonical process doc with the release runbook, versioning, and rollback — and [decisions.md](.vegastack/decisions.md) |
| `.github/workflows/` | CI, tag-driven release (npm trusted publishing + SBOM), and refresh-PR guards |

## How freshness works

Skill content cites external sources (specs, vendor docs, package versions) tracked per skill in `skills/*/refresh/sources.json`, with per-skill agent instructions in `refresh/REFRESH.md`. A weekly automated refresh (.github/workflows/refresh.yml) re-verifies every registry deterministically and maintains one standing evidence-linked PR; a human reviews and merges. CI restricts refresh branches to refresh metadata only and re-fetches claimed versions/checksums so hand-edited or hallucinated values cannot merge. Old installs degrade gracefully: `doctor` reports installed-vs-latest, and advice leaning on a stale critical source is marked not verified rather than asserted.

## Advisory reviews, user-held gates

Architecture review (`dev-architect`) is advisory by design: evidence-backed reports with honest severities (`critical` / `production-gate` / `consider`), unverified claims labeled rather than asserted, and deliberately accepted risk kept visible instead of suppressed. The dev workflow skills are the complement: their gates are real, and every one of them is held by the user — agents can never approve, ship, or merge on their own authority.

## Develop

```sh
bun install --frozen-lockfile
bun run check    # validate skills + test + lint + typecheck
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repo layout, content-versioning rules, the no-generated-files policy, and how to add a new skill.

## Security

Report vulnerabilities via [GitHub Security Advisories](SECURITY.md) — not public issues.

## License

[MIT](LICENSE)
