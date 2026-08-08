# Security and privacy

Apply threat scenarios to enabled/exposed services and capabilities. Absence of a capability is not a missing control; observed sensitive data, secrets or execution activates the relevant boundary.

- **SEC-001 — Threat model.** Every enabled/exposed service and capability **MUST** model its applicable tenant crossing, confused deputy, prompt/tool injection, SSRF, credential theft, replay, support abuse, sandbox escape/exfiltration, supply-chain, resource exhaustion, and deletion-failure scenarios.
- **SEC-002 — Secret custody.** When production secrets exist, workspace BYOK and connector tokens **MUST** persist only as encrypted ciphertext/reference; project-owned production secret/KMS functions, service identities, rotation, revocation, and audit **MUST** use OpenBao. Plaintext secrets in code, profiles, logs, telemetry, agents, or sandboxes are forbidden. [OPENBAO-DOCS]
- **SEC-003 — Enforced authorization.** Prompts and model instructions **MUST NOT** be treated as security controls. Typed authorization, capabilities, EVE approval gates, database RLS, egress policy, quotas, and immutable audit enforce decisions.
- **SEC-004 — Supply chain.** Builds **MUST** use reviewed locks, registry integrity, canonical tags/commits, isolated builders, vulnerability/license review, pinned image digests, SBOM, provenance, and signatures for release artifacts.
- **SEC-005 — Abuse controls.** Systems **MUST** apply tenant/identity/IP/risk-class quotas, payload and output limits, anomaly detection, suspension/kill switches, appeal/restore paths, and immutable administrative audit.

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
