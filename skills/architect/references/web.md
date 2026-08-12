# Web — frontend, design system, backend/API taste

## Project layout

- Top-level `server/` (or `packages/*` server code) holds DB, services, integrations — it
  is sacred: never imported from client code, enforced with `server-only` + a boundary
  check. The app router lives in `src/app/`; features are self-contained modules under
  `src/features/<domain>/` (components/hooks per feature); shared pieces in
  `src/{components,hooks,lib,store,messages}/`. Pages stay thin — they compose features.
- The house convention scopes agent instructions per directory (a short CLAUDE.md/AGENTS.md
  at each boundary-bearing directory) — follow it where a project already does this.

## Frontend architecture

- Server state → RSC + TanStack Query; URL state → nuqs; ephemeral UI state → Zustand.
  Remote/tenant data is never persisted client-side (IndexedDB/local-first was evaluated and
  rejected for multi-tenant SaaS on governance grounds — a confirmed single-tenant/offline
  product is the only exception, and that's a decision to ask for, not assume).
- Next config: `output: 'standalone'`, `cacheComponents: true` (PPR flags no longer exist).
  Query key factories live in non-`'use client'` `.keys.ts` modules so RSC pages can prefetch.
- Server Components by default; `'use client'` only at the lowest leaf that needs it.
  `/server` (or `packages/*` server code) is never imported from client code — `server-only`
  plus a boundary check, not convention.
- Request interception: on OpenNext/Cloudflare, `proxy.ts`/Node middleware does NOT work
  as of 2026-08 (open adapter issues — see infra.md); use what the adapter actually
  supports and re-check its docs per feature. Either way interception is never the auth
  boundary (see security.md).
- Internal navigation uses `next/link`; bare `<a>` only for true external links/downloads.
- Never TypeScript `any` — `unknown` and narrow.
- Dependencies: prefer the native/browser API when it covers the need
  (`Intl.RelativeTimeFormat` over date-fns); self-implement simple behavior (a tween, a diff
  view) by composing design-system primitives before adding a library; any non-trivial new
  dependency needs a stated justification and approval. **Why:** self-contained code has no
  supply-chain, licensing, or upgrade surface, and MK rejects "library because library".

## Design system (consuming `@vegastack/design` / `@vegastack/ui`)

- First-time setup in a fresh project (npm install, Tailwind wiring, provider, registry
  auth) is a separate, already-built skill — `vegastack-consume` — use it; don't
  re-derive the wiring here.
- Consume through the package barrel, never deep imports; never edit shipped component files.
  A missing component or variant is an upstream request MK decides — the recommended
  interim pattern is a local presentational composition in the app (inferred — confirm on
  first use); don't fork the system.
- Semantic tokens only: no inline `style={}`, no arbitrary values (`bg-[#123]`, `h-[13px]`),
  no raw palette classes (`bg-neutral-900`), not even for opacity. Dynamic values go through
  CSS custom properties.
- Visual language: borders-only cards, flat surfaces (shadows only for true overlays); accent
  color rationed to the primary action and real selected/active state — never hover, roughly
  ≤10 accent elements a page. Focus stays visible always (WCAG 2.2 AA floor) — the house
  mechanism is a darker border or native outline, never a `ring-*` utility. Control heights
  on the 28/32/40 scale = `h-7`/`h-8`/`h-10` (no off-scale `h-9`); radius: `rounded-md`
  controls, `rounded-sm` menu items, `rounded-lg` containers, `rounded-full` pills — never
  `rounded-xl` on cards/dialogs. Touch-target minimum is genuinely unresolved (24px WCAG AA
  vs 44px mobile-HIG both appear in the record) — ask MK when it matters.
- Typography: product code caps at `font-semibold` and uses it sparingly (inside the design
  system package itself the cap is `font-medium`); headings `font-lora`; numbers, versions,
  costs, and card digits always `font-mono`; uppercase only in mono at ≤14px. Fonts are
  self-hosted via `next/font` — never a Google Fonts CDN request.
- Icons: Lucide only. Toasts: sonner, never native/OS prompts. 4px spacing scale.
- Motion: subtle and minimal — no button hover/press animations, no `transition-all`; motion
  is for state feedback (success/error) and structural changes. `prefers-reduced-motion`
  disables animation entirely (instant, not softened).
- No decorative filler: no gratuitous badges, eyebrow text, or "3 of 3" counters — MK cuts
  these on sight as AI-generated design tells.
- Light AND dark theme on every shipped surface (internal-only tools may opt out, stated
  up front).

## UI completeness bar (every real surface, before it's "done")

- Full state matrix: loading skeleton shaped like the real content · empty state with
  guidance · error routed to the specific failure (401/403, 404, 410, 429, generic — never
  swallowed into `{}`) · success feedback. Optimistic updates where a mutation changes
  visible state; the UI reflects backend mutations without a manual refresh.
- Forms: Enter submits; spinner replaces the button icon (not beside it); first field
  auto-focused; all fields disabled while the primary action runs; state resets on error or
  navigation.
- Responsive: no horizontal scroll at any width; computed layout math, never hardcoded pixel
  offsets; truncation driven by available space, not character counts; iOS inputs must not
  zoom on focus; the mobile keyboard must never occlude the active input.
- Systemic fixes: a defect found in one component (scroll leaking through an overlay, missing
  cursor, wrong token) is fixed across the whole family in one sweep, with evidence.
- Perceived speed is the named pattern "instant shell": the layout shell renders
  immediately (RSC + `cacheComponents`), every data region streams in behind a skeleton
  shaped like its content — never a blank page or a full-page spinner.
- Long lists (>~50 rows) virtualize with `@tanstack/react-virtual` (the approved package —
  still state the justification when adding it).
- Cloning/rebranding a reference site: strip every trace of the source tool's provenance
  (class names, external asset domains, meta) so the result is fully self-contained, and
  verify parity by clicking through as a real user — screenshot diffing alone doesn't count.

## SEO and metadata (every public-facing app)

- Every route exports `metadata`/`generateMetadata` — not just the root layout. Public
  apps ship `sitemap.ts` and `robots.ts`; `llms.txt` is generated at build time, never
  hand-maintained. OG images follow the house convention (generated, mono for
  names/numbers). i18n uses next-intl `localePrefix: 'as-needed'` (stack.md) so default-
  locale URLs stay clean. **Why:** MK has demanded "100% SEO" coverage on shipped sites
  twice — treat it as a completeness bar, not an enhancement.

## Testing (web/backend — test where it pays off)

- Unit-test services and pure logic (Vitest); component/a11y tests run in Vitest browser
  mode with the Playwright provider (real Chromium — jsdom's ARIA/layout gaps produce
  false a11y results and are not trusted).
- E2E is a walking skeleton: one real happy path (boot → auth → core mutation → verify)
  plus targeted adversarial invariants — not a blanket suite. DB-gated tests are authored
  even when execution is blocked, and gated behind an env flag (`RUN_DB_TESTS=1` pattern);
  E2E doubles implement real ports, never a parallel mock pathway.
- Every confirmed bug gets a regression test; no coverage-percentage targets — "100%"
  means audit completeness, never a coverage metric. VRT/demo content is deterministic
  (no `Date.now()`/`Math.random()`).

## Backend / API design

- Contract-first: zod schemas are the single source → OpenAPI 3.1 under `/api/v1`, camelCase,
  cursor pagination on every list, RFC 9457 problem-details errors with a stable error-code
  catalog. One contract serves web, Flutter, MCP, and public consumers.
- Every route: auth before parse, through the shared route-handler wrapper — no route-local
  zod, no raw `request.json()`. Sanitize responses: secrets and credential references never
  leave the server. Enforce with a CI ratchet (unwrapped routes fail the build), not review.
- Return what the view renders, not everything — no mega-responses. Select columns explicitly.
- Body limits stream: count bytes as they arrive and abort at the limit; never buffer the
  whole body first.
- Webhooks over polling; the database is the source of truth. Once provider state lands in
  Postgres via webhook, don't re-poll the provider — and don't build intermediary "waiting"
  pages; redirect on success and let the rest arrive in the background.
- Money paths (Stripe): isolated intake (own worker or route), idempotency keys on every
  mutation, event dedupe, append-only ledgers as the single cost source of truth, audit
  events written in the same transaction as the business change. Pricing/quoting math is
  deterministic code with server-enforced invariants — AI drafts and judges; deterministic
  code calculates and enforces (a proven client-project pattern; treat as the strong
  default for money paths).
- Centralize the boring: one ID helper (never raw `crypto.randomUUID` scattered), one logger
  (never `console.log`; request/org context auto-injected; never log secrets or PII beyond
  user IDs), one typed fail-hard zod env parser validated at startup — no
  `DISABLE_AUTH`-style escape hatches, no plaintext fallbacks.
- Dead endpoints get deleted, not deprecated-and-kept. (Exception: a versioned `/api/v1`
  contract consumed by a shipped mobile app outlives web deploy cycles — app-store install
  lag means mobile clients keep the old contract alive; see mobile.md.)
- Outbound webhooks to customers (when a product offers them): a defined event catalog,
  Standard Webhooks-style signing with rotatable secrets, delivery via the transactional
  outbox → queue with retries/backoff, auto-disable an endpoint after N consecutive
  failures, and a replay surface. Never fire webhooks inline from request handlers.
- Platform-native mentions over plain text: when the data allows it, resolve and mention
  the real entity (Slack user @mentions, Notion Person fields) instead of rendering names
  as text — the recurring "don't just fix, improve" integration principle.
- Wizard/checkout flow-state persistence (Zustand + sessionStorage vs server-side draft)
  is not yet a settled house rule — ask MK when building one.
- Rate-limited responses return 429 with a `Retry-After` header.
- Timestamps stored UTC (`timestamptz`), rendered in the user's timezone; durations as
  integer milliseconds; money in integer minor units.
