# Infra — hosting, CI cost, observability

## Hosting targets

Two sanctioned targets, recorded in dev.md's `## Architecture`:

- **Cloudflare Workers via OpenNext** — the default for public web products. Once
  committed to Cloudflare, never stand up a parallel Vercel deploy path (deploy paths
  drift); shared packages must still *work* on Vercel for downstream consumers —
  portability, not a deploy target.
- **Self-managed servers** (Hetzner-class, Docker; Coolify for push-to-deploy) — when
  self-hosting is a product requirement, the workload needs long-lived processes (EVE,
  heavy workers), or platform independence justifies ~30 min/month of real ops.
- Vercel only by explicit, recorded per-project exception (e.g. EVE-hosted workloads).
  Internal/admin apps needing no edge features may run plain `next start` in Docker —
  OpenNext is the default, not a ritual.

## Cloudflare discipline

- Provision only what the current phase uses. Queues, KV, Durable Objects, Workflows are
  trigger-gated — DO when live collaboration actually ships, Queues when webhook/event
  volume is real — never scaffolded ahead of need. Delete stale Workers, Hyperdrive
  configs, and buckets, with an explicit create/delete accounting first.
- Multi-env via the Workers environments feature (`env.*`) — never separate top-level
  Workers per environment; environments are `dev` / `preview` / `production`, and the
  `staging` git branch deploys to `preview`. One Hyperdrive per environment, shared by
  every service hitting the same database. Naming: hyphen-only; purge inconsistent legacy
  names.
- Domains: production on `vegastack.com`; non-prod under `*.vegastack.dev`. Every Worker
  sets `workers_dev: false` + `custom_domain: true` — the default `*.workers.dev` origin
  bypasses Cloudflare Access, exposing a gated Worker unauthenticated (security, not
  cosmetics). Preview environments access-protected by default; only production is public.
- Secrets per environment (`wrangler secret put X --env production`). Local env files:
  `.env` feeds `next dev`, `.dev.vars` feeds `wrangler dev` — both gitignored, both with
  committed `.example` companions.
- No Cloudflare Images — optimize with `sharp` at build/upload time and serve from R2 (the
  paid add-on solves a problem `sharp` + free egress already solve).
- Runtime constraints are architectural facts: no TCP clients, per-request DB connections
  (data.md), and OpenNext trails vanilla Next.js — check OpenNext docs per feature
  (current adapter caveats: pinned-facts).
- Edge/CDN caching never bypasses live authorization — revoked, expired, or
  password-protected content is re-checked even when the artifact is cached.
- Cloudflare Tunnel is the default for exposing self-hosted services and remote dev
  previews (already paid for). Cloudflare Access gates paths by data sensitivity with
  email allowlists — not one site-wide gate.

## Self-managed discipline

- Containers hardened: non-root user, `cap_drop: [ALL]`, `read_only: true` where runtime
  paths allow; healthchecks on every service. Migrations and storage provisioning run in
  the app container's own entrypoint under a Postgres advisory lock (safe when replicas
  race on boot) — not a separate bootstrap deployable unless a project records why.
- Ship `docker compose up` as the self-host story: bundle only Postgres + MinIO-class
  essentials; everything else (vector store, gateway, vault) is connect-your-own.
- Server sizing: SSD, compute, and RAM over disk capacity, within the budget the architecture
  owner states for that server (ask if none stated — don't guess); Coolify's own footprint:
  pinned-facts. Cloud infra beyond Cloudflare goes through Terraform, IAM scoped narrowly per
  purpose.
- Any infra cleanup (disks, stale resources, runners) needs explicit authorization first,
  scoped to verified-stale items — never blanket cleanup.

## CI cost and verification (workflow gates and ship mechanics live in dev.md)

- CI is cost-managed, not maximal: path-condition expensive jobs so docs-only changes skip
  them; push heavy verification into local hooks and self-hosted runners; hosted Actions
  minutes are a tracked budget. Verification is local-first — CI verifies it happened via
  a committed receipt bound to the git tree hash rather than re-executing browser suites;
  a receipt is attestation, not proof — skipping a gate becomes visible, not impossible.
- Wire every architectural guard script (import boundaries, runtime gravity, route-wrapper
  ratchet) into the one composed check command — a separate script someone forgets to run
  doesn't exist.
- Green CI is necessary, never sufficient: a unit is done after a real
  boot → auth → reach → mutate → verify pass against live infra. On CI failure: diagnose
  and report the root cause first; fix second.

## Observability (small-team baseline)

- Structured JSON logs (pino) to stdout with OTel-shaped fields (trace/request/org context
  auto-injected) — OTel-compatible by convention now; the full OTel SDK/collector only
  when cross-service trace correlation becomes a real pain.
- The append-only Postgres event log is the authoritative telemetry source; metrics/log
  tables are derived and disposable (30-day raw, 13-month rollups, compress after ~7 days;
  TimescaleDB opportunistic with partition+BRIN fallback).
- On Cloudflare, use the built-in free tier first — Workers Logs and the analytics
  dashboard (current limits and billing dates: pinned-facts).
- Alerting honest to team size: an uptime monitor (Uptime Kuma-class) + a cron checking
  error-rate thresholds in the event table posting to Slack, plus a dead-man's-switch ping
  for silent job failures. No paging/SLO/on-call ceremony — deliberately undefined until
  the team needs it; propose per project, don't invent doctrine.

## Incidents

- Active production incident: diagnose first (root cause with evidence), fix second — the
  standing rule applies under pressure too. Rolling back a deploy IS a deploy: it needs the
  operator's go-ahead — bring them the evidence and the recommended rollback; mitigation
  that doesn't deploy (feature-level disable, traffic block) can proceed and be reported.
- Every real incident gets a short postmortem in the project's `docs/postmortems/`: what
  happened, root cause, the guard that now prevents it. An incident that doesn't change a
  rule or a check will repeat.
