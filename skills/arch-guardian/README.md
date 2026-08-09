# arch-guardian

An opinionated senior-architect Agent Skill for VegaStack projects — internal or client. It advises during design, review, ADR, threat-model, migration, and continuous work: contextually by declared **tier** (`prototype` / `production` / `enterprise`) and enabled capabilities, recommending the smallest architecture that meets the requirement, and backing volatile claims with a source-freshness contract. It is advisory-only: no CI gates, no exception machinery, no verdict theater.

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
| `references/architecture/` | 18 normative references, one topic each — stable rule IDs with `MUST`/`MUST NOT`/`SHOULD`/`MAY` language, tier-tagged |
| [references/advisory-report.md](references/advisory-report.md) | The review output contract: severities, evidence discipline, grades, JSON shape, evidence recipes |
| [references/profile-governance.md](references/profile-governance.md) | Slim profile, tier declaration, recorded deviations |
| [references/workflows.md](references/workflows.md) | Greenfield / brownfield / review / migration workflows |
| [references/golden-patterns.md](references/golden-patterns.md) | Implementation patterns for fragile boundaries |
| [references/foundation-compatibility.json](references/foundation-compatibility.json) | Pinned version baselines (supported / candidate / deprecated) with reviewBy dates |
| [references/rule-model.json](references/rule-model.json) | Machine model of rule groups, activation, and tier floors |
| `scripts/` | Deterministic, dependency-free Node scripts (below) |
| `assets/` | Profile JSON Schema (v4), sample profile, [answers example](assets/answers-example.json), ADR/design/threat/deploy templates |
| [refresh/sources.json](refresh/sources.json) | Source registry: freshness snapshot **and** research index (`llms`/docs URLs per source) |
| [refresh/REFRESH.md](refresh/REFRESH.md) | The freshness contract: deterministic refresh, OSV advisory watch, reviewBy nag |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |

## The model: tiers gate concerns, never tools

Projects declare a tier in a slim committed profile. `prototype` guards only irreversibles (no plaintext secrets, no cross-tenant access, no auth bypass); `production` applies full correctness/security/recovery concerns in minimal viable form; `enterprise` adds immutable audit, supply-chain attestation, SCIM depth, formal threat models, and eval/cost gates.

Tools are chosen by **named triggers**, not mandated: the platform's managed secret store is the default at every tier, and OpenBao activates only on real triggers (self-hosting, multi-service identity, BYOK custody, dynamic DB credentials). Better Auth, PostgreSQL, REST/OpenAPI, and OpenTelemetry are standing defaults because they are libraries/standards with no operational cost; OpenBao, Valkey, Kubernetes, WebSockets, and extracted services are trigger-gated. The core principle: **never add a moving service without a named trigger.**

## The architecture profile

Projects declare confirmed facts in `.vegastack/architecture.json` (schema v4, ~12 lines): name, kind, tier, tenancy, hosting, enabled capabilities, and free-form notes. Versions live in lockfiles, never the profile. Start from [assets/answers-example.json](assets/answers-example.json):

```sh
node scripts/profile-tool.mjs inspect .                              # read-only observation
node scripts/profile-tool.mjs scaffold answers.json --dir .          # dry-run draft
node scripts/profile-tool.mjs scaffold answers.json --dir . --write  # atomic, symlink-refusing, --force to overwrite
node scripts/profile-tool.mjs migrate .vegastack/architecture.json --dir .   # v3 -> v4 draft (exceptions become notes)
node scripts/validate-profile.mjs .vegastack/architecture.json       # schema + placeholder validation
```

## Advisory reports

Reviews produce an evidence-backed advisory report ([contract](references/advisory-report.md)): per-area grades (`sound`/`attention`/`at-risk`), findings ranked `critical` / `production-gate` / `enterprise-gate` / `consider` — each with cited `file:line` evidence and its principle ID — plus open questions and honestly-labeled not-verified items. Findings above the project's tier report as that tier's gate, never as defects. The report ends with a stable JSON block so downstream automation (e.g. a ship skill) can act on findings. Nothing gates: the team decides.

Deliberate departures from a recommendation are recorded (profile note or [ADR](assets/adr-template.md)) and keep appearing in reviews as `accepted risk — guardian recommends revisiting`. Recording makes decisions visible; it never silences the advisor.

## Freshness

Volatile claims (pinned versions, vendor mechanism names) are tagged to sources in [refresh/sources.json](refresh/sources.json); durable rules are versionless. A weekly automated refresh re-verifies sources deterministically and opens an evidence-linked PR; it also queries OSV.dev for advisories against every pinned package (fail-closed for critical sources) and warns when a baseline's `reviewBy` date passes without an adoption decision. Registry entries carry `llms`/docs URLs so agents can fetch current vendor detail on demand. Details: [refresh/REFRESH.md](refresh/REFRESH.md).

## For agents: how to behave

Follow [SKILL.md](SKILL.md). The short version: identify the actual decision and the tier first; read only the routed references you need; answer questions directly (recommendation plus one material risk) and reserve the full advisory report for design reviews, ADRs, and migration plans; propose no moving service without naming its trigger; never mutate a repository during read-only work; never invent compliance or project facts; report accepted risk honestly and keep recommending the better path.
