# Infra — hosting, CI/CD, observability

## Hosting targets

Two sanctioned targets, recorded per project in `.vegastack/arch.md`:

- **Cloudflare Workers via OpenNext** — the default for public web products. Once a project
  commits to Cloudflare, never stand up a parallel Vercel deploy path (deploy paths drift).
  Shared packages must still *work* on Vercel for downstream consumers — that's portability,
  not a deploy target.
- **Self-managed servers** (Hetzner-class, Docker; Coolify for push-to-deploy) — when
  self-hosting is a product requirement, the workload needs long-lived processes (EVE, heavy
  workers), or platform independence justifies ~30 min/month of real ops.
- Vercel only by explicit, recorded per-project exception (e.g. EVE-hosted workloads).
  Internal/admin apps that need no edge features may run plain `next start` in Docker —
  OpenNext is the default, not a ritual.

## Cloudflare discipline

- Provision only what the current phase uses. Queues, KV, Durable Objects, Workflows are
  all trigger-gated: DO when live collaboration/presence actually ships (hibernating
  WebSockets make it cheap then — see pinned-facts); Queues when webhook/event volume is
  real; never scaffolded ahead of need. Delete stale Workers, Hyperdrive configs, and
  buckets — with an explicit create/delete accounting before touching anything, and
  `wrangler` used carefully.
- Multi-env via the Workers environments feature (`env.*`) — never separate top-level
  Workers per environment. One Hyperdrive per environment, shared by every service hitting
  the same database.
- Naming: hyphen-only across all Cloudflare resources; purge inconsistent legacy names.
- Domains: production on the `vegastack.com` apex/subdomains; non-prod environments under
  `*.vegastack.dev`. Every Worker sets `workers_dev: false` + `custom_domain: true` — the
  default `*.workers.dev` origin bypasses Cloudflare Access, so leaving it on exposes a
  gated Worker unauthenticated (this is security, not cosmetics). Preview environments are
  access-protected by default; only production is public.
- Environments are `dev` / `preview` / `production` via the Workers `env.*` feature; the
  `staging` git branch deploys to the `preview` environment — there is no fourth Worker
  environment unless a project records one. Secrets are set per environment
  (`wrangler secret put X --env production`). Local env files: `.env` feeds `next dev`,
  `.dev.vars` feeds `wrangler dev`/Miniflare — both gitignored, both with committed
  `.example` companions.
- No Cloudflare Images — optimize with `sharp` at build/upload time and serve from R2 (the
  paid add-on solves a problem `sharp` + free egress already solve).
- Runtime constraints are architectural facts: no TCP clients, per-request DB connections
  (data.md), and OpenNext trails vanilla Next.js — check OpenNext docs per feature instead
  of assuming. Two dated specifics: Turbopack is supported since adapter v1.15.0 (the old
  breakage is fixed; re-verify only on older pins); `proxy.ts`/Node middleware does NOT
  work on OpenNext Cloudflare as of 2026-08 (open issues opennextjs-cloudflare#962/#1277,
  workers-sdk#13755/#13937) — don't design a Cloudflare-hosted feature around `proxy.ts`;
  re-check the trackers before assuming it shipped.
- Edge/CDN caching never bypasses live authorization — revoked, expired, or
  password-protected content is re-checked even when the artifact is cached.
- Cloudflare Tunnel is the default for exposing self-hosted services and remote dev
  previews (already paid for via the Workers plan). Cloudflare Access gates paths by data
  sensitivity with email allowlists — not one site-wide gate.

## Self-managed discipline

- Containers hardened: non-root user, `cap_drop: [ALL]`, `read_only: true` where runtime
  paths allow; healthchecks on every service. Migrations and storage provisioning run in
  the app container's own entrypoint under a Postgres advisory lock (safe when replicas
  race on boot) — not a separate bootstrap deployable, unless a project records a concrete
  reason for one (the shipped self-host pattern deliberately avoids an extra init
  container).
