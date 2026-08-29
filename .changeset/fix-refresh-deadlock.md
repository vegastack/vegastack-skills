---
"@vegastack/skills": patch
---

Refresh runner: an overdue manual-review source whose content is verifiably byte-identical to its reviewed baseline no longer deadlocks every accepting run. Under --accept-baselines, a verified-unchanged checksum (fresh hash, or a 304 against the cached etag) refreshes the review clock — scoped to manual-review sources only, so ordinary sources don't churn timestamp diffs into every weekly PR. Real content changes keep today's behavior exactly; read-only verification runs still write nothing to the registry and fail closed.
