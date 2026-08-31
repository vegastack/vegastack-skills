# VegaStack Skills

Agent Skills for [Claude Code](https://code.claude.com), [Codex](https://developers.openai.com/codex), and [Hermes](https://hermes-agent.nousresearch.com) — plus the `@vegastack/skills` installer that ships them. Each skill is self-contained: its own entry point, references, deterministic scripts, freshness contract, and walkthrough.

The headline set is **`dev-skills`**: a ten-stage, issue-driven development workflow where every gate that matters is held by a person, not an agent.

## Getting started

Install the dev workflow into your project:

```sh
npx @vegastack/skills add --group dev-skills
```

Then ask your agent to **set up the dev workflow** — that phrasing triggers the `dev-setup` skill.

`dev-setup` writes `.vegastack/dev.md` — your project's handbook: stack, commands, review mode, shipping gates. Everything else reads from it. After that, work flows through GitHub issues: **dev-intake** turns an idea into a brief you approve → **dev-plan** turns the brief into a plan you approve → **dev-implement** builds it and posts evidence → **dev-review** reviews it independently → **dev-ship** opens the PR and merges, each step only on your explicit word.

**Prerequisites.** The installer needs Node >= 24 on macOS or Linux (Windows is not yet supported). The workflow itself also needs `git` and an authenticated GitHub CLI — check with `gh auth status` — because the dev skills work through GitHub issues. `dev-setup` tells you if either is missing, and handles a brand-new project with no remote.

### Other ways to select what you install

`add` and `remove` each take **exactly one** selector; `verify` takes at most one and checks everything installed when given none:

```sh
npx @vegastack/skills add dev-plan              # one skill
npx @vegastack/skills add --group dev-skills    # a whole family
npx @vegastack/skills add --all                 # everything worth installing in a project
npx @vegastack/skills list                      # what is bundled, by group
```

A `--group` or `--all` install is **one transaction**: every skill is staged before any is committed, so if one fails, none are installed.

`--all` deliberately skips the **repo-only** skills (`skill-maintainer`, `skillify`) — those operate on this repository itself and do nothing useful elsewhere. Name one explicitly if you are contributing here.

## Where skills install

Project-local by default; `--global` targets your home directory instead.

| Agent | Project | Global |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Hermes | — not supported | `~/.hermes/skills/` |

The installer detects which agents you have and targets them without asking; `--agent codex|claude|hermes|both|all` overrides. Hermes discovers skills globally only, so `--agent hermes` requires `--global`.

`--all` and `--agent all` are different axes and easy to confuse: **`--all` chooses which skills, `--agent all` chooses which agent runtimes.** `add --all --agent all --global` means every installable skill, on every runtime, in your home directory.

Skills always install **flat**, as `<surface>/<skill-name>/`. Groups are a way of selecting and organising skills — they never appear in an installed path, so `--group` changes what you get, never where it lands.

`verify` re-checks installed bytes against the shipped checksum manifest, `remove` uninstalls, and `doctor` diagnoses an install and reports installed-vs-latest. Every flag: [installer README](packages/cli/README.md).

The installer is fully offline with one exception: `doctor` checks npmjs.org for a newer release. No telemetry.

## Working with an agent

If you are an agent reading this repository, or pointing a user at it:

- **Load a skill by name.** Each skill's `SKILL.md` is the entry point; its `description` states when to trigger. Detail lives in `references/` and loads only when the workflow routes to it.
- **`dev.md` outranks the skills.** A project's `.vegastack/dev.md` is its handbook, and where it disagrees with a skill's default, it wins.
- **Gates are human-held.** No skill authorises approving a brief or a plan, pushing to the default branch, merging, or releasing. Those need the operator's explicit words, every time.
- **The install layout is flat.** A skill is always at `<surface>/<name>/`. Never construct a path containing a group.

## Skills

Every skill currently belongs to a group; the table below is where an ungrouped one would be listed.

<!-- Ungrouped skills go in this table. skillify's scaffold-skill.mjs anchors new ungrouped rows
     on this header and refuses to scaffold without it, so do not delete it when it is empty. -->

| Skill | What it does | Docs |
|---|---|---|

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
| [dev-review](skills/dev-skills/dev-review/) | Independent multi-axis review of finished work — spec, standards, security — with severity-tiered findings and a bounded fix loop; ships the skill-scan vulnerability guard | [Walkthrough](skills/dev-skills/dev-review/README.md) · [SKILL.md](skills/dev-skills/dev-review/SKILL.md) |
| [dev-ship](skills/dev-skills/dev-ship/) | The shipping gates, each spent only by the operator's words: PR, merge per the `merge:` knob, then the project's `## Ship` runbook | [Walkthrough](skills/dev-skills/dev-ship/README.md) · [SKILL.md](skills/dev-skills/dev-ship/SKILL.md) |
| [dev-status](skills/dev-skills/dev-status/) | The operator's board: a deterministic gh-backed gather of state, progress, staleness, and PRs, rendered needs-you-first with one Next action | [Walkthrough](skills/dev-skills/dev-status/README.md) · [SKILL.md](skills/dev-skills/dev-status/SKILL.md) |
| [dev-chronicle](skills/dev-skills/dev-chronicle/) | The project's narrative record — one story entry per behavior-changing branch — plus the "catch me up" digest read from it and the register | [Walkthrough](skills/dev-skills/dev-chronicle/README.md) · [SKILL.md](skills/dev-skills/dev-chronicle/SKILL.md) |

### Repo tooling

Skills that work on this repository itself: they are not installed by --all, and do nothing useful in another project.

| Skill | What it does | Docs |
|---|---|---|
| [skill-maintainer](skills/repo-tooling/skill-maintainer/) | The verified Agent Skills standards for Claude Code, Codex, Hermes, and agentskills.io — every create, update, rename, and release runs through it | [Walkthrough](skills/repo-tooling/skill-maintainer/README.md) · [SKILL.md](skills/repo-tooling/skill-maintainer/SKILL.md) |
| [skillify](skills/repo-tooling/skillify/) | The repo-local skill factory: gates whether something should be a skill at all, scaffolds the contract with its repo wiring, and audits existing skills | [Walkthrough](skills/repo-tooling/skillify/README.md) · [SKILL.md](skills/repo-tooling/skillify/SKILL.md) |

## Repository structure

| Path | Purpose |
|---|---|
| `skills/<name>/`<br>`skills/<group>/<name>/` | Authored skill content — the source of truth. A skill sits at the top level or inside a group, one level deep and no deeper; both are fully supported. Every skill carries `SKILL.md` (agent entry), `README.md` (human/agent walkthrough), `tests/`, and `refresh/` (freshness contract), plus `references/`, `scripts/`, and `assets/` where the skill needs them. A group adds a `GROUP.md` (display title plus one blurb line) beside its skills; the packaged bundle is flat, so a group is a way of selecting and organising skills (`add --group <name>`) and never appears in an installed path |
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

The skill scan is a separate step, not part of `bun run check` — `check` runs on Bun and Node alone, while the scanner needs Python 3.12. `bun run check` must pass before every PR; the scan runs alongside it as pre-merge verification. See [Security](#security) for the command and [CONTRIBUTING.md](CONTRIBUTING.md) for the suppression rules.

See [CONTRIBUTING.md](CONTRIBUTING.md) for repo layout, content-versioning rules, the no-generated-files policy, the skill-scan suppression discipline, and how to add a new skill.

## Security

**These skills are scanned before they ship.** Every skill in this bundle is checked by [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) — 71 vulnerability patterns across prompt injection, data exfiltration, excessive agency, supply chain, and MCP-specific risks — twice: before any push, and again before a release, on the built bundle that npm actually serves. The gate blocks on any unsuppressed HIGH or CRITICAL finding. Suppressions are not a switch: each one is a reviewed entry in [`.vegastack/skillspector-baseline.json`](.vegastack/skillspector-baseline.json) whose written reason must say what would make the pattern a real finding again.

**You can scan any skill the same way — including one you're about to install from someone else.** Agent skills execute with your agent's authority, so "who wrote this and what does it actually do" is a fair question to ask of any of them, ours included:

```sh
uv tool install git+https://github.com/NVIDIA/skillspector.git
npx @vegastack/skills add dev-review --agent claude
node .claude/skills/dev-review/scripts/skill-scan.mjs --root path/to/some-skill
```

The guard ships inside `dev-review` — if `scripts/skill-scan.mjs` is not there, your installed copy predates it; re-run `add` against `@vegastack/skills@latest`.

Point `--root` at a single skill directory or at a directory of them. Exit `0` is clean, `1` clean with warnings, `2` blocked — either by a finding, reported with its rule, severity and `file:line`, or because the scan itself could not be trusted: the scanner missing from PATH, an unreadable report, a baseline that fails its own discipline, or coverage the scanner says it never completed. Without `--root` it reads the `skill-scan:` knob from your project's `.vegastack/dev.md`, and a project with no skills (`skill-scan: none`) is told it was skipped rather than erroring. Add `--llm` for the semantic pass — it needs a provider, is non-deterministic, and is advisory: a run whose analyzer fails scores *higher* than a clean one, which is why the gate never uses it.

The judgement is still yours. A scanner hit is evidence, not a verdict — the `dev-review` skill's [security axis](skills/dev-skills/dev-review/references/security-axis.md) sets out how to trace one before acting on it.

Report vulnerabilities in these skills via [GitHub Security Advisories](SECURITY.md) — not public issues.

## License

[MIT](LICENSE)
