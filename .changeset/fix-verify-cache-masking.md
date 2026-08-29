---
"@vegastack/skills": patch
---

Refresh runner: verify-mode drift is now registry-anchored on the 200 path — a warm cache that already stored a drifted checksum can no longer mask registry drift on subsequent verify runs against servers without etag/last-modified support (the 304 path already caught this class). Drift items report `baseline: 'registry'` with a `cacheDisagrees` annotation when the cache also differs; accept mode and the 304 branch are unchanged.
