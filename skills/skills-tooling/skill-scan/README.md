# skill-scan

The vulnerability guard for agent skills, and the discipline that keeps its suppressions honest. It runs [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) over the skills a project authors — or over a stranger's skill before it reaches your agent — and blocks on any unsuppressed HIGH or CRITICAL finding, never on the aggregate risk score. Suppressions live in a JSON baseline whose every entry is a literal matcher with a `reason` carrying a mandatory "Still flag if:" clause, and whose `coverage` section records the files the scanner could not finish reading, byte-pinned so an edit expires the acceptance rather than silently outliving it. It finds the scanner through whatever channel installed it (uv, Homebrew, pipx), keeps it current per the `skillspector-update:` knob, and refuses rather than guesses when it cannot. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/vegafactory skills add skill-scan --global
```

Or the whole skills-tooling group at once:

```sh
npx @vegastack/vegafactory skills add --group skills-tooling --global
```

`--global` installs into your home directory, where the skill is available in every project; drop it for a project-local install. See the [installer README](../../../packages/cli/README.md) for all flags.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| [scripts/lib/skillspector.mjs](scripts/lib/skillspector.mjs) | Locating, installing, upgrading and version-reading the SkillSpector CLI itself — every command behind an injected runner |
| [scripts/skill-scan.mjs](scripts/skill-scan.mjs) | The skill-scan guard: runs NVIDIA SkillSpector over the project's skills, blocks on unsuppressed HIGH/CRITICAL |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract: the upstream command surfaces the guard parses |
| [refresh/sources.json](refresh/sources.json) | Source registry: the SkillSpector install, version and release surfaces the guard parses |
| `tests/` | Bun tests and fixtures (never packaged) |
| `evals/` | Behavioral evals in the agentskills.io format (never packaged) |

## Behavior

The guard is invoked at `dev-implement`'s Verify gate, from a project's `## Ship` runbook before publishing, and by a direct "scan this" or "is this safe to install" ask. `dev-review`'s Security axis does not run it — it consumes the report and triages what sits below the blocking bar, judging whether anything above it was suppressed rather than fixed.

Two consequences worth stating plainly, because they are what installing this skill actually does:

- **`--all` installs it into every consumer.** The group is installable everywhere, so `vegafactory skills add --all` brings `skill-scan` along even in a project that authors no skills. That project's scan reads `skill-scan: none` (or no line at all) and says it skipped — it does nothing, but it is there.
- **Under `skillspector-update: auto`, it writes to the machine.** `auto` is the value an absent line reads as: the first run installs the SkillSpector CLI through uv, and every later run upgrades it before scanning. `notify` reports the newest release and changes nothing; `off` makes no network call; `--no-provision` opts a single run out. This move changed none of those defaults.

## Scanning skills

Projects that author agent skills set a `skill-scan:` root in `.vegastack/dev.md`; `none` (or no line) turns the whole thing off and the guard says it skipped. A profile it cannot read is a different answer — that blocks, so the gate can never disable itself by being run from the wrong directory. The guard finds [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) through whatever channel installed it — uv, Homebrew, or pipx — and runs it by absolute path, so it works even when your shell's `PATH` does not have it (a common split between an operator's terminal and an agent's long-running shell). Only a scanner that no channel reports **and** that is not on `PATH` refuses, and that message names every remedy: the install command, `VSK_SKILLSPECTOR` for a wrapper or container, and `skill-scan: none` for a project with no skills.

It also keeps the CLI current. `.vegastack/dev.md`'s `skillspector-update:` knob takes `off | notify | auto` (absent reads as `auto`):

| Value | Behaviour |
|---|---|
| `auto` | installs SkillSpector when absent, upgrades it before every scan; any failure falls back to the installed copy and the scan continues |
| `notify` | reports the newest upstream release and changes nothing |
| `off` | no network, no installs, no upgrades |

The mode is read from the profile on **every** run, `--root` included: `--root` chooses what to scan, never whether this machine may be written to. `--no-provision` forces a single run to leave the machine alone. No version comparison happens before an upgrade, deliberately — `uv tool upgrade` moves the whole dependency tree while the version string can hold steady, so "already current" is not a claim this guard can honestly make. An upgrade that changes anything is reported before the findings, because after an upgrade a new finding is the tool having learned something, not the diff having broken something.

Run it **from your project root**, with `SKILL` standing in for wherever the skill is installed (`.claude/skills/skill-scan`, `.agents/skills/skill-scan`, …):

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

It blocks on any unsuppressed **HIGH or CRITICAL** finding, never on the aggregate risk score: that score is inflated by documentation of the very mechanics being scanned and deflated by unrelated suppressions. Suppressions live in a JSON baseline whose every rule carries a `reason` with a **"Still flag if:"** clause — the same discipline as `dev-review`'s known-patterns file, enforced here rather than trusted. A degraded scan blocks too: a run whose analyzer failed reports a *higher* score with fewer filtered findings, so its silence proves nothing.

### Vetting a skill you did not write

The same guard answers "should I install this?" for a third-party skill — point `--root` at the directory before it reaches your agent, since an installed skill runs with your agent's authority:

```sh
node $SKILL/scripts/skill-scan.mjs --root ~/Downloads/some-skill
```

The report carries each finding's rule, severity, and `file:line`, plus every entry the baseline suppressed, so `dev-review`'s [security axis](../../dev/dev-review/references/security-axis.md) can trace them rather than take a score on trust. Treat a hit as a candidate finding, not a verdict — and never downgrade an unexplained HIGH or CRITICAL on the strength of who published it.
