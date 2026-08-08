# Flutter client

Apply this reference only when the `flutter` capability is enabled or Flutter code is observed.

## Architecture

- **MOB-001 — Delegated mobile identity.** Flutter **MUST** use Better Auth OAuth 2.1/OIDC authorization code with S256 PKCE, discovery, consent, refresh rotation, and revocation. Better Auth Bearer session transport is not the mobile foundation. [BETTERAUTH-OAUTH] [APP-AUTH]
- **MOB-002 — Generated client.** Flutter **MUST** consume the generated OpenAPI client and must not maintain parallel request/response types.
- **MOB-003 — Local secrets.** Refresh tokens and device-bound secrets **MUST** use platform secure storage; logs, analytics, crash reports, deep links, and ordinary local databases **MUST NOT** contain them.
- **MOB-004 — Push and link boundary.** Push payloads **MUST NOT** contain sensitive content or credentials; clients authenticate and fetch authoritative state. Universal/app links **MUST** validate scheme, host, path, state, expiry, and authenticated tenant before navigation.

Organize code by Riverpod feature modules with declarative routing and online-first repositories. Expose loading, stale, error, retry, and conflict state rather than hiding network state. [FLUTTER-DOCS] [RIVERPOD-DOCS]

Apply pinned claims to the Flutter 3.44 stable series (Dart 3.12), the current stable baseline; adopting a newer stable is source drift that requests scoped review, matching how other foundation-compatibility families handle version advances. <!-- source: FLUTTER-DOCS -->

## Network and local state

Attach access tokens only to allowlisted API origins. Refresh through one coordinated path; on reuse, revocation, or invalid grant, clear credentials and require authentication. Bind idempotency keys to mutating commands and reconcile optimistic state with the server.

Classify cached data by sensitivity and retention. Encrypt confidential caches, scope them to account and workspace, purge them on sign-out, revocation, workspace removal, or policy change, and make schema migrations reversible or safely destructive.

## Push, links, and release

Treat notifications as hints and deduplicate them by event ID. [FCM-DOCS] [APNS-DOCS]

Support localized UI and templates, RTL, IANA timezones, accessibility semantics, font scaling, and locale-aware formatting. Release gates should cover generated-client drift, OAuth/PKCE, token refresh/revocation, offline mutation recovery, tenant switching, push/deep links, storage purge, localization, and accessibility.
