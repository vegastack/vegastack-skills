# Foundation

## Operating model

VegaStack projects may be SaaS, internal/public products, platform services or shared packages; single- or multi-tenant; web-only, Flutter-enabled, agentic or non-agentic. Activate only declared or observed capabilities. Resolve decisions in this order: security/correctness; recovery; ownership; contracts; operability; delivery; optional optimization.

- **FOUND-001 — Confirmed profile.** For architecture conformance checks, a project **MUST** commit a confirmed v3 `.vegastack/architecture.json` containing only applicable, confirmed facts (legacy `.yaml`-named JSON is accepted with a deprecation notice). [invariant; activation: CI/profile work; verification: structural+semantic; waiver: project ADR]
- **FOUND-002 — Project exceptions.** A project exception **MUST** use exact rule/control/path scope and a contained accepted ADR with project owner, rationale/decision, risks, controls, verification, rollback/migration, review date or event, and foundation-deviation acknowledgement. [invariant; activation: exception declared; verification: semantic+filesystem; waiver: project ADR]
- **FOUND-003 — Honest outcomes.** The guardian **MUST NOT** represent accepted risk as safe or foundation-compliant: report `PASS`, `FAIL`, `EXCEPTED`, and `NOT VERIFIED` exactly, and keep a rejection recommendation when warranted. [invariant; activation: every decision/review; verification: output review; waiver: project ADR]
- **FOUND-004 — Capability alignment.** Declared capability status, ownership, versions, placement, roots and contracts **MUST** match project intent and repository evidence; removal **MUST** clean durable data, credentials, queues and contracts. [invariant; activation: capability declared/observed/removed; verification: static+semantic+runtime; waiver: project ADR]

Every project architecture rule is waivable by an active project-owner ADR. A valid ADR changes a matching violation to `EXCEPTED` and may allow CI success, but it never proves safety. Invalid, expired or mismatched exceptions fail. Foundation changes and project accepted risks remain distinct.

Prefer reproduced behavior over prose and official primary sources over secondary material. Apply pinned claims to the pinned baseline; current documentation describes current capability. Source drift requests scoped review and does not automatically expire ADRs.

## Ownership and portability

Product-owned enabled capabilities are the default. Shared-managed and external-managed services are explicit exceptions to ownership, not compliance exceptions; require the complete service contract in the profile. A consumer of shared EVE or another shared service does not contain the provider's source roots.

Use PostgreSQL, REST/OpenAPI, OCI, S3-compatible objects, OpenTelemetry, OAuth/OIDC and provider-neutral sandbox/model interfaces when their capabilities apply. Provider features must not become hidden correctness dependencies.

The foundation excludes billing, pricing and Stripe. Usage, quota, capacity, token, sandbox and storage accounting remain applicable when those resources exist. Add optional infrastructure only after the trigger in its reference is met.

## Enforcement

| Class | Treatment |
|---|---|
| invariant / forbidden design | CI failure when detectable; otherwise manual qualification |
| preferred default | warning with evidence-backed reason to vary |
| permitted option | supported only inside declared activation and ownership boundaries |
| valid project ADR | visible `EXCEPTED`; CI may pass; recommendation remains unmet |

Choose the smallest design meeting current requirements and measured objectives. Challenge a foundation default when project evidence shows it does not fit; use an ADR to record the project decision.
