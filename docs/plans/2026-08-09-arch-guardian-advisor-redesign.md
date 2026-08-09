# arch-guardian v2 — Advisor Redesign Plan

**Date:** 2026-08-09
**Decided with owner (interview):** advisory-only (no exceptions, no ADR-waiver machinery); drop the deterministic checker in favor of an evidence-backed advisory report; three tiers (prototype / production / enterprise) declared at project level; slim-but-required profile; all projects are VegaStack projects (internal or client); avoid infra/scope creep — tools are contextual recommendations, not mechanical mandates; no revenue/"paying tenant" framing anywhere.
**Delegated to this plan:** how tiers and tools interact; what happens to checklist-style rules; advisory-report design; what gets deleted vs kept.

---

## 1. Target operating model

### 1.1 The guardian is an advisor, not an enforcer

- It interviews, observes the repo, recommends, and reviews. It never gates, never maintains an exception ledger, and never carries a standing `REJECT` against a decision the team made deliberately.
- Its outputs are: direct answers, design recommendations, and **advisory reports** (structured, evidence-backed, severity-ranked — format in §3).
- A future `ship` skill consumes advisory reports (stable JSON shape) so agents (Claude/Codex/etc.) can validate and act on findings. The report format is the machine-actionable bridge that replaces checker exit codes.

### 1.2 Tiers gate concerns, not tools

Project declares one tier in the profile:

| Tier | Meaning | Rigor floor |
|---|---|---|
| `prototype` | Exploring, internal, disposable-adjacent | Only irreversibles: no plaintext secrets in code, no cross-tenant leaks in anything multi-tenant, no auth bypass, reversible data decisions |
| `production` | Real users depend on it | Full correctness/security/recovery concerns for enabled capabilities, minimal viable form |
| `enterprise` | Compliance, high-security, advanced posture | Adds audit immutability, SBOM/provenance, SCIM/deprovisioning depth, formal threat models, eval/cost gates |

A tier sets **what must be addressed** (concerns). It never mechanically selects a tool.

### 1.3 Tools: default + escalation triggers ("minimum viable architecture")

New foundation principle (replaces tool-bound MUSTs where the tool was doing invariant duty):

> Never add a moving service without a named trigger. Every infra addition states the trigger it satisfies and the simpler option it replaces.

Each capability gets a **default** (simplest thing that satisfies the invariant) and **named escalation triggers** (conditions that justify heavier infra). Worked examples the references must encode:

| Capability | Invariant (tier-gated MUST) | Default | Escalate when (named triggers) |
|---|---|---|---|
| Secrets | No plaintext in code/logs/telemetry; rotation possible; least privilege | Platform/managed secret store (Vercel/CF env, cloud secret manager) | Self-hosted infra, multi-service identity (mTLS/short-lived creds), BYOK custody, dynamic DB credentials → OpenBao |
| Auth | Sessions/OAuth done correctly, server-side membership resolution | **Better Auth — standing default at every tier** (library, not a service; no infra cost) | — (SSO/SCIM plugins activate at enterprise) |
| Jobs | Atomic admission, retries, idempotent effects | pg-boss when Postgres exists (no new service); simple cron/queue at prototype | Volume/fairness/DLQ needs → keep pg-boss, tune |
| Agent execution | One durable owner of workflow state; replayable; fenced effects | EVE+Postgres World when durable agent execution genuinely exists | Prototype agents MAY run simpler loops with a named migration path to EVE before production tier |
| Cache | Correctness never depends on cache | None | Measured hot-path need → Valkey |
| Tenancy | No cross-tenant access (any tier, if multi-tenant) | Composite keys + forced RLS (this stays a hard MUST — it is an invariant, not infra) | — |

Better Auth, PostgreSQL, REST/OpenAPI, OTel remain standing stack defaults (they are libraries/standards, not operational burdens). OpenBao, Valkey, Kubernetes, separate services, WebSockets, cells — all trigger-gated.

### 1.4 Slim-but-required profile (schema v4)

~12 lines. Advisor memory + tier declaration; no ceremony:

