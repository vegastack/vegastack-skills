# Security & auth

Auth, tenancy-isolation, and secrets work is the highest-rigor tier: extra precision on
every change, and a focused security audit after any auth-adjacent change before it's done.

## Authentication (Better Auth, always)

- Email/password + Google sign-in is the default configuration; magic link and email OTP
  as flows demand; 2FA TOTP when the product warrants (`allowPasswordless: true` for
  passkey/OAuth-only users). Follow Better Auth's documented APIs — never hand-roll
  session or cache invalidation beside them.
- The organizations plugin (teams enabled) owns orgs/workspaces/teams/invitations —
  organization maps to workspace (`modelName: "workspace"` pattern); "user groups" of any
  kind are Better Auth teams; never a hand-rolled workspace/membership/groups schema. The
  SSO plugin covers SAML/OIDC when enterprise auth arrives — don't build protocol code.
- Mobile uses the bearer plugin (token from `set-auth-token`, stored in secure storage) —
  same auth instance, same Postgres, as the web app.
- Sessions: rolling expiry, Postgres-authoritative. Don't enable cookie-cache-style
  shortcuts without checking Better Auth's current issues — a cookieCache bug once caused
  silent 5-minute logouts in production. Revocation ("sign out everywhere",
  admin-initiated) goes through Better Auth's session-list/revoke APIs server-side.
- Google OAuth footgun: set `baseURL` explicitly in production config — an unset or wrong
  value silently targets localhost and fails Google's exact-match redirect-URI check.
- API keys: Better Auth's apiKey plugin by default. Whatever implements them, the
  invariants hold: hash-stored with a recognizable prefix, raw value shown exactly once
  and never cached or logged again, constant-time compare on verify.

## Authorization

- Middleware/proxy is never the boundary (CVE-2025-29927 class). The boundary is a
  server-only data-access layer — `requireSession()`/`requireOrgRole()`-style helpers,
  re-checked per resource, on every route, auth before body parse.
- Every check fails closed: a policy-engine error, throw, or unmatched rule resolves to
  deny, and the deny is still audited. No `DISABLE_AUTH`-style escape hatches, ever;
  dev-only conveniences only when explicitly gated to non-production with zero prod
  behavior change.
- Role models stay small — Owner/Admin/Member covers most products. A policy engine
  (Cedar-class ABAC) needs a named trigger — fine-grained multi-principal authorization at
  platform scale; today only the flagship platform has earned it. Anyone else proposing
  one: present the trigger and ask the architecture owner.
- Tenant identity always derives from the authenticated principal — never from a
  client-supplied workspace/org ID (a trusted `?workspaceId=` param caused a real
  cross-tenant IDOR; reject on mismatch). Cross-tenant lookups return 404, never 403 — no
  existence oracle.
- If ALL UI consumers of a route sit inside the authenticated app shell, the route
  requires auth even when its data "seems public" — trace actual callers before accepting
  "intentionally public". Guest/anonymous write paths get the same rigor as authenticated
  ones — never looser.
- Tenancy at the data layer: RLS ENABLE+FORCE plus explicit scoping — data.md.

## Secrets

- No plaintext secrets anywhere: not in code, config, wrangler.jsonc, generated output,
  logs, audit records (redact to a short prefix), agent state, or JSONB columns.
  Cloudflare Worker secrets and GitHub secrets are the storage; a credential broker
  (envelope AES-256-GCM, AAD bound to org+credential+key-version, fresh per-secret DEK)
  when the product stores third-party credentials.
- OAuth: authorize/token URLs resolved server-side from a fixed allowlist (never
  caller-supplied); state single-use and session-bound; refresh tokens broker-wrapped.
- OpenBao/vault infrastructure only on named triggers — self-hosting customer-managed
  secrets, multi-service identity, dynamic DB credentials — never "because production".
- The operator enters OTP/2FA/credentials themselves, always. Agents never type or
  automate through credential prompts.

## Requests out and untrusted content

- All outbound HTTP through one SSRF-hardened egress client: DNS-resolve then deny
  private/loopback/link-local/CGNAT/ULA ranges, pin the socket to the resolved IP, exact
  host allowlist (no suffix matching), re-validate every redirect hop.
- Body-size limits stream: count bytes as they arrive and abort at the limit — never
  buffer the whole body first.
- Third-party/webhook/agent content is untrusted input — sanitize before rendering or
  acting on it. The instruction/data separation agent products must keep: ai-agents.md.

## Data protection

- Erasure by crypto-shredding: per-subject keys; erase = destroy the key. Implemented
  only when sealing is wired into every PII write path — a defined-but-unused utility is
  a finding, not a feature. Legal hold blocks GC; retention classes derived, not
  hardcoded.
- Object keys never leak raw user/workspace IDs (data.md). Never log PII beyond user IDs.
- Audit log: tamper-evident (hash-chained where the product warrants), separate from sync
  and versioning tables, pending-then-settle around side effects. Hash-chain writes lock
  the predecessor row (`SELECT ... FOR UPDATE`) before computing the next hash — unlocked
  concurrent writers silently fork the chain.

## Verifying security findings

Scanner/reviewer output follows the review discipline in principles.md — verdict per
finding, no rounding up. Additionally: every confirmed finding gets a regression test.
