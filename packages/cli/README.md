# @vegastack/vegafactory

Installer for VegaStack Agent Skills — a family of self-contained skills for Claude Code, Codex, and Hermes, shipped in one integrity-checked package.

Install the whole dev workflow, once per machine:

```sh
npx @vegastack/vegafactory skills add --group dev --global
```

`--global` is the recommended install: the skills land in your home directory and are available in every project you open. Drop it for a project-local install when a repository should carry its own copy.

See what else is bundled:

```sh
npx @vegastack/vegafactory skills list
```

## Skills in this package

### `dev` — the issue-driven dev workflow

Install the family with `add --group dev --global`.

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

These operate on the vegafactory repository itself and do nothing useful in another project, so **`--all` skips them**. Install one by name if you are contributing to that repo.

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
| `sync` | Refresh this machine's shallow control-room clone from the repo's `control-room:` knob |

### Selecting what to act on

`add`, `verify`, and `remove` each take **exactly one** selector. Combining two is an error, not a merge.

| Selector | Means |
|---|---|
| `<skill>` | That one skill. Works for every bundled skill, repo-only ones included |
| `--group <group>` | Every skill in that group |
| `--all` | Every bundled skill **except** the repo-only ones |

A `--group` or `--all` install is **one transaction**: every skill is checked and staged before any of them is committed, so if one fails, none are installed and the destination is left exactly as it was.

The ten dev-workflow skills:

```sh
npx @vegastack/vegafactory skills add --group dev --global
```

Everything worth installing outside this repo:

```sh
npx @vegastack/vegafactory skills add --all --global
```

Check the family against the manifest:

```sh
npx @vegastack/vegafactory skills verify --group dev --global
```

Uninstall it again:

```sh
npx @vegastack/vegafactory skills remove --group dev --global
```

## Upgrading and health checks

Upgrade to the latest release. `--force` is required because `add` refuses to overwrite an installed copy that differs from the bundle rather than silently discarding local edits:

```sh
npx @vegastack/vegafactory@latest skills add --group dev --global --force
```

Diagnose an install — integrity across all skills, plus installed-vs-latest version:

```sh
npx @vegastack/vegafactory skills doctor --global
```

Run `doctor` without `--global` from inside a project to additionally check that project's `.vegastack/dev.md` profile; the global run skips that check, since the profile is per-project by design.

## Control-room sync

An organisation can keep its shared defaults — org policy, per-group knobs, people, decisions — in a **control room** repository. Every machine reads a shallow clone of it rather than the network, so a GitHub outage degrades to "last synced <time>" instead of failing.

```sh
vegafactory sync            # refresh if the last fetch is older than sync-max-age
vegafactory sync --force    # refresh regardless
vegafactory sync --json     # the machine-readable report (what hooks and the dispatcher read)
vegafactory sync --dry-run  # print the plan, write nothing
```

- The project's `.vegastack/dev.md` names the control room: `control-room: <org>/<repo>#<group>@<sha7>`, where the trailing sha is the clone commit the profile was drafted from. `control-room: none`, or no line at all, means the skill defaults apply and `sync` exits 0 doing nothing.
- The clone lives at `~/.vegastack/control-room/<org>/` — one per org.
- The machine-local state document `~/.vegastack/factory.json` records, per org, the clone `path`, its `remote` and `branch`, and the timestamp of the **last successful fetch**. Freshness is measured from that timestamp, never from the directory's mtime. Editing `path`, `remote` or `branch` there points a repo at a different control room; nothing in the repository has to change.
- `sync-max-age: 30m` in `.vegastack/dev.md` (`<n>m` or `<n>h`) is how stale the clone may be before a session refreshes it. The SessionStart hook runs `sync` in the background past that age.
- Authentication is your existing `gh` credential over HTTPS, injected per invocation — no token reaches argv, the remote URL, or the clone's config, and no second credential is set up.
- `sync` never commits and never pushes: the clone is read-only to this verb.

Exit codes: **0** synced, already fresh, or the repo names no control room · **1** the fetch failed and the existing clone stands (the report says when it last synced) · **2** a refusal.

Two refusals are deliberate and fail closed:

- a clone with local modifications is never reset — `sync` refuses and names the path, because nobody should hand-edit the clone;
- a symlink on the clone path or its parent is refused before any git call.

An unreadable `~/.vegastack/factory.json` is also a refusal, never a silent reset: resetting it would drop every other org's clone record.

## Flags

| Flag | Meaning |
|---|---|
| `--project` / `--global` | Install into the current project (default) or the user's home directory |
| `--group NAME` | Select every skill in a group (see `list` for the groups) |
| `--all` | Select every bundled skill except the repo-only ones |
| `--agent codex\|claude\|hermes\|both\|all` | Target agent runtime(s); `both` = codex+claude |
| `--dir PATH` | Operate on a different project directory; not valid with `--global` |
| `--dry-run` | Show what would change without writing |
| `--force` | Overwrite a modified installed copy; for `sync`, refresh regardless of `sync-max-age` |
| `--json` | Machine-readable output (`sync`) |
| `--non-interactive` | Skip prompts and use defaults: `--agent both`, project-local (for automation) |
| `--version` / `-v` | Print the installer version |
| `--help` / `-h` | Print usage |

`--all` and `--agent all` are different axes and are easy to confuse: `--all` chooses **which skills**, `--agent all` chooses **which agent runtimes**. `add --all --agent all --global` is valid and means every installable skill, on every runtime, in your home directory.

Agent targeting is automatic: the CLI detects which agents you have (`~/.claude`, `~/.codex`/`~/.agents`, `~/.hermes`) and targets them without asking — `--agent` overrides. A numbered picker appears only when nothing is detected.

## Agent surfaces

`--global` is the recommended install and the only one that can cover all three runtimes at once. `--project` is the flag default, so pass `--global` explicitly.

| Agent | Global install (recommended) | Project install |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Codex | `~/.agents/skills/` | `.agents/skills/` |
| Hermes | `~/.hermes/skills/` | — (Hermes discovers skills globally only) |

`--agent hermes` therefore requires `--global`; `--agent all` on a project install covers codex+claude and prints a notice about hermes.

Prefer a project install when a repository should carry its own copy — so collaborators get the same skills from a checkout, or so one project can pin a version while the rest of the machine moves on. Pick one or the other per skill rather than both: in Claude Code a personal (global) skill takes precedence over a project one, so a project-local copy would not override a global install of the same skill.

## Integrity model

The package ships a checksum manifest that is verified at install and by `verify` — it proves the installed bytes match what was packed, not who published it. Publisher identity is attested separately by npm provenance, generated by the trusted-publishing release pipeline. Verify it with `npm audit signatures` or on the package's npm page.

## Network and telemetry

Zero telemetry. The tool makes two kinds of network call: `doctor`'s single version check against registry.npmjs.org, and `sync`'s shallow git fetch of the control room named by the project's `control-room:` knob, authenticated with your existing `gh` credential. `add`, `verify`, and `remove` are fully offline.

## Requirements

- Node >= 24
- macOS or Linux. Windows is not yet supported (path handling; tracked in the repo issues).

## Docs

Skill content, freshness model, and policies: [github.com/vegastack/vegafactory](https://github.com/vegastack/vegafactory)

MIT license.
