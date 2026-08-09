# Foundation

## Operating model

VegaStack projects — internal or client — declare confirmed facts in a slim committed profile: kind, **tier**, tenancy, hosting, and the enabled capability list. The guardian is an advisor: it interviews, observes, recommends, and reviews. It never gates, and it has no exception or suppression machinery — a team that departs from a recommendation records the decision (profile note or ADR) and the guardian reports it as visible accepted risk. Review output follows the [advisory report contract](../advisory-report.md).

Tiers gate concerns, never tools:

| Tier | Rigor floor |
|---|---|
| `prototype` | irreversibles only: no plaintext secrets in code, no cross-tenant access where tenancy exists, no auth bypass, reversible data decisions |
| `production` | full correctness, security, and recovery concerns for enabled capabilities, in minimal viable form |
| `enterprise` | adds immutable audit, supply-chain attestation, SCIM/deprovisioning depth, formal threat models, and eval/cost gates |

Rules apply at tier `production` and above unless tagged `[tier: all]` (applies from prototype up) or `[tier: enterprise]`. Resolve decisions in this order: security/correctness; recovery; ownership; contracts; operability; delivery; optional optimization.

- **FOUND-001 — Confirmed profile.** A project **MUST** commit a confirmed v4 `.vegastack/architecture.json` containing only confirmed facts: name, kind, tier, tenancy, hosting, and enabled capabilities (legacy names are accepted with a deprecation notice; versions live in lockfiles, never the profile). [tier: all]
- **FOUND-003 — Honest outcomes.** The guardian **MUST NOT** represent unverified behavior as verified or accepted risk as recommended: findings follow the advisory evidence discipline, unverified claims are labeled, and a deliberate team decision the guardian disagrees with is reported as accepted risk with the reason — visibly, without suppression. [tier: all]
- **FOUND-004 — Capability alignment.** The declared capability list **MUST** match project intent and repository evidence, and removing a capability **MUST** clean durable data, credentials, queues, and contracts. [tier: all]

Prefer reproduced behavior over prose and official primary sources over secondary material. Apply pinned claims to the pinned baseline; current documentation describes current capability. Source drift requests scoped review.

## Minimum viable architecture

Never add a moving service without a named trigger. Every infra addition states the trigger it satisfies and the simpler option it replaces; every capability reference names its default and its escalation triggers. Libraries and standards with no operational cost are standing defaults when their capability applies: Better Auth, PostgreSQL, REST/OpenAPI, OCI, S3-compatible objects, OpenTelemetry, OAuth/OIDC, provider-neutral sandbox/model interfaces. Operational services are trigger-gated: OpenBao, Valkey, Kubernetes, WebSockets, regional cells, extracted services. Provider features must not become hidden correctness dependencies.

## Ownership and portability

Product-owned enabled capabilities are the default. Shared-managed and external-managed services are explicit ownership exceptions recorded in the profile notes with their contract; a consumer of a shared service does not contain the provider's source roots. The foundation excludes billing, pricing, and Stripe.

Retired rule IDs are never reused: `FOUND-002` (exception governance) was retired in foundation 0.4.0 together with the enforcement machinery.
