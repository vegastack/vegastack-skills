---
"@vegastack/skills": patch
---

Refresh runner: an overdue manual-review source whose content is verifiably byte-identical to its reviewed baseline no longer deadlocks every accepting run. Under --accept-baselines, a verified-unchanged checksum (200-equal or 304) refreshes the source's review clock — the runner just proved the last-reviewed bytes are current. Real content changes keep today's behavior exactly; read-only verification runs still mutate nothing and fail closed.
