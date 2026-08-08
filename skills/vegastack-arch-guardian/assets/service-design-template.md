# Service design: name

Keep only sections and fields activated by the service. Mark unknown material facts `NOT VERIFIED`; do not fill owners, data classes or objectives with placeholders presented as compliance.

## Ownership and purpose

- Owner:
- Runtime:
- Hosting profiles:
- Data classes:
- SLO/RPO/RTO:

## Contracts

List only applicable REST/OpenAPI, events, queue jobs, EVE hooks/streams, shared-service contracts and generated clients. Identify idempotency and compatibility rules.

## Tenancy and identity

For shared-schema multi-tenancy, describe workspace derivation, composite keys, every tenant table's `ENABLE/FORCE RLS`, symmetric `USING/WITH CHECK`, transaction-local context, owner/BYPASSRLS separation and pool-reuse evidence. Otherwise state the actual access/tenancy boundary without adding RLS.

For identity-facing services, record secure-cookie/session-cache policy, sensitive database validation, OAuth issuer/audience/code+PKCE/redirect allowlist/refresh rotation/revocation, SCIM organization mapping/deprovision/last-owner behavior, API-key scope, and internal short-lived identity.

## State and failure recovery

Distinguish only state classes the service owns or consumes. Provide applicable retry, dedupe, DLQ, replay, recovery and reconciliation behavior.

## Security and observability

Define secret references/broker lifetime, credential-bearing env/mount prohibitions, egress hosts/CIDRs/ports/DNS/redirect/header policy, logging-sink credential review, redaction, audit events, OTel signals, alerts, and abuse limits.

## Verification

List tests only for enabled boundaries. Mark environment-bound qualification as NOT RUN with reason, risk, owner and next action.
