# Architecture profile — read by the architect skill

Head start, not source of truth: the repository wins every disagreement. Keep this current;
the skill will propose updates when the repo drifts.

- hosting: cloudflare-workers-opennext   <!-- or: self-managed-server | both | vercel (exception, note why) -->
- runtime: bun                           <!-- bun | pnpm -->
- database: postgres-17 via hyperdrive   <!-- self-managed: planetscale | hetzner | other. d1 = recorded exception for minimal CF-native products -->
- auth: better-auth                      <!-- email+password, google; orgs plugin if multi-tenant -->
- storage: r2                            <!-- r2 | s3 | minio (licensed self-hosted deployments) -->
- jobs: none                             <!-- none | pg-boss -->
- agents: none                           <!-- none | eve (agent sessions) | ai-features (AI SDK calls only, no agent runtime) -->
- stage: pre-launch                      <!-- pre-launch | live -->
- kind: internal                         <!-- internal | client | oss -->
- mobile: no                             <!-- no | flutter (separate repo) -->
- notes:
  <!-- one dated line per decision, newest first, e.g.:
  - 2026-08: billing worker is a separate Cloudflare Worker (Stripe webhooks + D1 idempotency)
  - 2026-08: DO for realtime presence only; chat is SSE + Postgres
  -->
