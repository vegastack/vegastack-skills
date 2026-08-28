# Stack — locked decisions

The VegaStack default stack. "Not" columns are real rejections MK has made — do not
re-propose them without new facts. Current versions and platform caveats live in
[pinned-facts](pinned-facts.md); check there before pinning a version.

| Area | Use | Not | Why |
|---|---|---|---|
| Web framework | Next.js App Router, one app | NestJS, Hono, a second backend | A properly structured Next app owns web + API + auth for web, Flutter, MCP, and public consumers; a second framework is pure maintenance surface |
| Runtime / package manager | Bun (default for new projects); pnpm fully sanctioned where chosen | npm, yarn — never | One lockfile discipline per project; dev.md records which. Commit text lockfiles (`bun.lock`, not `bun.lockb`) |
| Auth | Better Auth, always — default flows, plugins, and the org→workspace mapping: security.md | Hand-rolled auth, custom user-groups schema, Auth0/Clerk | Owner-stated standing rule; prefer the shipped plugins over native builds unless a project records why |
| Database | PostgreSQL, always self-managed by us: PlanetScale Postgres server or self-hosted (Hetzner or similar), behind Hyperdrive on Workers. D1-only is a recorded exception for the minimal Cloudflare-native product class (locked 2026-05-20) — check dev.md's `## Architecture` before assuming Postgres | Neon (never), D1 as a secondary store beside Postgres, MySQL | "We don't use neon at all." One datastore per product. D1's sanctioned sidecar case: a Worker-scoped idempotency table for Stripe webhooks — Postgres still owns the ledger |
| ORM | Drizzle + drizzle-kit, single `postgres-js` driver | Prisma | House standard across every repo since Feb 2026 |
| DB from Workers | Hyperdrive binding, per-request client — discipline in data.md | Global pools, TCP clients (ioredis) in Workers | workerd forbids I/O across requests; a module-level pool is a bug, not a style choice |
| Storage | Cloudflare R2 (S3-compatible API), presigned URLs, short-lived scoped access | S3 + CloudFront by reflex | R2 egress is $0 at any scale — the cost problem S3+CDN solves doesn't exist here. Keep the S3 protocol boundary so any S3 provider or MinIO works for licensed self-hosted deployments |
| Cache / Redis | None by default. Rate limiting and caching Postgres-native; Workers KV only with a named trigger (e.g. read-mostly config cache at volumes where a Postgres round-trip measurably hurts — the recorded auth-cache migration); a Redis-class store never correctness-bearing | Upstash Redis (migrated off), Redis "because caching" | "No Redis in P1" — a cache layer is a moving part; Postgres already exists. Never cache authorization/role data aggressively (data.md) |
| Jobs / cron | pg-boss on the existing Postgres, dispatcher-only — lease/heartbeat/retry state of authority in our own tables. Cron parsing/description: `croner` (DST/IANA-aware) + `cronstrue` | BullMQ+Redis, Temporal, CF Queues by default; `node-cron`, `cron-parser` | Jobs are simple; Postgres is already there. Owning durability state keeps the queue library swappable; a cron-parser swap was made and corrected once already |
| Agent execution | EVE (Vercel's `eve`) — deploy shapes and constraints: ai-agents.md | EVE inside an OpenNext Worker or any request-scoped/edge function | EVE's Postgres world requires a long-lived worker process; EVE owns agent sessions, pg-boss owns generic jobs — never conflated |
| AI calls | AI SDK behind a thin adapter; Anthropic default provider; Cloudflare AI Gateway for routing/telemetry when on Cloudflare | Hardcoded model IDs scattered in code, per-provider SDKs everywhere | Adapter keeps providers swappable; the gateway centralizes cost/telemetry without building it |
| Design system | Consume `@vegastack/design` + `@vegastack/ui` (Base UI primitives, semantic tokens) | Creating/modifying components upstream, raw shadcn edits, Radix for new work | Consume, don't extend — upstream changes are MK's deliberate decision. Base UI locked over Radix 2026-07 |
| Frontend state | Server state via RSC + TanStack Query; URL state via nuqs; ephemeral UI state via Zustand | Persisting remote/tenant data client-side (IndexedDB/local-first) for multi-tenant SaaS | Governance: tenant data never rests on the client. Local-first only for a confirmed single-tenant/offline product — ask first |
| Realtime | SSE tailing an event log first; Durable Objects (SQLite, WebSocket hibernation) when on Cloudflare and bidirectional state is real. One DO per collaboration scope (a `WorkspaceHub` for presence, a per-document `PageSync` for edits) — never one monolithic DO | socket.io + Redis pub/sub, Ably, Pusher | SSE covers most "live" needs with zero new services; hibernating DOs bill ~nothing while idle. Third-party realtime vendors were migrated off |
| Collaborative editing | Tiptap editor (markdown as source of truth), Yjs CRDT sync via `y-partyserver` inside the document DO; server-side sanitization/versioning applies to every CRDT write | CodeMirror (abandoned 2026-05-21), ElectricSQL (removed), RxDB (reversed to plain Dexie where local cache is needed) | Locked through real reversals; CRDT must never become an XSS/version/audit bypass |
| Analytics | Self-hosted Plausible (`pb.vegastack.com`), proxied via `next-plausible` where applicable | Google Analytics, Vercel Analytics, PostHog by default | Self-hosted, privacy-clean, already running — recurs across 5 projects |
| Hosting | Cloudflare Workers via OpenNext, or self-managed servers (Docker; Coolify for push-to-deploy) — recorded in dev.md's Architecture | Vercel as a default (per-project recorded exception only); a parallel Vercel path once committed to Cloudflare | Cost and egress economics favor Cloudflare/self-host; split deploy paths drift. EVE-hosted workloads are a legitimate Vercel exception |
| Email | AWS SES (behind an adapter); bounces/complaints via the SNS-webhook pattern into a suppression list | Per-vendor SDK sprawl, sending to suppressed addresses | Cheap, boring, proven in-house; unhandled bounces poison sender reputation |
| Payments | Stripe — money-path mechanics: web.md | Building billing logic inside request handlers | Money paths get the full rigor tier |
| Monorepo | Turborepo + workspaces (Bun or pnpm) when there is more than one package; apps → packages only, enforced by a boundary check | Deep relative cross-package imports, packages importing apps | Import direction is a guard script, not a convention |
| i18n | next-intl, `localePrefix: 'as-needed'`; no hardcoded user-facing strings | Ad-hoc string tables | Already the proven pattern; English-only today but scaffolded |
| APIs | Contract-first: zod schemas → OpenAPI 3.1 — detail: web.md | Route-local validation, raw `request.json()`, unbounded lists | One contract feeds web, Flutter, MCP, and public consumers |

## Choosing between the two hosting targets

Cloudflare (OpenNext) when: public web product, global latency matters, R2/DO/Queues fit,
cost-per-request dominates. Self-managed (Docker/Hetzner) when: self-hosting is a product
requirement (licensed/enterprise), the workload needs long-lived processes (EVE, heavy
workers), or platform independence is worth ~30 min/month of ops. Many products use both:
OpenNext app on Cloudflare + a long-running worker container beside the database.