- Ship `docker compose up` as the self-host story: bundle only Postgres + MinIO-class
  essentials; everything else (vector store, gateway, vault) is connect-your-own.
- Server sizing: SSD, compute, and RAM over disk capacity, optimized for ROI within the
  budget MK states for that server (ask if none was stated — don't guess one); Coolify
  itself needs ~2GB RAM and real patching (pinned-facts). Cloud infra beyond Cloudflare
  goes through Terraform, IAM scoped narrowly per purpose and region.
- Any infra cleanup (disks, stale resources, runners) needs explicit authorization first,
  scoped to verified-stale items — never blanket cleanup.

## CI/CD

- Never commit, tag, push, merge, publish, deploy, or create paid/cloud resources without
  MK's explicit go-ahead for that step — this holds even in fully autonomous runs (it is
  the red line, stated identically in SKILL.md).
- Build passes before any commit. When committing: review the complete uncommitted diff
  (not just this session's), draft a conventional-commit message covering all of it, wait
  for approval.
- Package manager is locked per project — read it from the repo, pin the exact version
  (corepack/bun), never silently substitute.
- Branch protection on main/staging/develop (no force-push), branch-naming enforced
  server-side and in a pre-push hook. DB migrations apply via CI only (data.md).
- CI is cost-managed, not maximal: path-condition expensive jobs (VRT, contract tests) so
  docs/skills-only changes skip them; push heavy verification into local pre-commit/pre-push
  hooks and self-hosted runners; hosted Actions minutes are a tracked budget. Verification
  is local-first — CI verifies that it happened, via a committed receipt (a signed
  `.gates/receipt.json` bound to the git tree hash) rather than re-executing browser
  suites. A receipt is attestation, not proof — skipping a gate becomes visible, not
  impossible.
- Wire every architectural guard script (import boundaries, runtime gravity, route-wrapper
  ratchet) into the one composed check command — a separate script someone forgets to run
  doesn't exist.
- Green CI is necessary, never sufficient: a unit is done after a real
  boot → auth → reach → mutate → verify pass against live infra. On CI failure:
  diagnose and report the root cause first; fix second.
- Releases via Changesets + GitHub Actions. MK enters npm OTP/2FA and other credentials
  himself — never the agent. Node 24 standard; deprecated Actions versions are routine
  housekeeping, fixed proactively.

## Observability (small-team baseline)

- Structured JSON logs (pino) to stdout with OTel-shaped fields (trace/request/org context
  auto-injected) — OTel-compatible by convention now, full OTel SDK/collector only when
  cross-service trace correlation becomes a real pain, not before.
- The append-only Postgres event log is the authoritative telemetry source; metrics/log
  tables are derived and disposable (30-day raw, 13-month rollups, compress after ~7 days;
  TimescaleDB opportunistic with partition+BRIN fallback).
- On Cloudflare, use the built-in free tier first: Workers Logs (200k/day, 3-day
  retention) and the analytics dashboard cost nothing; note Workers tracing starts billing
  2026-10-01, and OTLP export needs Workers Paid.
- Alerting honest to team size: an uptime monitor (Uptime Kuma-class) + a cron that checks
  error-rate thresholds in the event table and posts to Slack, plus a dead-man's-switch
  ping for silent job failures. No paging/SLO/on-call ceremony — that practice is
  deliberately undefined until the team needs it; propose per project, don't invent doctrine.

## Incidents

- Active production incident: diagnose first (root cause with evidence), fix second — the
  standing diagnose-before-fix rule applies under pressure too. Rolling back a deploy IS a
  deploy: it still needs MK's go-ahead — reach him with the evidence and the recommended
  rollback rather than acting; mitigation that doesn't deploy (feature-level disable via
  config, traffic block) can proceed and be reported.
- Every real incident gets a short postmortem in the project's `docs/postmortems/`
  (established precedent): what happened, root cause, the guard that now prevents it.
  Codify the recurring correction (advisory.md) — an incident that doesn't change a rule
  or a check will repeat.