```json
{
  "schemaVersion": 4,
  "project": { "name": "…", "kind": "saas|internal-tool|client-site|api|package", "tier": "prototype|production|enterprise", "tenancy": "single|multi-shared|multi-isolated|none" },
  "hosting": "self-hosted|vercel|cloudflare-opennext|none",
  "capabilities": ["web", "flutter", "agents", "jobs", "connectors", "sandbox", "knowledge", "models", "realtime", "notifications", "enterprise-identity"],
  "notes": ["free-form confirmed facts the team wants remembered"]
}
```

- Capabilities = a simple enabled list (absence = disabled). Versions come from lockfiles/manifests at read time — never duplicated into the profile.
- **Deleted from schema:** exceptions[], ownership enums, controls/owner fields, per-capability versions/placement/sourceRoots, profileStatus confirmed/draft ceremony, foundation pin (replaced by a single `foundationVersion` string the skill stamps for drift awareness).

---

## 2. What gets deleted (the big simplification)

| Delete | Why |
|---|---|
| `scripts/architecture-check.mjs` + its tests + fixtures | Checker dropped per decision. Its deep detection ideas (RLS greps, secret sentinels, placement checks) move into the advisory-review reference as **evidence-gathering recipes** the agent runs ad hoc (plain grep/read), cited as evidence in reports |
| Exception machinery everywhere | No exceptions in advisory mode: schema fields, matcher code, `EXCEPTED` outcome, FOUND-002, exception sections of profile-governance, ADR-as-waiver framing |
| `PASS/FAIL/EXCEPTED/NOT VERIFIED` outcome vocabulary | Replaced by advisory severities (§3). "NOT VERIFIED" survives as an honesty rule: unverified claims are labeled as such in reports |
| `GUARDIAN VERDICT: REJECT` theater | Replaced by graded assessment (§3) |
| `control-catalog.json` | Existed to map checker controls; no checker |
| `verify-corpus.mjs` checker-coupled parts | Keep only what validates prose/link/source-ID consistency |
| "first paying tenant" phrasing (DUR-007, profile-governance) | Money framing removed → "before production tier" |
| CI/gating language in README/SKILL.md | Advisory-only, consistently |

**Kept:** `profile-tool.mjs` (slimmed: inspect/observe + scaffold slim v4), `validate-profile.mjs` (slimmed to v4 schema), `refresh-evidence.mjs` + the whole refresh system (it works), `schema-validate.mjs`, ADR template (**as an optional decision-record tool** — teams that want to record a decision use it; nothing requires it), threat-model/design/deploy templates (tier-scoped).

---

## 3. Advisory report contract (replaces the checker)

Produced by the agent during reviews; consumable by humans and by the future ship skill.

**Severities:** `critical` (security/correctness/data-loss — fix now, any tier) · `production-gate` (must be addressed before/at production tier) · `enterprise-gate` · `consider` (improvement, explicitly optional).

**Evidence discipline (anti-false-positive rules, hard requirements):**
1. Every finding cites concrete evidence: `file:line`, config key, schema line, or a fetched source URL. No evidence → it is a **question**, listed separately, never a finding.
2. Findings state the principle/rule ID they derive from, so "why is this on for me" is always answerable.
3. Detection heuristics are never claims of absence — "I did not find RLS policies" is a question unless the schema files were actually read.
4. Unverifiable-in-context items (runtime behavior, provider behavior) are labeled `not verified` with reason + suggested verification, never asserted.
5. Report caps repeated identical findings with a count; no wall-of-noise reports.

**Shape:** markdown for humans + a fenced JSON block (`findings[]` with severity, principle, evidence, suggestedAction; `grades{}` per area; `questions[]`; `notVerified[]`) — the ship-skill interface. Overall output is graded per area (identity, tenancy, data, execution, delivery…): `sound` / `attention` / `at-risk`, plus a one-line overall assessment. Grades replace verdicts.

---

## 4. Content restructure (the delegated call on checklist rules)

Decision: **stage into tiers with minimal viable forms; prune only what the tier tables make redundant.** Rationale: audience is mixed internal + client projects — the enterprise material is still needed sometimes, but it must never surface at prototype tier.

