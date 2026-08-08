# Golden implementation patterns

Use these as concise boundary shapes, not copy-paste frameworks.

## Protected request and transaction-local RLS

Authenticate → resolve current membership server-side → authorize typed action → begin transaction → `SET LOCAL`/`set_config(..., true)` workspace, subject and support context → query with composite tenant key → append audit correlation → commit. Request roles are non-owner and never `BYPASSRLS`.

## AgentRun and transactional admission

In one PostgreSQL transaction, create `AgentRun` plus one pg-boss admission job keyed by `(workspace_id, admission_key)`. Use an outbox only across a real database/transaction boundary. The trusted EVE projection, not the admission worker, advances terminal state.

## Lost acknowledgement recovery

On uncertain EVE start acknowledgement, look up the session by the deterministic admission key before retry. Resume the same logical session; never create a second run.

## Effect fence and reconciliation

Persist a tenant-scoped effect key and intended operation before a retried external effect. Reuse the key, record provider outcome, and reconcile unknown results before retrying.

## Capability envelope and credential broker

Issue a short-lived capability bound to audience, workspace, resource, action, data/risk class and approval. A trusted broker validates it, reconstructs an allowlisted request and injects a credential; agents and sandboxes never receive ambient or refresh credentials.

## Safe connector HTTP and redirects

Bound method, ports, path, body, response and time. Resolve and validate DNS against the actual connection; reject private, loopback, link-local, metadata and multicast targets at every redirect; strip cross-origin credentials and re-authorize each hop.

## Resumable SSE

Emit tenant/run identity, monotonic cursor, event and schema version, timestamp and trace correlation. Reconnect with last acknowledged cursor; replay authorized retained events or return a snapshot/terminal result. Bound buffers and expose truncation.

## Deterministic contracts

Treat bounded Zod schemas as editable wire source. Generate OpenAPI, Flutter/public clients and snapshots with pinned tools, canonical ordering and digests. CI regenerates and fails on drift.

## Deletion propagation

Create a durable deletion intent, enumerate PostgreSQL, objects, indexes/vectors, caches, telemetry and connector copies, track each outcome, retry safely, honor scoped legal holds and reconcile to completion.

## Support-session authorization

Create visible, reason/ticket-bound, expiring and revocable support elevation. Authorize each action through normal typed policy and tenant RLS; append immutable audit. Never impersonate a user or grant `BYPASSRLS`.
