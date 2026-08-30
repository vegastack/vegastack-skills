# @vegastack/skills

Installer for VegaStack Agent Skills — a family of self-contained skills for Claude Code, Codex, and Hermes, shipped in one integrity-checked package.

```sh
npx @vegastack/skills list                      # what is bundled, by group
npx @vegastack/skills add --group dev-skills    # the whole dev workflow, one command
npx @vegastack/skills add dev-architect         # or a single skill
```

## Skills in this package

### `dev-skills` — the issue-driven dev workflow

Install the family with `add --group dev-skills`.

| Skill | What it does |
|---|---|
| `dev-setup` | Bootstraps any project, greenfield included, for the issue-driven dev workflow: stack-playbook-drafted profile, AGENTS.md section, labels, guards, decision register |
| `dev-intake` | Turns ideas, brainstorms, and SOWs into agent-ready GitHub issues with recorded user approval |
| `dev-plan` | Plans an approved issue before any code exists: fresh-grounded questionnaire, strict plan format with Interfaces blocks, the scope ratchet, quick-build inline mode |
| `dev-architect` | Architecture advisor: the locked stack, recorded rejections, and dated platform facts behind a verify-before-you-recommend protocol |
| `dev-implement` | Implements an approved issue end to end, dark: preflight, claim, build, test, review, evidence in the issue |
| `dev-debug` | Reproduce-first bug diagnosis: red command, ranked suspects, regression-test-before-fix |
| `dev-review` | Independent multi-axis review of finished work: spec/standards/security axes, bounded fix loop, cross-agent Codex mode |
| `dev-ship` | Opens the PR, merges, and runs the project's Ship runbook, each only on the user's explicit word |
| `dev-status` | The operator's board: whose move is it, from deterministic gh data |
| `dev-chronicle` | The project's narrative record: story entries per branch and the "catch me up" digest |

### `repo-tooling` — repo-only

These operate on the vegastack-skills repository itself and do nothing useful in another project, so **`--all` skips them**. Install one by name if you are contributing to that repo.

| Skill | What it does |
|---|---|
| `skill-maintainer` | Encodes the Agent Skills standards (Claude Code, Codex, Hermes, agentskills.io) for creating, updating, and releasing skills in a skills repo |
| `skillify` | Turns a feature or workflow into a complete skill conforming to the VegaStack skills contract, or audits an existing one |

## Commands

| Command | What it does |
|---|---|
| `list` | Show the bundled skills |
| `add <selection>` | Install (or upgrade) skills into the selected agent directories |
| `verify [selection]` | Check installed copies against the bundled checksum manifest (all bundled skills when nothing is selected) |
| `doctor` | Diagnose an install: integrity across all skills, dev profile (`.vegastack/dev.md`) presence, installed-vs-latest version |
| `remove <selection>` | Uninstall skills from the selected agent directories |

### Selecting what to act on

`add`, `verify`, and `remove` each take **exactly one** selector. Combining two is an error, not a merge.

| Selector | Means |
|---|---|
| `<skill>` | That one skill. Works for every bundled skill, repo-only ones included |
| `--group <group>` | Every skill in that group |
| `--all` | Every bundled skill **except** the repo-only ones |

A `--group` or `--all` install is **one transaction**: every skill is checked and staged before any of them is committed, so if one fails, none are installed and the destination is left exactly as it was.

```sh
npx @vegastack/skills add --group dev-skills    # the ten dev-workflow skills
npx @vegastack/skills add --all                 # everything worth installing in your project
npx @vegastack/skills verify --group dev-skills # check the family against the manifest
npx @vegastack/skills remove --group dev-skills # uninstall it again
```

## Flags

| Flag | Meaning |
|---|---|
| `--project` / `--global` | Install into the current project (default) or the user's home directory |
| `--group NAME` | Select every skill in a group (see `list` for the groups) |
| `--all` | Select every bundled skill except the repo-only ones |
| `--agent codex\|claude\|hermes\|both\|all` | Target agent runtime(s); `both` = codex+claude |
| `--dir PATH` | Operate on a different project directory |
| `--dry-run` | Show what would change without writing |
| `--force` | Overwrite a modified installed copy |
| `--non-interactive` | Skip prompts and use defaults: `--agent both`, project-local (for automation) |

`--all` and `--agent all` are different axes and are easy to confuse: `--all` chooses **which skills**, `--agent all` chooses **which agent runtimes**. `add --all --agent all --global` is valid and means every installable skill, on every runtime, in your home directory.

Agent targeting is automatic: the CLI detects which agents you have (`~/.claude`, `~/.codex`/`~/.agents`, `~/.hermes`) and targets them without asking — `--agent` overrides. A numbered picker appears only when nothing is detected. Installs are project-local by default; pass `--global` for the home directory (required for Hermes).

## Agent surfaces

| Agent | Project install | Global install |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Hermes | — (Hermes discovers skills globally only) | `~/.hermes/skills/` |

`--agent hermes` therefore requires `--global`; `--agent all` on a project install covers codex+claude and prints a notice about hermes.

## Integrity model

The package ships a checksum manifest that is verified at install and by `verify` — it proves the installed bytes match what was packed, not who published it. Publisher identity is attested separately by npm provenance, generated by the trusted-publishing release pipeline. Verify it with `npm audit signatures` or on the package's npm page.

## Network and telemetry

Zero telemetry. The only network call in the tool is `doctor`'s single version check against registry.npmjs.org (installed-vs-latest); `add`, `verify`, and `remove` are fully offline.

## Requirements

- Node >= 24
- macOS or Linux. Windows is not yet supported (path handling; tracked in the repo issues).

## Docs

Skill content, freshness model, and policies: [github.com/vegastack/vegastack-skills](https://github.com/vegastack/vegastack-skills)

MIT license.