1. **Deep technical rules keep their IDs and MUST language** (scoped to capability + tier): TEN-001..004, DUR-001..009, CONN-001..005, SBX-001..005, AUTH-001..007, DATA-001..005, core of RT/MODEL/OBS. This is the skill's real value; untouched in substance, re-tiered in applicability.
2. **Checklist rules become tiered concern tables** with a minimal viable form per tier:
   - SEC-001 (11-scenario list) → threat-model reference gets a per-tier table: prototype = "5 bullets on the auth/tenant boundary"; production = scenarios for enabled capabilities; enterprise = full matrix. The numbered rule survives as one line: "threat model to your tier's table."
   - REL-004 (9 runbooks) → production = one incident doc covering top-3 realistic failures; enterprise = full set.
   - DEL-004/SEC-004 (SBOM/provenance/signatures) → enterprise-gate only. Production = locks reviewed + pinned CI.
   - EVAL-*/COST-*/MLIFE-*/PII-* → keep files, add a "minimal viable at each tier" opener (e.g., EVAL at production = one golden set + threshold for the main behavior; COST at production = attribution logging only; budgets at enterprise). Blanket MUSTs rescoped to tier floors.
3. **Tool-bound statements rewritten to default + trigger form** (§1.3) across foundation, topology, hosting, data-memory, identity references.
4. **web.md maximalism** (RTL/i18n/full a11y "from the first implementation") → production-gate for what the product actually targets; enterprise for the full list.
5. Retired rule IDs (FOUND-002, anything fully absorbed) are **retired, never reused** — content-versioning policy already covers this; this is a MAJOR content change (fine: no external consumers yet).

---

## 5. Freshness upgrades (from the adversarial review, all confirmed keep)

1. **llms.txt integration:** add `llms` URL field to every source that publishes one (Cloudflare, Vercel/Next, Better Auth, Bun, MCP…); SKILL.md instructs: when current detail beyond a pinned claim is needed, fetch the source's `llms`/`docsIndex` URL (or use an available docs MCP) — the registry doubles as the research index.
2. **Proportionate freshness ritual:** `refresh-evidence.mjs --topics` required only for design reviews/architecture recommendations leaning on a pinned claim; plain questions answer from the snapshot with a one-line staleness caveat when past threshold.
3. **Security-advisory watch:** deterministic refresh pass adds an OSV.dev query per pinned npm/pypi package; advisories land in the weekly refresh PR as high-priority items. (Registry already stores `security` URLs; this makes them live.)
4. **Baseline-adoption nag:** refresh run warns (PR body + CI notice) when a `reviewBy` date in foundation-compatibility.json has passed, or when a critical source's pin lags current by a configurable threshold. Detection without an adoption forcing-function is how the tuple rots politely.

---

## 6. SKILL.md rewrite (interview-first flow)

1. **Start:** identify decision + tier; read profile if present; observe repo; ask ≤3 material questions (kept from today — it works).
2. **Greenfield:** run the intake interview → recommend capability set + topology sized by tier and minimum-viable-architecture principle → offer to write the slim profile.
3. **Review:** gather evidence (read/grep, the recipes from the deleted checker) → advisory report per §3.
4. **Questions:** answer directly; verdict language replaced by plain recommendation + at most one material risk (kept).
5. Guardrails keep: never mutate without authorization, never invent facts, never require absent capabilities. Guardrails drop: exception/ADR ceremony, checker invocation, freshness ritual on every critical-source answer.

---

## 7. Execution phases

Two-clock estimates: **agent clock** = wall-clock execution by Claude Code/Codex, calculated as `(turns × sec/turn + output tokens ÷ throughput + command runtimes) × 1.3 rework`; **human clock** = owner review at the checkpoint. Expected values below are calculated from measured repo inputs (file counts/sizes); the **timebox** caps the heavy tail — if a phase hits its timebox, the agent stops and checkpoints instead of looping. Fast mode compresses the generation term only (≈30–40% faster on prose-heavy Phase 3, marginal elsewhere).

