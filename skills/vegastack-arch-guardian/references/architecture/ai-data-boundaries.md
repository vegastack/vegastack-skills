# AI data boundaries

Apply this reference when personal data, knowledge ingestion, external model calls, or public-facing AI output exists. It concretizes `SEC-003` and `DATA-003` at the AI trust boundary: personal data moving outward, untrusted content moving inward.

- **PII-001 — Ingestion redaction.** PII detection and classification **MUST** run before content enters embedding, chunking, or knowledge storage; detected PII is redacted, tokenized, or explicitly admitted under the data class policy of the target store. Record the classifier version and decision as provenance so re-scanning after a classifier upgrade is possible. Embeddings of unredacted PII are copies of it and inherit deletion propagation (`DATA-004`).
- **PII-002 — Prompt boundary.** Before a prompt crosses the trust boundary to an external model provider, PII **MUST** be minimized to what the feature needs and stripped or masked where policy requires; the route's retention and region policy (`MODEL-001`) governs what may cross at all. Memory writes and eval/telemetry sampling are prompt-boundary crossings too — the same redaction applies.
- **PII-003 — Output moderation.** Public-facing products **MUST** pass model output through a moderation policy before delivery: unsafe-content classes, PII leakage from context or memory, and impersonation of the platform. Internal tools MAY relax categories by declared policy, never by omission. Moderation outcomes are audited metadata; blocked output fails visibly, not silently.
- **PII-004 — Injection mitigations.** Prompt injection is mitigated by structure, not instructions. Tool results, retrieved chunks, and connector content **MUST** be quarantined as data — spotlighted/delimited with an explicit untrusted marking the prompt template preserves — and **MUST NOT** be able to elevate capabilities: high-impact tool calls (irreversible, external-effect, privileged, or capability-escalating) require the `CONN-001` capability envelope and an approval gate regardless of what any content said. Instructions found inside untrusted spans are never followed into tool selection.

## Boundary placement

| Crossing | Control | Failure mode prevented |
|---|---|---|
| document → embedding/knowledge store | `PII-001` classify/redact | PII copies in vectors and chunks |
| context → external model | `PII-002` minimize/mask | retention outside policy |
| model → public user | `PII-003` moderation | unsafe or leaking output |
| tool/retrieval → prompt | `PII-004` quarantine + spotlight | injected instruction execution |

Detection is preventive, not perfect: pair classifiers with data-class defaults (unknown source means restricted), negative tests that plant markers and verify they never reach a provider or a public response, and deletion reconciliation that includes vector stores and cached prompts. Treat retrieved text as untrusted data everywhere, matching `data-memory.md`; an approval gate that a model can talk its way around is prompt-enforced security and fails `SEC-003`.
