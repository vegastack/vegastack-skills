# Web control plane

Apply this reference only when the owned `webControlPlane` capability is enabled or Next.js control-plane code is observed. A public API, shared package, or non-web platform service does not imply Next.js; review its declared provider-neutral contract and runtime separately.

## Ownership and contract

- **API-001 — Control-plane owner.** Next.js 16 App Router **MUST** initially own the web UI, RSC, Route Handlers, Better Auth, and canonical REST/OpenAPI control-plane API. Do not add NestJS or Hono without an extraction ADR.
- **API-002 — Canonical API.** Bounded Zod schemas **MUST** deterministically generate OpenAPI and Flutter/public clients. Parallel hand-written wire contracts are forbidden.
- **API-003 — Protected request order.** A protected request **MUST** authenticate, derive workspace membership server-side, authorize the typed action, set tenant context inside the protected transaction, execute the query, and emit an audit correlation ID.
- **API-004 — Tenant-safe caching.** Auth, session, authorization, membership, audit, and tenant-sensitive reads **MUST NOT** use implicit or stale caches.
- **WEB-001 — Design authority.** Web components, tokens, integrity, accessibility, and upgrade guidance **MUST** come from VegaStack Design skills/packages; this guardian must not duplicate them.

Next.js 16 and the reviewed OpenNext adapter support the selected App Router request features, but the OpenNext Worker is not an Edge-runtime or general-Node replacement. [NEXT-1630] [OPENNEXT-1202]

## Rendering and state

| Concern | Default |
|---|---|
| initial authenticated read | RSC with server-derived tenant context |
| interaction, mutation, reconnect | TanStack Query over typed REST |
| durable run output | resumable SSE with cursor and terminal reconciliation |
| validation | shared Zod contract; server authoritative |
| optimistic update | idempotency key, rollback, authoritative reconciliation, no privilege escalation |

Store UTC instants and IANA timezone identifiers. Support localized templates, pluralization, locale-aware formatting, RTL, keyboard navigation, focus management, reduced motion, and screen readers from the first implementation.

## Extraction trigger

Extract an API service only for a measured independent security, runtime, scaling, or deployment boundary after query/cache work cannot meet the SLO. Framework preference and anticipated scale are not triggers. Preserve REST/OpenAPI and one implementation of authorization, schema, and business rules through extraction.
