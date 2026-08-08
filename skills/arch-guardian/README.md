# arch-guardian

An opinionated senior-architect Agent Skill for VegaStack projects. It advises during design, review, ADR, threat-model, migration, and continuous work — activating only the capabilities a project has actually enabled, giving one scoped recommendation with an explicit verdict, and backing volatile claims with a source-freshness contract.

This README is the complete walkthrough for humans and for agents reading outside a skill-invocation context. The agent entry point is [SKILL.md](SKILL.md); everything else loads progressively from there.

## Install

```sh
npx @vegastack/skills add arch-guardian
```

Installs into `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex); `--global` targets the home directory. `verify` re-checks installed bytes against the shipped checksum manifest; `remove` uninstalls. See the [installer README](../../packages/cli/README.md) for all flags.

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point: operating rules, progressive routing table, response sizing, guardrails |
| `references/architecture/` | 18 normative references, one topic each — 107 rules with stable IDs and `MUST`/`MUST NOT`/`SHOULD`/`MAY` language |
| [references/profile-governance.md](references/profile-governance.md) | Profile, exception, and ADR governance |
| [references/workflows.md](references/workflows.md) | Greenfield / brownfield / migration / continuous workflows |
| [references/golden-patterns.md](references/golden-patterns.md) | Implementation patterns for fragile boundaries |
| [references/foundation-compatibility.json](references/foundation-compatibility.json) | Pinned version baselines (supported / candidate / deprecated) |
| [references/rule-model.json](references/rule-model.json), [references/control-catalog.json](references/control-catalog.json) | Machine model of rules and checker controls |
| `scripts/` | Deterministic, dependency-free Node scripts (below) |
| `assets/` | Profile JSON Schema, sample profile, [answers example](assets/answers-example.json), ADR/design/threat/deploy templates |
| [refresh/sources.json](refresh/sources.json) | Source registry and publish-time staleness snapshot (34 tracked sources) |
| [refresh/REFRESH.md](refresh/REFRESH.md) | The freshness contract: what may be auto-refreshed, what may only be flagged |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |

## Rule families

DUR 9 (durable execution) · AUTH 7 (identity) · RT 6 (realtime) · DEL 6 (delivery/verification) · SEC 5 · SBX 5 (sandbox) · DATA 5 · CONN 5 (connectors/MCP) · TEN 4 (tenancy/RLS) · RUN 4 (runtime placement) · REL 4 · PKG 4 · PII 4 (AI data boundaries) · MOB 4 (Flutter) · MLIFE 4 (model lifecycle) · HOST 4 · FOUND 4 · EVAL 4 (LLM evals) · COST 4 (AI cost) · API 4 · AGENT 4 · OBS 3 · MODEL 3 · WEB 1.

Rule IDs are stable and never renumbered; see [content versioning](../../docs/policies/content-versioning.md) for what counts as a breaking change.

## The architecture profile

Projects declare confirmed facts in `.vegastack/architecture.json` (schema v3; legacy `.yaml`-named JSON still discovered with a deprecation notice). Checks activate only for declared or observed capabilities — a web-only public product is never asked for RLS, agents, or OpenBao. Start from [assets/answers-example.json](assets/answers-example.json):

```sh
node scripts/profile-tool.mjs inspect .                    # read-only observation, compact summary (--json for full)
node scripts/profile-tool.mjs scaffold answers.json --dir .          # dry-run draft
node scripts/profile-tool.mjs scaffold answers.json --dir . --write  # atomic, symlink-refusing, --force to overwrite
```

## Deterministic checks

```sh
node scripts/validate-profile.mjs .vegastack/architecture.json
node scripts/architecture-check.mjs . --summary   # --json for CI; --help for usage
```

Exit codes: `0` no FAIL findings, `1` FAIL findings present (a review result, not a crash), `2` usage/tool error. Symlinks, agent-skill trees, and generated bundles are skipped and reported in a single `NOT VERIFIED` finding; exclude paths deliberately with a `.guardianignore` file (path prefixes, one per line). Repeated identical-control findings are capped with a suppressed count.

**Outcome vocabulary** — interpret exactly:

| Outcome | Meaning |
|---|---|
| `PASS` | satisfies the recommendation |
| `FAIL` | violates it without a valid exception |
| `EXCEPTED` | active project-owner accepted risk — CI may pass, but it remains visibly noncompliant and the verdict stays `REJECT` |
| `NOT VERIFIED` | recorded honestly with reason, risk, owner, and next action — never silently dropped |

Checks are **advisory**: findings inform review. Product repos may opt in to gating on the exit code if they choose.

## Exceptions and ADRs

A project owner can accept any scoped risk with an exception in the profile plus a matching ADR ([template](assets/adr-template.md)). An exception names one rule and exact paths; it may list specific control IDs, or omit them to cover every control under that rule — in which case the ADR must state `Control-IDs: all`. Wildcard and directory-prefix suppression are forbidden. Invalid, expired, or scope-mismatched exceptions fail closed.

## Freshness

Volatile claims (pinned versions, vendor mechanism names) are tagged to sources in [refresh/sources.json](refresh/sources.json); durable rules are versionless. A weekly automated refresh re-verifies sources deterministically and opens an evidence-linked PR; CI restricts refresh branches to refresh metadata and re-fetches claimed baselines so hand-edited values cannot merge. Before advice that leans on a critical source, agents check freshness (`scripts/refresh-evidence.mjs --topics <affected>`) or mark the claim `NOT VERIFIED`. Details: [refresh/REFRESH.md](refresh/REFRESH.md).

## For agents: how to behave

Follow [SKILL.md](SKILL.md). The short version: identify the actual decision first; read only the routed references you need; answer questions directly (verdict, recommendation, one risk) and reserve the full 8-part contract for design reviews, ADRs, and migration plans; never mutate a repository during read-only work; never invent compliance or project facts; state `GUARDIAN VERDICT: REJECT` when warranted even where an ADR makes CI pass.
