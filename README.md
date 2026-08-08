# VegaStack Skills

Authored Agent Skills for Claude Code, Codex, and Hermes, plus the `@vegastack/skills` npm installer that ships them. Each skill is self-contained: its own entry point, references, deterministic scripts, freshness contract, and walkthrough README.

## Skills

| Skill | What it does | Docs |
|---|---|---|
| [arch-guardian](skills/arch-guardian/) | Opinionated senior-architect advisor: capability-scoped normative rules (107 rules, 18 references), deterministic architecture checks against a committed profile, exception/ADR governance, and a source-freshness contract | [Walkthrough](skills/arch-guardian/README.md) · [SKILL.md](skills/arch-guardian/SKILL.md) |
| [skill-maintainer](skills/skill-maintainer/) | Encodes the verified Agent Skills standards for Claude Code, Codex, Hermes, and agentskills.io — every create/update/rename/release of a skill in this repo runs through its workflows and hard limits | [Walkthrough](skills/skill-maintainer/README.md) · [SKILL.md](skills/skill-maintainer/SKILL.md) |
| [skillify](skills/skillify/) | Repo-local skill factory and auditor: gates whether something should be a skill at all, scaffolds the full per-skill contract, and scores existing skills against a 13-item completeness checklist with behavioral-eval-before-tests discipline | [Walkthrough](skills/skillify/README.md) · [SKILL.md](skills/skillify/SKILL.md) |

Install any skill by name:

```sh
npx @vegastack/skills add arch-guardian
```

Requires Node >= 20.11. Project installs target `.claude/skills` (Claude Code) and `.agents/skills` (Codex); `--global` additionally supports `--agent hermes` (`~/.hermes/skills` — Hermes discovers skills globally only). `list` shows bundled skills; `verify` re-checks installed bytes against the shipped checksum manifest; `remove` uninstalls; `doctor` diagnoses. All commands and flags: [installer README](packages/cli/README.md).

The installer is fully offline with one exception: `doctor` checks npmjs.org for a newer release. No telemetry.

## Repository structure

| Path | Purpose |
|---|---|
| `skills/<name>/` | Authored skill content — the source of truth. Every skill carries `SKILL.md` (agent entry), `README.md` (human/agent walkthrough), `references/`, `scripts/`, `assets/`, `tests/`, and `refresh/` (freshness contract) |
| `packages/cli/` | The `@vegastack/skills` installer. Its skill copy and checksum manifest are generated at build time and are never committed |
| `docs/policies/` | [Release and rollback](docs/policies/release-and-rollback.md) · [Content versioning](docs/policies/content-versioning.md) |
| `.github/workflows/` | CI, tag-driven release (npm trusted publishing + SBOM), and refresh-PR guards |

## How freshness works

Skill content cites external sources (specs, vendor docs, package versions) tracked per skill in `skills/*/refresh/sources.json`, with per-skill agent instructions in `refresh/REFRESH.md`. A weekly automated refresh (.github/workflows/refresh.yml) re-verifies every registry deterministically and maintains one standing evidence-linked PR; a human reviews and merges. CI restricts refresh branches to refresh metadata only and re-fetches claimed versions/checksums so hand-edited or hallucinated values cannot merge. Old installs degrade gracefully: `doctor` reports installed-vs-latest, and advice leaning on a stale critical source is marked not verified rather than asserted.

## Advisory by design

Skill checks inform review; they do not gate anyone's CI by default. Findings use an honest outcome vocabulary (`PASS` / `FAIL` / `EXCEPTED` / `NOT VERIFIED`) and accepted risk stays visible instead of disappearing. Product repos may opt in to gating on check exit codes if they choose.

## Develop

```sh
bun install --frozen-lockfile
bun run check    # validate skills + test + lint + typecheck
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repo layout, rule-authoring rules (stable IDs, never renumber), the no-generated-files policy, and how to add a new skill.

## Security

Report vulnerabilities via [GitHub Security Advisories](SECURITY.md) — not public issues.

## License

[MIT](LICENSE)
