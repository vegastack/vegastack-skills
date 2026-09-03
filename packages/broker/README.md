# @vegastack/factory-token-broker

A Cloudflare Worker that exchanges a GitHub Actions OIDC token for a **one-repository** VegaFactory
installation token capped to issues and projects. Private to this monorepo — it is never published;
the only published package is `packages/cli`.

The customer-facing reference (endpoint, request and response shapes, status codes, rotation
runbook, kill switch, support boundary) is
[`skills/dev/dev-setup/references/github-app.md`](../../skills/dev/dev-setup/references/github-app.md),
under **Hosted token broker**. This file is the map for someone changing the code.

## What it does

`POST /token` with `Authorization: Bearer <OIDC JWT>`:

1. verifies the JWT against GitHub's public JWKS — RS256 only, issuer, audience, expiry, 60s skew;
2. reads `repository` and `repository_owner` from the **verified** claims, and from nothing the
   caller sends — that is the whole tenancy model;
3. spends one rate-limit token for that repository;
4. mints an installation token for exactly that one repository with exactly
   `{issues: write, metadata: read, organization_projects: write}`;
5. compares the response's own permission echo to the same constant before returning anything.

`GET /health` answers `{"status":"ok"}` unauthenticated, reads no credential, and is not audited.

## Module map

| File | Job |
|---|---|
| `src/egress.ts` | The only outbound call site: exact-host allowlist, `https:` only, `redirect: 'error'` |
| `src/env.ts` | The two binding shapes (`SecretBinding`, `RateLimiter`) and `readSecret` |
| `src/oidc.ts` | JWT parse and verification, and the JWKS memo + edge cache |
| `src/github.ts` | App key import, App JWT, installation lookup, capped mint, permission echo |
| `src/ratelimit.ts` | The rate-limit binding wrapper, and what its verdict does and does not mean |
| `src/index.ts` | Routing, status codes, the audit record, and the Worker's `fetch` export |
| `scripts/config-check.mjs` | The deploy guard the workflow runs before `wrangler deploy` |

## Bindings

Two, and no storage binding of any kind:

- `APP_PRIVATE_KEY` — a **Secrets Store** secret (`secrets_store_secrets`), read with
  `await env.APP_PRIVATE_KEY.get()`. One account-level secret serves both environments and rotates
  in one place. The key must be PKCS#8; the Worker refuses a PKCS#1 PEM with the conversion command.
- `TOKEN_LIMITER` — the GA rate-limit binding (`ratelimits`), `await env.TOKEN_LIMITER.limit({key})`.
  Its count is per Cloudflare location and `simple.period` accepts only 10 or 60 seconds, so it is
  an abuse brake, never an authorization decision. Sized at 30 requests per minute per repository
  in both environments (`wrangler.jsonc`), keyed `<owner>/<repository>` from the verified claims.

GitHub's public signing keys sit in a module-scope memo and the Cloudflare edge cache
(`cf: { cacheTtl: 3600, cacheEverything: true }` on the JWKS subrequest), which is why no KV
namespace exists.

## Working on it

```sh
bun test packages/broker                        # unit tests, no network
node packages/broker/scripts/config-check.mjs --json   # the deploy guard
```

`wrangler.jsonc` stays **comment-free JSON**: `config-check.mjs` parses it with `JSON.parse` so the
guard is deterministic, and a JSONC comment makes it block with that sentence.

Local development reads the App key from `.dev.vars` (see `.dev.vars.example`, and note `.dev.vars`
is gitignored) under the same binding name production reaches, so no call site changes.

Deploys run from `.github/workflows/broker-deploy.yml`: preview automatically on a merge to main,
production only by dispatch behind the `production` GitHub Environment's required reviewer.
