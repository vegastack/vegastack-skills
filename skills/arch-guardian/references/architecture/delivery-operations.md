# Delivery and operations

Apply test and release boundaries only to enabled capabilities and declared deployables. Never report an absent capability as an untested control.

- **DEL-001 — Boundary verification.** Tests **MUST** cover every applicable enabled boundary—contracts/code generation, RLS/tenant negatives, EVE replay/evals, pg-boss crash/retry, sandbox egress/secrets, web/mobile E2E, performance, restore, and dependency failure. Static sentinels never substitute for runtime qualification.
- **DEL-002 — Compatible migrations.** Migrations **MUST** use expand, migrate, and contract: add backward-compatible schema, deploy compatible code, backfill idempotently with progress, verify, switch reads/writes, and remove only after the rollback window.
- **DEL-003 — Migration safety.** Destructive migrations **MUST NOT** run as unreviewed application startup side effects. Estimate locks/rewrites, bound batches, verify backup/restore, expose progress, and define rollback or forward-fix.
- **DEL-004 — Release identity.** Release artifacts **MUST** record source/lock/toolchain digests, exact dependencies, generated outputs, tests and skips, package/container digests, SBOM, provenance, signatures, migrations, profile/ADR identity, target, and rollback artifact. [tier: enterprise]
- **DEL-005 — Relevant freshness.** For design reviews and recommendations leaning on pinned claims, stale or unavailable critical security, auth, tenancy, durability, secrets, and deployment evidence **MUST** be reported as not verified rather than asserted; plain questions answer from the shipped snapshot with a staleness caveat, and unrelated work stays on the fast path.
- **DEL-006 — Honest verification.** Environment-bound replay, isolation, failover, restore, and provider tests **MUST** be reported as `NOT RUN` when not executed, with reason, risk, owner, and next action.

## Required test boundaries

| Boundary | Minimum evidence |
|---|---|
| API/schema | Zod → OpenAPI → clients deterministic and compatible |
| identity/tenancy | session/revocation, OAuth/PKCE, SCIM, composite keys, per-table RLS negatives |
| execution | exact tuple, publication pin, approval, replay, waits, effects, cancellation |
| admission/jobs | atomic enqueue, dedupe, retry/heartbeat, DLQ, ordinary job separation |
| connectors/sandbox | SSRF/replay, capability scope, no credentials, egress, quota, cleanup |
| clients/channels | reconnect, offline mutation, push/deep links, localization, accessibility |
| operations | load, process/dependency/cell loss, PITR/restore, migration rollback |

CI fails on hard-rule violations, nondeterministic generated output, broken references/source IDs, stale critical evidence, unsupported placement, incompatible migrations/contracts, or security/durability regressions. Flaky critical tests are defects and must not be silently retried to green.

## Rollout and maintenance

Roll out by profile, cell, or cohort with health gates; preserve protocol compatibility during mixed versions; drain long-running workers; and keep code/config rollback independent where schema permits.

Bootstrap by creating the slim profile, declaring the tier and hosting, validating the profile, refreshing affected sources, checking generated contracts, and completing threat/deployment review at the tier's depth.

Doctor verifies Node availability, profile structure, and installed-skill integrity. It does not prove database connectivity/extensions, source freshness, secret-store identity, generated-contract drift, or live object/sandbox/model behavior.

Use the bundled ADR, threat-model, service-design, and deployment-review templates when relevant. Maintain incident documentation at the tier's depth and revisit recorded deviations on their declared triggers; setup scripts never create paid or cloud resources implicitly.
