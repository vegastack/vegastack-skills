# Web — frontend, backend/API taste

## Project layout

- Top-level `server/` (or `packages/*` server code) holds DB, services, integrations —
  never imported from client code, enforced with `server-only` + a boundary check, not
  convention. App router in `src/app/`; features as self-contained modules under
  `src/features/<domain>/`; shared pieces in `src/{components,hooks,lib,store,messages}/`.
  Pages stay thin — they compose features.
- The house convention scopes agent instructions per directory (a short CLAUDE.md/AGENTS.md
  at each boundary-bearing directory) — follow it where a project already does this.

## Frontend architecture

- Server state → RSC + TanStack Query; URL state → nuqs; ephemeral UI state → Zustand.
  Remote/tenant data is never persisted client-side (rejected for multi-tenant SaaS on
  governance grounds; a confirmed single-tenant/offline product is the only exception —
  ask, don't assume).
- Next config: `output: 'standalone'`, `cacheComponents: true` (PPR flags no longer
  exist — pinned-facts). Query key factories in non-`'use client'` `.keys.ts` modules so
  RSC pages can prefetch. Server Components by default; `'use client'` only at the lowest
  leaf that needs it. Internal navigation uses `next/link`.
- Request interception on OpenNext/Cloudflare: check pinned-facts before designing around
  `proxy.ts` — and interception is never the auth boundary (security.md).
- Dependencies: prefer the native/browser API when it covers the need
  (`Intl.RelativeTimeFormat` over date-fns); self-implement simple behavior by composing
  design-system primitives before adding a library; any non-trivial new dependency needs a
  stated justification and approval. **Why:** self-contained code has no supply-chain,
  licensing, or upgrade surface — MK rejects "library because library".

## Design system

`vegastack-design-system` owns component choice, tokens, and the do/don't rules;
first-time wiring is `vegastack-consume`. Consume-don't-extend is a red line (SKILL.md).
One unresolved item recorded here: touch-target minimum (24px WCAG AA vs 44px mobile-HIG
both appear in the record) — ask MK when it matters.

## UI completeness bar (every real surface, before it's "done")

- Full state matrix: loading skeleton shaped like the real content, empty state with
  guidance, errors routed to the specific failure (never swallowed into `{}`), success
  feedback, optimistic updates where a mutation changes visible state.
- Perceived speed is the named "instant shell" pattern: the layout shell renders
  immediately (RSC + `cacheComponents`), every data region streams in behind a
  content-shaped skeleton — never a blank page or full-page spinner.
- Systemic fixes: a defect found in one component (scroll leaking through an overlay,
  wrong token) is fixed across the whole family in one sweep, with evidence.
- Long lists (>~50 rows) virtualize with `@tanstack/react-virtual` (approved — still state
  the justification when adding it).
- Cloning/rebranding a reference site: strip every trace of the source's provenance (class
  names, asset domains, meta) and verify parity by clicking through as a real user —
  screenshot diffing alone doesn't count.

## SEO and metadata (every public-facing app)

Every route exports `metadata`/`generateMetadata` — not just the root layout. Public apps
ship `sitemap.ts` and `robots.ts`; `llms.txt` is generated at build time, never
hand-maintained; OG images follow the house convention (generated, mono for names/numbers).
**Why:** MK has demanded "100% SEO" on shipped sites twice — a completeness bar, not an
enhancement.

## Testing — stack-specific taste (whether tests are required: dev.md's `tests:` knob)

- Component/a11y tests run in Vitest browser mode with the Playwright provider — jsdom's
  ARIA/layout gaps produce false a11y results and are not trusted.
- E2E is a walking skeleton: one real happy path (boot → auth → core mutation → verify)
  plus targeted adversarial invariants — not a blanket suite. DB-gated tests are authored
  even when execution is blocked, behind an env flag (`RUN_DB_TESTS=1`); E2E doubles
  implement real ports, never a parallel mock pathway.
- VRT/demo content is deterministic (no `Date.now()`/`Math.random()`). "100%" means audit
  completeness, never a coverage metric.

## Backend / API design

- Contract-first: zod schemas are the single source → OpenAPI 3.1 under `/api/v1`,
  camelCase, cursor pagination on every list, RFC 9457 problem-details errors with a
  stable error-code catalog. One contract serves web, Flutter, MCP, and public consumers.
- Every route: auth before parse, through the shared route-handler wrapper — no
  route-local zod, no raw `request.json()`; responses sanitized (secrets and credential
  references never leave the server). Enforced with a CI ratchet, not review.
- Return what the view renders — no mega-responses; select columns explicitly.
- Webhooks over polling; the database is the source of truth. Once provider state lands in
  Postgres via webhook, don't re-poll — and no intermediary "waiting" pages; redirect on
  success and let the rest arrive in the background.
- Money paths (Stripe): isolated intake (own worker or route), idempotency keys on every
  mutation, event dedupe, append-only ledgers as the single cost source of truth, audit
  events in the same transaction as the business change. Pricing math is deterministic
  code with server-enforced invariants — AI drafts and judges; deterministic code
  calculates and enforces.
- Centralize the boring: one ID helper, one logger (never `console.log`; request/org
  context auto-injected; never log secrets or PII beyond user IDs), one typed fail-hard
  zod env parser validated at startup.
- Dead endpoints get deleted, not deprecated-and-kept (exception: a versioned `/api/v1`
  contract consumed by a shipped mobile app — mobile.md).
- Outbound webhooks to customers: defined event catalog, Standard Webhooks-style signing
  with rotatable secrets, delivery via transactional outbox → queue with retries/backoff,
  auto-disable after N consecutive failures, a replay surface — never fired inline from
  request handlers.
- Platform-native mentions over plain text: resolve and mention the real entity (Slack
  @mentions, Notion Person fields) instead of rendering names as text.
- Wizard/checkout flow-state persistence (client store vs server-side draft) is not a
  settled house rule — ask MK when building one.
