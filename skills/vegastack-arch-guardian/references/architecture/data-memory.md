# Data and memory

Apply each rule only to its enabled/observed data capability. A stateless/shared-package project need not add PostgreSQL, knowledge, memory, object storage or Valkey.

- **DATA-001 — System of record.** PostgreSQL **MUST** be the authoritative business store. Valkey MAY accelerate measured hot paths but correctness **MUST NOT** depend on it. [POSTGRES-DOCS]
- **DATA-002 — Knowledge storage.** Default knowledge retrieval **MUST** use tenant-scoped PostgreSQL FTS plus pgvector; binary objects use an S3-compatible abstraction with checksums and version IDs. [PGVECTOR] [S3-SPEC]
- **DATA-003 — Separate state classes.** EVE conversation state, curated durable memory, and provenance-bearing knowledge **MUST** remain distinct. Model-generated memory is a proposal that passes policy, dedupe, classification, provenance, and retention before persistence.
- **DATA-004 — Lifecycle policy.** Every data class **MUST** define purpose, location, retention, export, deletion propagation, backup expiry, legal-hold behavior, and owner. Deletion **MUST** be tracked and reconciled across PostgreSQL, objects, indexes/vectors, caches, telemetry, and downstream connectors.
- **DATA-005 — Object boundary.** Object upload/download **MUST** use short-lived scoped access, size/type validation, encryption, and applicable malware scanning. Production buckets and long-lived object credentials **MUST NOT** be mounted into a sandbox.

| Data | Authoritative owner | Required metadata |
|---|---|---|
| business and tenant records | PostgreSQL | workspace, policy version, audit correlation |
| agent execution | EVE/Postgres World | session, step/event cursor, published version |
| curated memory | application PostgreSQL | provenance, classifier, retention, supersession |
| knowledge chunks | PostgreSQL/pgvector | source, extraction and embedding versions, access policy |
| binary objects | S3-compatible store | workspace, checksum, version, data class, retention |

Authorize before retrieval and before producing snippets. Enforce workspace/data policy in SQL/RLS, include provenance and source timestamps, version extraction/chunking/embedding, and treat retrieved text as untrusted data rather than instructions.

Residency claims require enforceable jurisdiction restrictions and tested placement; provider hints alone are insufficient. Legal hold suspends ordinary deletion only for the scoped records and must remain auditable.

Add Valkey only after a measured cache or coordination benefit exists and the PostgreSQL-backed correctness path passes without it.

The pinned baseline is the PostgreSQL 17.x series; PostgreSQL 18 (GA, 18.4 current minor) is the candidate upgrade horizon and adopting it requires re-qualifying RLS, pg-boss, and Workflow World behavior for the exact tuple. <!-- source: POSTGRES-DOCS -->
