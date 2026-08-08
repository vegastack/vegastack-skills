# Models and observability

Apply model rules only when model routing is enabled or observed. Apply telemetry/audit rules to signals and audit surfaces the project actually emits.

## Model routing

- **MODEL-001 — Provider-neutral adapter.** Model calls **MUST** use a provider-neutral adapter that declares model capabilities, streaming, structured output, tool use, region, retention, key source, quota, timeout, and fallback policy.
- **MODEL-002 — Key paths.** Platform keys stay in the trusted model service. Workspace BYOK **MUST** persist only as encrypted ciphertext/reference and be resolved just in time; agents and sandboxes receive neither key path.
- **MODEL-003 — Policy-preserving fallback.** Fallback and caches **MUST NOT** weaken region, retention, key-source, data-class, or tenant policy. A blocked fallback pauses visibly rather than silently changing policy.

Prefer Cloudflare AI Gateway behind the adapter; direct AI SDK providers and qualified self-hosted alternatives remain supported. Explicitly configure gateway logging/caching to the same privacy contract. [AI-GATEWAY] [AI-SDK-7]

Record route decision, policy version, provider/model, key source, region, latency, token/usage estimate, cache/fallback state, approval link, and outcome—never the key. Low-retention/no-retention requests must fail closed when no route satisfies policy.

## Telemetry and audit

- **OBS-001 — Vendor-neutral telemetry.** Services **MUST** emit OpenTelemetry-compatible traces, metrics, and logs with W3C propagation and stable tenant-safe correlation. [OTEL-DOCS]
- **OBS-002 — Metadata-only default.** Telemetry **MUST** default to metadata. Cookies, authorization headers, tokens, keys, prompts, restricted content, and unbounded tool output **MUST NOT** enter logs or traces.
- **OBS-003 — Immutable audit.** Security and product audit events **MUST** be append-only, tenant-scoped, access-controlled, tamper-evident, retention-managed, and exportable to WORM storage where policy requires.

Run history MAY expose inputs/outputs allowed by data policy, steps, tool calls, approvals, model decisions, usage, errors, and replay lineage. Do not store hidden chain-of-thought; retain structured reasons, decisions, and evidence references.

Define owners and alerts for API latency, admission age, EVE stalls, connector/model/sandbox failures, SSE freshness, notification delivery, audit pipeline health, and deletion backlog.
