# Model lifecycle

Apply this reference only when external model providers are enabled or observed. It extends `MODEL-001` through `MODEL-003` with lifecycle, rollout, and pressure behavior; the provider-neutral adapter remains the enforcement point.

- **MLIFE-001 — Explicit model pins.** Every route **MUST** pin an explicit model identifier. Floating aliases such as `latest` or provider-default snapshots are forbidden in production routes; alias resolution happens at review time, and the resolved identifier is what ships.
- **MLIFE-002 — Deprecation watch.** The project **MUST** subscribe to deprecation and retirement notices for every pinned model and record, per model, the announced retirement date, the chosen successor, and a migration window that completes eval and cost qualification (`EVAL-002`, `COST-004`) before the provider deadline. A pinned model with a published retirement date and no successor plan is a `FAIL`, not a warning.
- **MLIFE-003 — Canary rollout.** Prompt+model behavior changes reaching paying tenants **MUST** roll out by canary or cohort: a bounded traffic slice, pre-declared comparison metrics (eval score, error rate, latency, cost), and automatic or one-step rollback to the prior pinned pair. Pre-launch and internal-only surfaces may ship directly. Cohort assignment respects tenant policy; a tenant is never split across behavior variants within one conversation.
- **MLIFE-004 — Provider backpressure.** Provider rate limits and `429`/overload responses **MUST** be absorbed by the adapter with bounded adaptive backoff, per-tenant fairness, and admission shedding at the queue edge — reject or defer new work visibly rather than retrying into a saturated provider. Retries **MUST NOT** amplify load, and fallback routing under pressure obeys `MODEL-003` policy preservation.

## Retirement flow

`pinned → deprecation notice → successor selected → eval and cost qualification → canary → cohort ramp → old pin removed`. Each step records evidence; skipping straight from notice to swap is qualification debt. Where the provider offers a legacy alias during migration, treat it as a bridge with an end date, not a destination. The provider model catalogs and deprecation registries are the watch surface. [ANTHROPIC-MODELS] [OPENAI-MODELS] [GOOGLE-MODELS]

## Fallback and admission

Fallback order is part of route policy: same-policy alternates first, degraded-capability alternates only when the product declares the degradation acceptable, visible pause when nothing satisfies policy. Record which pin actually served each request — a fallback that served traffic for a week is a de facto primary and must be qualified as one.

Admission shedding is an architecture concern, not an error handler: quotas per workspace and per feature decide who waits when capacity shrinks, and shed work surfaces as retryable, audited outcomes rather than silent loss. Measure provider error and latency baselines continuously so a deprecation-driven migration has a comparison target.
