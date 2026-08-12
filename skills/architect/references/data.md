# Data — Postgres, tenancy, storage, caching

## Database

- PostgreSQL, always managed by us (a PlanetScale Postgres server or self-hosted
  Hetzner/self-managed) — never Neon. Target PG 17 behind Hyperdrive (18 unsupported there),
  17/18 elsewhere. Drizzle ORM with the single `postgres-js` driver — never mix in `pg`.
  Stay on GA/stable majors of core DB deps (Drizzle v1 is still RC as of 2026-08 — the
  0.4x line remains the pin until v1 is stable); verify vendor version-support claims
  against live docs before locking a decision.
- From Workers: Hyperdrive binding + per-request client (`prepare: false, max: 1`,
  request-scoped via the execution context) — a module-level pool in a Worker or Durable
  Object is a bug, not a style choice (workerd forbids cross-request I/O). One Hyperdrive
  per environment shared across services hitting the same database — never one per service.
  On long-running Node services (Docker), pool normally.
- Migrations run via CI only, never pushed from a dev machine — with one loud exception:
  pre-launch databases with zero real users get clean resets instead of migration chains
  (see principles.md). Runners apply in journal order and are idempotent on re-run.
  Iterate schema with `db:push` during development; run `db:generate` exactly once right
  before shipping — repeated generates mid-iteration create conflicting DDL.

## Multi-tenancy

- Shared schema with RLS, not database-per-tenant: every tenant-scoped table (and every
  partition) gets `ENABLE` + `FORCE` ROW LEVEL SECURITY, driven by exactly one fail-closed
  GUC accessor (`NULLIF(current_setting('app.current_org_id', true), '')::uuid`), defined in
  one idempotent migration location.
- RLS is one layer, never the only layer: every query also scopes explicitly by
  `org_id`/`workspace_id` in the data-access layer. Two roles — the app role has no
  `BYPASSRLS`; a separate system role does. `withOrgContext`/`withSystemContext` (or
  equivalent) are the only query entry points; the raw client is never exported.
  **Why:** RLS misses TimescaleDB chunks and misconfigurations fail open; two independent
  layers fail closed.
- Tenant identity comes from the authenticated principal, never from client-supplied
  payload fields (a client-supplied `workspaceId` query param over the authenticated
  context caused a real cross-tenant IDOR — reject on mismatch).
- Better Auth's organization plugin owns the workspace/member/invitation schema
  (organization ↔ workspace naming remap is the house pattern); its columns stay snake_case
  as generated. Native `uuid` columns — Better Auth does not force text IDs.

## Caching

- No cache layer by default: rate limiting, dedupe, and most "cache" needs are
  Postgres-native. Workers KV only with a named trigger; any Redis-class store
  (Valkey/Upstash) is optional and **never correctness-bearing**.
- Never let auth, role, or permission data live in a cache long enough to serve stale
  permissions — a revoked member seeing tenant data is a security bug, not a staleness bug.
- Anything cached must have a defined story for cache outage (fall back to DB, not to
  stale-forever).

## Search, knowledge, files

- Search and embeddings live in Postgres itself: `STORED` generated `tsvector` + GIN for
  full-text; pgvector (`halfvec` + HNSW, `hnsw.iterative_scan = relaxed_order`) for
  embeddings; hybrid fusion via RRF (k=60 starting constant). Embedding model default:
  BGE-M3 self-hosted; bulk embedding calls skip the AI Gateway (the one carve-out from
  the blanket gateway rule). No dedicated vector DB or SaaS search service.
- Object storage: R2 by default, always behind an S3-compatible storage layer so AWS
  S3/Azure Blob/MinIO work for licensed self-hosted deployments. Short-lived scoped access
  (presigned), size/type validation on upload. Keys never expose raw user/workspace IDs —
  documented prefix + nanoid (`wl_`, `ua_` style).
- Blob GC deletes the storage object before the DB reference row — a crash mid-delete must
  never leave a live dangling reference.
- TimescaleDB is opportunistic, never required: feature-detect the extension and fall back
  to native `PARTITION BY RANGE` + BRIN in the same migration, so self-hosted installs work
  on plain Postgres.

## Schema discipline

- Extend an existing table before creating a new one; when two tables serve the same job,
  merge. Keep sync (`*_change_log`), audit (`audit_log`), and versioning (`*_revisions`) as
  three separate, non-overlapping tables — never substitute one for another.
- IDs: one global helper — UUIDs (v7 where ordering matters) internal, prefixed nanoids
  public-facing. Timestamps `timestamptz` UTC; money integer minor units; durations integer
  ms. Prefer checked text over Postgres enums for evolving vocabularies.
- Index tenant and foreign keys; paginate by cursor; select only needed columns.
- Secrets and PII never sit in plaintext columns (including inside JSONB) — broker-wrapped
  envelope encryption only (see security.md).
- JSONB-on-row vs. dedicated table has no house default — MK has ruled both ways by
  context. Present the tradeoff (volume, query needs, audit requirements) and ask.

## Backups and recovery

- Self-managed Postgres ships with WAL archiving + scheduled base backups from day one —
  a database without a tested restore path is not production, whatever else is true.
- A restore runbook (where backups live, how to restore, measured time) is a phase-0
  deliverable for any live product; state RPO/RTO per project in `.vegastack/arch.md`
  notes. Test the restore, don't assume it (verification honesty applies to backups too).
- R2/object storage: no bucket versioning by default — deletion protection is the
  object-before-row GC discipline above plus lifecycle rules, planned explicitly.
