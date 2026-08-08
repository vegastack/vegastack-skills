# Realtime and channels

Apply realtime, notification and external-channel rules independently when each capability is enabled or observed.

- **RT-001 — Resumable output.** Resumable SSE **MUST** be the default for run output and server-to-client events. Events need tenant and run identity, monotonic cursor/event ID, type/schema version, timestamp, trace correlation, and replay/terminal reconciliation.
- **RT-002 — WebSocket trigger.** WebSockets MAY be added only for true bidirectional collaboration or presence; they **MUST NOT** become durable state or the default agent-output transport.
- **RT-003 — Event ownership.** Every event type **MUST** name one authoritative producer, allowed consumers, ordering scope, dedupe key, retention, authorization, and redaction policy.
- **RT-004 — Channel boundary.** Slack, Teams, Gmail, Outlook, and public API adapters **MUST** normalize identity, workspace mapping, consent, dedupe, threading, attachments, rate limits, retries, and revocation. They **MUST NOT** own workflow state.
- **RT-005 — Notification intent.** In-app, email, FCM, and APNs delivery **MUST** originate from one durable tenant-scoped notification intent with channel attempts, preferences, locale, timezone, quiet hours, dedupe, receipt, and audit state.
- **RT-006 — Channel admission.** Channel ingress **MUST** authenticate the provider, derive tenancy from server-owned mappings, enforce replay/dedupe, and durably admit before acknowledging work that can outlive the request.

Interactive reconnect sends the last acknowledged cursor; the server replays authorized retained events or returns a snapshot/terminal result when replay is unavailable. Slow consumers need bounded buffers, backpressure, cancellation, and visible truncation.

Create notification intent in the same transaction as the business event when possible; use an outbox only across a transaction/database boundary. Push payloads remain non-sensitive hints and clients fetch authoritative state.

Add collaboration/presence infrastructure only after a bidirectional requirement and ordering scope are explicit; agent streaming alone is not a trigger.
