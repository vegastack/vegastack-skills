# Threat model: system or change

Keep only enabled/exposed actors, assets and boundaries. Do not add agent, connector, sandbox, tenant or enterprise-identity threats to a project that lacks those surfaces.

## Scope and assets

List trust zones, tenant data, credentials, durable state, and excluded systems.

## Actors and entry points

List users, support operators, services, agents, connectors, webhooks, MCP servers, sandboxes, and supply-chain inputs.

## Data flows and boundaries

Reference the system-context, identity, sandbox, and evidence diagrams.

Record OAuth/session/SCIM trust transitions, database role and pool boundaries, support elevation, secret-broker exchange, sandbox env/mount/stdout/stderr paths, and every network redirect/DNS/header hop.

## Threats and controls

| ID | Threat | Boundary | Impact | Prevent | Detect | Recover | Owner | Test |
|---|---|---|---|---|---|---|---|---|
| T-001 | Cross-tenant object reference | REST/RLS | Restricted data disclosure | Composite keys + authz + RLS | Audit anomaly | Revoke/export/notify | Security | Negative tenant test |

## Residual risk and review triggers

Record accepted risks in linked ADRs and define review events.

## Required adversarial evidence

- Cross-tenant object/join/bulk/export/background access and pool-role reuse
- OAuth state/PKCE/replay/redirect, session revocation, SCIM deprovision/last-owner, and support expiry
- Credential injection/logging, webhook replay, SSRF redirect/DNS rebinding/IPv6/link-local, and sandbox proxy/header exfiltration
- Workflow lost acknowledgement, replayed effects, cancellation race, duplicate admission, and projector cursor rollback
