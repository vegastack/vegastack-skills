# AI cost

Apply this reference only when metered AI resources exist — model calls, sandbox runtime, embedding or knowledge processing. Cost here is an architecture concern: unattributed spend is an ownership gap, and an unbounded token path is a reliability defect. Billing, pricing, and Stripe remain out of foundation scope.

Minimum viable form by tier — prototype: none required. Production: attribution logging (`COST-001`) plus a hard spend cap or alert. Enterprise: full budgets, cache economics, and the regression gate.

- **COST-001 — Workspace attribution.** Every model, embedding, sandbox, and knowledge-processing call **MUST** record per-workspace attribution: tokens in/out, cached versus uncached, provider and model pin, feature or agent identity, and run correlation. Aggregate provider invoices are not attribution; the platform must be able to state what any workspace cost yesterday.
- **COST-002 — Budgets and alerts.** Production AI features **MUST** define token or spend budgets per workspace and per feature, with alert thresholds and an explicit overrun behavior — shed, degrade, or pause visibly. Silent unlimited spend and silent hard-stop are both forbidden; the overrun behavior is a declared product decision.
- **COST-003 — Cache economics.** Prompt/context caching **SHOULD** be a measured decision: record hit rate and cost delta per route, and structure prompts so stable prefixes actually cache. Caching **MUST NOT** weaken region, retention, or tenant policy (`MODEL-003`); a cache that saves money by crossing a policy boundary fails.
- **COST-004 — Cost regression gate.** AI feature deploys **MUST** compare cost per interaction (or per run) against the current baseline, like a performance budget. A regression beyond the declared threshold blocks promotion until explained — an intended trade recorded with the change, or a defect fixed. Model swaps, prompt growth, retry amplification, and cache misses are the usual suspects.

## Measuring

| Quantity | Source | Gate use |
|---|---|---|
| tokens per run | adapter attribution record | regression baseline |
| cached share | adapter cache metadata | cache economics |
| cost per interaction | tokens × pinned model price class | `COST-004` threshold |
| workspace spend rate | attribution rollup | budget alerts |
| shed/deferred work | admission records | overrun behavior audit |

Estimate with the provider's published price class for the exact pin; reconcile estimates against provider usage reports on a fixed cadence and alarm on divergence, which usually means unattributed traffic.

Budgets, quotas, and shedding compose with `MLIFE-004`: the same admission edge that protects the provider protects the budget. Retry and fallback paths carry their own attribution so a degraded week is explainable. Cost telemetry is metadata and follows `OBS-002` — amounts and counters, never prompt content.
