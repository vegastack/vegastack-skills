# Security and privacy

Apply threat scenarios to enabled/exposed services and capabilities. Absence of a capability is not a missing control; observed sensitive data, secrets or execution activates the relevant boundary.

- **SEC-001 — Threat model.** Every enabled/exposed service and capability **MUST** carry a threat model at its tier's depth — prototype: five bullets on the auth/tenant boundary; production: the applicable scenarios below for enabled capabilities; enterprise: the full matrix with owners and verification.
- **SEC-002 — Secret custody.** Plaintext secrets in code, profiles, logs, telemetry, agents, or sandboxes are forbidden at every tier: production secrets, workspace BYOK, and connector tokens **MUST** persist only in a managed secret store or as encrypted ciphertext/reference, with rotation and revocation possible. [tier: all] [OPENBAO-DOCS]
- **SEC-003 — Enforced authorization.** Prompts and model instructions **MUST NOT** be treated as security controls. Typed authorization, capabilities, EVE approval gates, database RLS, egress policy, quotas, and immutable audit enforce decisions. [tier: all]
- **SEC-004 — Supply chain.** Builds **MUST** use reviewed locks, registry integrity, canonical tags/commits, isolated builders, vulnerability/license review, pinned image digests, SBOM, provenance, and signatures for release artifacts. [tier: enterprise]
- **SEC-005 — Abuse controls.** Public-facing systems **MUST** apply tenant/identity/IP/risk-class quotas, payload and output limits, suspension/kill switches, appeal/restore paths, and administrative audit; anomaly detection and immutability harden this at enterprise tier.

Secret-custody mechanism is chosen by trigger, not tier: the platform's or cloud's managed secret store is the default at every tier (it satisfies SEC-002 with zero operational cost). Run OpenBao only when a real trigger exists — self-hosted infrastructure, multi-service identity (short-lived service credentials/mTLS), BYOK key custody, or dynamic database credentials. An enterprise-tier app on a managed platform with none of those triggers does not need OpenBao; a production-tier self-hosted platform does. Production-tier floor: reviewed locks and pinned CI for the supply chain (full SEC-004 attestation is enterprise).

Applicable threat scenarios: tenant crossing, confused deputy, prompt/tool injection, SSRF, credential theft, replay, support abuse, sandbox escape/exfiltration, supply-chain compromise, resource exhaustion, deletion failure.

| Control objective | Required mechanism |
|---|---|
| tenant isolation | `TEN-001` through `TEN-004`, typed grants, negative tests |
| least privilege | `AUTH-002`, `CONN-001`, short-lived service identities |
| untrusted execution | `SBX-001` through `SBX-005` |
| confidentiality | `SEC-002`, `MODEL-002`, `OBS-002`, encryption and redaction |
| durable accountability | EVE checkpoints, AgentRun projection, `OBS-003` |
| privacy lifecycle | `DATA-004`, export/deletion reconciliation, legal-hold scope |
| recovery | qualified backups, PITR, restore and incident drills |

Map evidence to applicable SOC 2 security/availability/confidentiality/privacy criteria and GDPR principles, lawful basis, data-subject rights, processor/subprocessor duties, breach response, transfers, and retention. This mapping supports control design; it is not a certification or legal conclusion.

Threat and deployment reviews identify detection, containment, evidence preservation, recovery, communication, owner, and verification for every material scenario.
