# Pinned platform facts

Dated, source-verified facts that change architecture decisions and that models routinely
get wrong from stale training data. This is the ONLY file in this skill that goes stale by
itself — the weekly refresh (see refresh/REFRESH.md) re-verifies it. When a recommendation
leans on a fact older than 60 days, re-verify that one fact against its source first.

All facts below verified 2026-08-12.

## Cloudflare

- **R2 egress is $0 at any volume.** A 500GB-stored / 2TB-served workload is ~$191/mo on
  S3 vs ~$7.50/mo on R2. Reaching for S3+CloudFront "to control egress" solves a problem R2
  doesn't have. Lifecycle rules, bucket locks, event notifications, and Infrequent Access
  are all live — note IA transitions are one-way via lifecycle (IA→Standard needs a manual
  CopyObject). [developers.cloudflare.com/r2/pricing]
- **Hyperdrive supports PostgreSQL 9.0–17.x — PG 18 is NOT supported.** Target Postgres 17
  for any Hyperdrive-fronted database; re-check the supported-versions page before ever
  moving to 18. Hyperdrive also supports MySQL (GA 2026-08-07) and private DBs via Workers
  VPC. [developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features]
- **Durable Objects default to SQLite storage** (real SQL, transactions, point-in-time
  recovery), and **hibernating WebSocket DOs bill ~$0 while idle** — one-DO-per-room is
  cost-competitive with Redis+socket.io for mostly-idle connections.
  [developers.cloudflare.com/durable-objects]
- **Workflows: 10,000 steps default / 25,000 max, 365-day sleeps — and per-step billing
  since 2026-08-10.** High-step-count designs now have a real cost dimension.
  [developers.cloudflare.com/workflows]
- **Browser Rendering is metered by duration AND concurrency** ($0.09/browser-hour + $2 per
  extra concurrent browser) — batch scraping through a queue; it is not free headless Chrome.
  [developers.cloudflare.com/browser-rendering]
- **R2/KV/Workflows event notifications route through Queues "event subscriptions"** — a
  Queue consumer covers platform state changes; don't build a bespoke webhook receiver.
- **D1 read replication only helps via the Sessions API** (`withSession(bookmark)`);
  without it every query still hits the primary.

## Next.js (16.3, released 2026-08-03)

- **PPR flags are gone** — `experimental.ppr` no longer exists; partial prerendering is
  part of `cacheComponents: true` (which also replaced `dynamicIO`). [nextjs.org/blog]
- **`middleware.ts` is replaced by `proxy.ts` running on Node** — full fs/crypto/native
  package access in request interception. Remember: proxy is still never the auth boundary.
- **The Adapter API is stable since 16.2** — Vercel's adapter and Cloudflare's OpenNext
  adapter share the same public contract, but Cloudflare's still trails on newest features;
  check the deployment feature matrix per feature, don't assume parity.
  [nextjs.org/docs/app/guides/deploying-to-platforms]

## Cloudflare Workers hard limits

- **Memory 128MB per isolate (hard), CPU 30s default / 5min max (configurable), 1000
  subrequests per request (paid).** Heavy transforms (image processing, big parses)
  belong in a container/worker tier, not a Worker. Workers Logs free tier: 200k
  events/day, 3-day retention; automatic tracing starts billing 2026-10-01; OTLP export
  needs Workers Paid. [developers.cloudflare.com/workers/platform/limits]

## Better Auth (1.6.27, 2026-08-11)

- **1.7.0 is in RC** (rc.5 shipped 2026-08-11, same day as the pinned patch). Stay on
  1.6.x until 1.7 is stable; queued breaking changes include the MCP plugin restructure
  (moves to `@better-auth/mcp`) and SAML IdP-initiated default-off. [github.com/better-auth]

- **The organizations plugin models teams, invitations, and custom RBAC end-to-end**
  (`teams: { enabled: true }`, `invite-member` with `teamId`, `createAccessControl`) —
  never hand-roll workspace/membership/groups schema. [better-auth.com/docs]
- **Better Auth ships an apiKey plugin** (docs/plugins/api-key — verified live
  2026-08-12; an older internal note claiming otherwise was wrong). Default to the plugin
  for new projects; the flagship platform's native implementation (SHA-256 hash-stored,
  raw shown once) is a recorded project decision, not the house default. The `bearer`
  plugin covers token session transport (the mobile/Flutter mechanism).
- **`twoFactor` supports `allowPasswordless: true`** for users without password accounts
  (passkey/OAuth/magic-link signups).

## Agents & jobs

- **EVE (`eve` on npm, github.com/vercel/eve) is Vercel's durable-agent framework —
  v0.33.2, still beta/pre-GA, shipping near-daily.** Filesystem-first agents; every
  session a durable, resumable workflow. Exactly two production deploy shapes: on Vercel
  as Vercel Functions with Fluid Compute (a recorded per-project exception to the hosting
  default), or self-hosted as a long-running Node/OCI service beside Postgres. Never a
  request-scoped/edge function (a Cloudflare Worker included) in either shape.
  [vercel.com/docs/eve]
- **Self-hosted EVE durability (`@workflow/world-postgres`, stable 4.3.x) explicitly
  requires a long-lived worker process — "not compatible with serverless platforms".**
  Run EVE as its own Node/OCI service beside Postgres. The 5.0.0-beta channel exists;
  don't pin it without a documented reason. Internally it uses graphile-worker — it is
  not pg-boss and doesn't replace it. [workflow-sdk.dev/worlds/postgres]
- **pg-boss is at 12.x** — Postgres-native (`SKIP LOCKED`), no Redis. The right default
  for simple background jobs/cron on this stack; BullMQ only when a genuinely complex job
  graph (flows, dependencies, rate-limited pipelines) demands Redis. [npm: pg-boss]
- **trigger.dev v4 is Apache-2.0 and self-hostable free with unlimited runs** — the
  credible escape hatch when a job needs multi-hour runtimes off-platform. [trigger.dev]

## Databases & mobile

- **PlanetScale Postgres is built on Neki, not Vitess** — a newer product (GA 2025-09);
  don't transfer Vitess/MySQL assumptions. No free tier (the free Hobby plan died April
  2024); Postgres pricing is SKU-based from PS-5 non-HA at $5/mo, HA from ~$15-50/mo.
  ($39/mo figures seen elsewhere are the Vitess/MySQL PS-10 tier — a different product.)
  [planetscale.com/pricing]
- **Flutter's default renderer is Impeller on iOS, Android, and macOS** — "disable
  Impeller on Android" guidance is stale. [docs.flutter.dev]

## Self-hosting

- **Coolify needs ~2GB RAM for its own control plane and requires active patching** —
  two critical-CVE waves in 2026 alone (Jan: beta.445/451; Jun-Jul: CVE-2026-34047/49/50,
  fixed in beta.471) — a recurring pattern, not a closed incident. Size Hetzner VMs
  accordingly (CX22/4GB is the floor for Coolify + one small app); ~30 min/month real
  maintenance, not zero. [coolify.io]
