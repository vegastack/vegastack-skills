# VegaStack Skills

Authored Agent Skills for Claude Code, Codex, and Hermes, plus the `@vegastack/skills` npm installer that ships them. Each skill is self-contained: its own entry point, references, deterministic scripts, freshness contract, and walkthrough README.

## Skills

| Skill | What it does | Docs |
|---|---|---|
| [skill-maintainer](skills/skill-maintainer/) | The verified Agent Skills standards for Claude Code, Codex, Hermes, and agentskills.io — every create, update, rename, and release runs through it | [Walkthrough](skills/skill-maintainer/README.md) · [SKILL.md](skills/skill-maintainer/SKILL.md) |
| [skillify](skills/skillify/) | The repo-local skill factory: gates whether something should be a skill at all, scaffolds the contract with its repo wiring, and audits existing skills | [Walkthrough](skills/skillify/README.md) · [SKILL.md](skills/skillify/SKILL.md) |

### Dev workflow

The issue-driven development workflow: ten stages from project bootstrap to the shipped, chronicled change.

| Skill | What it does | Docs |
|---|---|---|
| [dev-setup](skills/dev-skills/dev-setup/) | Bootstraps a project for the issue-driven workflow: `.vegastack/dev.md`, the AGENTS.md section, the workflow labels, and the decision register | [Walkthrough](skills/dev-skills/dev-setup/README.md) · [SKILL.md](skills/dev-skills/dev-setup/SKILL.md) |
| [dev-intake](skills/dev-skills/dev-intake/) | Turns brainstorms, requests, and SOWs into agent-ready issues, with quoted-approval recording that flips `needs-operator` to `ready` | [Walkthrough](skills/dev-skills/dev-intake/README.md) · [SKILL.md](skills/dev-skills/dev-intake/SKILL.md) |
| [dev-plan](skills/dev-skills/dev-plan/) | The planning stage between intake and implementation: approaches, a no-placeholder plan with failing-test-first steps, and the scope ratchet | [Walkthrough](skills/dev-skills/dev-plan/README.md) · [SKILL.md](skills/dev-skills/dev-plan/SKILL.md) |
| [dev-architect](skills/dev-skills/dev-architect/) | VegaStack's architecture advisor: the locked stack, recorded rejections, and dated platform facts behind a verify-before-you-recommend protocol | [Walkthrough](skills/dev-skills/dev-architect/README.md) · [SKILL.md](skills/dev-skills/dev-architect/SKILL.md) |
| [dev-implement](skills/dev-skills/dev-implement/) | Implements an approved issue end to end without user input: preflight, claim, dark build, tests, independent review, evidence comment, hand-back | [Walkthrough](skills/dev-skills/dev-implement/README.md) · [SKILL.md](skills/dev-skills/dev-implement/SKILL.md) |
| [dev-debug](skills/dev-skills/dev-debug/) | Reproduce-first bug work: a red repro command before any theory, ranked falsifiable suspects, and the regression test before the fix | [Walkthrough](skills/dev-skills/dev-debug/README.md) · [SKILL.md](skills/dev-skills/dev-debug/SKILL.md) |
| [dev-review](skills/dev-skills/dev-review/) | Independent multi-axis review of finished work — spec, standards, security — with severity-tiered findings and a bounded fix loop | [Walkthrough](skills/dev-skills/dev-review/README.md) · [SKILL.md](skills/dev-skills/dev-review/SKILL.md) |
| [dev-ship](skills/dev-skills/dev-ship/) | The shipping gates, each spent only by the operator's words: PR, merge per the `merge:` knob, then the project's `## Ship` runbook | [Walkthrough](skills/dev-skills/dev-ship/README.md) · [SKILL.md](skills/dev-skills/dev-ship/SKILL.md) |
| [dev-status](skills/dev-skills/dev-status/) | The operator's board: a deterministic gh-backed gather of state, progress, staleness, and PRs, rendered needs-you-first with one Next action | [Walkthrough](skills/dev-skills/dev-status/README.md) · [SKILL.md](skills/dev-skills/dev-status/SKILL.md) |
| [dev-chronicle](skills/dev-skills/dev-chronicle/) | The project's narrative record — one story entry per behavior-changing branch — plus the "catch me up" digest read from it and the register | [Walkthrough](skills/dev-skills/dev-chronicle/README.md) · [SKILL.md](skills/dev-skills/dev-chronicle/SKILL.md) |

Install any skill by name:

```sh
npx @vegastack/skills add dev-architect
```

Requires Node >= 24. Project installs target `.claude/skills` (Claude Code) and `.agents/skills` (Codex); `--global` additionally supports `--agent hermes` (`~/.hermes/skills` — Hermes discovers skills globally only). `list` shows bundled skills; `verify` re-checks installed bytes against the shipped checksum manifest; `remove` uninstalls; `doctor` diagnoses. All commands and flags: [installer README](packages/cli/README.md).

The installer is fully offline with one exception: `doctor` checks npmjs.org for a newer release. No telemetry.

## Repository structure

| Path | Purpose |
|---|---|
| `skills/<name>/`<br>`skills/<group>/<name>/` | Authored skill content — the source of truth. A skill sits at the top level or inside a group, one level deep and no deeper; both are fully supported. Every skill carries `SKILL.md` (agent entry), `README.md` (human/agent walkthrough), `tests/`, and `refresh/` (freshness contract), plus `references/`, `scripts/`, and `assets/` where the skill needs them. A group adds a `GROUP.md` (display title plus one blurb line) beside its skills; groups are an authoring convenience only — the packaged bundle is flat, so `add <skill>` never names one |
| `tooling/refresh/` | Repo-shared deterministic refresh runner (checksum/version verification), used by every skill's `refresh/sources.json` and both refresh workflows |
| `packages/cli/` | The `@vegastack/skills` installer. Its skill copy and checksum manifest are generated at build time and are never committed |
| `.vegastack/` | This repo's own dev workflow instance (dogfooding the dev skills): [dev.md](.vegastack/dev.md) — the canonical process doc with the release runbook, versioning, and rollback — and [decisions.md](.vegastack/decisions.md) |
| `.github/workflows/` | CI, tag-driven release (npm trusted publishing + SBOM), and refresh-PR guards |

## How freshness works

Skill content cites external sources (specs, vendor docs, package versions) tracked per skill in each skill's `refresh/sources.json`, with per-skill agent instructions in `refresh/REFRESH.md`. A weekly automated refresh (.github/workflows/refresh.yml) re-verifies every registry deterministically and maintains one standing evidence-linked PR; a human reviews and merges. CI restricts refresh branches to refresh metadata only and re-fetches claimed versions/checksums so hand-edited or hallucinated values cannot merge. Old installs degrade gracefully: `doctor` reports installed-vs-latest, and advice leaning on a stale critical source is marked not verified rather than asserted.

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