| Phase | Work | Basis | Agent clock (expected) | Timebox | Human clock |
|---|---|---|---|---|---|
| 1 | Schema v4 + slim profile-tool/validate-profile + delete exceptions; migrate sample/answers/fixtures | ~10 files, ~50 turns, tests run in seconds | **~12 min** | 25 min | 5–10 min |
| 2 | Delete checker + control-catalog + coupled tests; write advisory-report contract reference | deletions cheap; 1 new ~200-line reference (~4k tok) | **~12 min** | 25 min | 10–15 min |
| 3 | Content re-tiering: foundation + governance rewrite, default+trigger tool rewrite, tiered tables, tier floors, de-money | ~20 reference files, ~25k output tok, ~100 turns | **~35 min** | 70 min | 20–40 min |
| 4 | Freshness: llms URLs, OSV watch, reviewBy nag, proportionate ritual; runner + REFRESH.md | 3 scripts + registry; live-fetch verification (network-bound) | **~18 min** | 40 min | 5–10 min |
| 5 | SKILL.md + README rewrite; rule-model re-tiered; allowlist; `bun run check` green; changeset | ~6 files, full-check loops | **~15 min** | 30 min | 15–30 min |

**Expected total: ~1 h 30 min agent clock (worst case ≤ 3 h 10 min if every timebox is hit); ~1–1.5 h human clock; calendar = checkpoint spacing.** Dependencies: 1 → 2 → 3; 4 parallel to 3; 5 last. Each phase ends with `validate-skill` + `bun test skills/arch-guardian` green.

### Actuals and reverse-engineered model (measured 2026-08-09, autonomous run; timestamps recorded programmatically at each phase boundary)

| Phase | Estimated | Actual | Correct estimate (retrospective, honest basis) |
|---|---|---|---|
| 1 | ~12 min | 4.4 min | ~4–5 min (~10 writes + ~8 reads ≈ 15 turns) |
| 2 | ~12 min | 1.5 min | ~2 min (1 delete-batch + 1 write + 4 wiring edits ≈ 5 turns) |
| 3 | ~35 min | 5.2 min | ~5–6 min (3 rewrites + ~17 targeted edits ≈ 14–16 turns — "25k output tokens" was ~3× high: most files needed surgical edits, not rewrites) |
| 4 | ~18 min | 2.2 min | ~2–3 min (~7 turns, 2 network-bound verification runs) |
| 5 | ~15 min | 4.0 min | ~4–5 min (2 big writes + wiring + 2 full-check runs at a ~1–2 min command floor) |
| **Total** | **~90 min** | **17.4 min** | **~17–21 min** |

All checks green (79 tests, lint, typecheck, build). Error decomposition of the 5× miss — the per-turn cost was correct (~18–20 s/turn measured vs 15–30 s assumed); the error was multiplicative elsewhere:

1. **Turn count inflated ~3.5×** — agents batch 3–4 file operations per turn, and a fully specified plan removes all design-while-executing turns.
2. **Double counting ~1.3×** — the formula summed `turns × sec/turn` AND `tokens ÷ throughput`, but generation happens inside turns.
3. **Rework overpriced ~1.24×** — actual ~1.05 (three small test fixes), not 1.3; rework scales with open design decisions, which were zero.

3.5 × 1.3 × 1.24 ≈ 5.6× — fully accounts for the miss.

**Corrected model:** `agent_min ≈ turns × 0.3 + command_minutes`, where `turns ≈ (files written + files read) ÷ 3 + verification runs`; rework ×1.1 planned / ×1.3 exploratory; timebox 2× (the tail is real and unpriced by any formula). Shorthand: ~0.25–0.3 min/file warm+planned; ~1 min/file cold or open-design. Caveats: n=1 (±40% error bars, not ±10%); the timer started warm — a cold run adds read turns (~20–25 min for this task, not 90); estimation error often lives in the work description, not the arithmetic — a specified plan is what makes the file-touch count estimable at all.

## 8. Non-goals

- No CI gating anywhere, in any repo, at any tier (ship skill may later re-introduce *opt-in* validation on top of the report format — its decision, not this skill's).
- No new services or paid resources in any script.
- No changes to skillify/skill-maintainer beyond what allowlist/tests require.
