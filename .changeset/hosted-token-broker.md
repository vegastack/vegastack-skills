---
"@vegastack/vegafactory": minor
"@vegastack/vegafactory-dashboard": minor
---

Any organisation that installs the VegaFactory App can now get repository-scoped GitHub tokens from a hosted broker instead of holding a private key of its own.

- A Cloudflare Worker at `packages/broker` exchanges a GitHub Actions OIDC token (audience `vegastack-factory`) for a one-repository installation token capped to `issues: write`, `metadata: read`, `organization_projects: write` — enforced in the request and again against the response's own permission echo.
- The repository comes from the verified OIDC `repository` and `repository_owner` claims and from nothing the caller sends, so one organisation can never mint a token for another's repository.
- Fails closed: 401 unverifiable token, 403 uninstalled repository, 429 rate limited, 503 rate limiter unavailable, 502 upstream failure, 500 on a widened permission echo with the token discarded. `GET /health` answers unauthenticated and reads no credential.
- The App private key lives only in a Cloudflare Secrets Store secret; the broker declares no storage binding at all and persists no customer content — one audit record per request carries repository, owner, installation id, decision and status, never a token.
- `github-app.md` gains the customer-facing `Hosted token broker` reference: status codes, tenancy, rotation runbook, uninstall kill switch, rate-limit honesty, and the support boundary. The `vegastack/factory-token` composite action source ships in `packages/broker/action/`.
