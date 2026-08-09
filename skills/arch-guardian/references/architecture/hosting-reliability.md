# Hosting and reliability

Apply a hosting profile only to declared production deployables. `none` is valid for a non-deployable shared package. EVE/jobs placement clauses activate only when those owned capabilities are enabled.

## Exact placement profiles

- **HOST-001 — Declared profile.** A deployable **MUST** match one exact profile below; provider capability does not silently change the selected baseline.
- **HOST-002 — Self-hosted.** Starter production **MUST** use OCI deployables with Docker Compose documented as non-HA. It requires externalized backups, TLS, OpenBao bootstrap, monitoring, capacity, and explicit single-host failure handling.
- **HOST-003 — Vercel.** The Vercel profile **MUST** use the `vercel-web-external-eve` baseline: Next runs on Vercel while EVE and pg-boss run in qualified external long-running Node/OCI placements with direct PostgreSQL access. AgentRun projection initially belongs to this trusted long-running plane. This is a VegaStack profile choice, not a claim that Vercel lacks other capabilities.
- **HOST-004 — Cloudflare/OpenNext.** The OpenNext Worker owns only the Next control plane. EVE, Workflow packages, pg-boss workers, and background daemons **MUST NOT** enter its source or bundle. Tenant/auth paths use cache-disabled direct PostgreSQL semantics; `nodejs_compat` does not make the Worker a general Node process. [OPENNEXT-1202] [CF-WORKERS] [HYPERDRIVE]

| Profile | Next | EVE and jobs | PostgreSQL/World | Required warning |
|---|---|---|---|---|
| self-hosted | Node OCI | Node OCI | direct PostgreSQL | Compose is non-HA |
| Vercel | Vercel Next | external Node/OCI | external direct PostgreSQL | external runtime ownership |
| Cloudflare/OpenNext | OpenNext Worker | external Node/OCI | external direct PostgreSQL | Worker Node subset; auth cache off |

Profile changes require an ADR, deployment review, data/secret migration, contract and recovery tests, rollout, and rollback.

## Reliability

- **REL-001 — Measured objectives.** Each production profile **MUST** define measured objectives for its applicable enabled boundaries (such as API latency, admission age, EVE continuation, SSE freshness, dependency success or notification delivery), with RPO/RTO only where durable data and recovery requirements exist.
- **REL-002 — Reproduced recovery.** Recovery plans **MUST** use encrypted PostgreSQL backups plus WAL/PITR, object versioning/replication where required, OpenBao recovery procedures, and independent restore verification. A successful backup job is not restore evidence.
- **REL-003 — Regional ownership.** Add cells only for measured capacity, residency, or blast-radius needs. A workspace and its authoritative business/workflow state **MUST** have one home cell; moves use quiescence, copy, validation, cutover, and rollback.
- **REL-004 — Incident ownership.** Teams **MUST** maintain owned incident documentation at their tier's depth: production — one runbook covering the top three realistic failures for enabled capabilities (typically database loss, workflow/job stalls, credential theft); enterprise — the full set including cross-tenant exposure, sandbox egress/escape, model data incidents, connector abuse, provider/cell loss, and deletion failure.

| Failure | Expected recovery evidence |
|---|---|
| Next loss | retry/idempotency; durable state intact |
| pg-boss crash | lease retry; same admission/effect key |
| EVE crash | World resume/replay; effect reconciliation |
| PostgreSQL loss | fail closed; PITR/failover within objectives |
| sandbox crash | recreate from durable inputs; cleanup reconciliation |
| dependency outage | policy-safe fallback or visible pause |
| cell loss | home-cell routing and exercised recovery plan |

Add Kubernetes only when HA, scale, placement, or operational requirements exceed Compose/managed profiles. Change workflow ownership only after the qualified EVE/Postgres World baseline fails a required capability and an ADR proves migration and rollback. PostgreSQL 18 is the candidate major-version horizon for these profiles; treat it as a qualification event, not a drop-in upgrade. <!-- source: POSTGRES-DOCS -->
