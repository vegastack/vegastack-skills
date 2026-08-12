# Mobile — Flutter production doctrine

**The Flutter app is a separate repo from the web/API repo** — it consumes the Next.js
REST/OpenAPI contract as one more client, never a `mobile/` directory in the web monorepo
(ADR-recorded, corroborated three ways; an expensive structural call to get wrong).

Flutter is the production mobile framework when a product needs a mobile app (not all do —
the profile records it). Baseline: Flutter 3.44.x stable; Impeller is the default renderer
on iOS and Android API 29+ (falls back below 29 — test one API<29 device before shipping).
Package versions here were verified 2026-08; re-verify on pub.dev before pinning.

Evidence tiers in this file: rules drawn from the shipped VegaStack app are stated plainly;
rules from official-docs research that MK has not yet ratified are tagged "(inferred)" —
confirm those on first use, per SKILL.md.

## Architecture (official-guidance derived — inferred where the shipped app is silent)

- MVVM per official flutter.dev/app-architecture: View (widget, no logic) → ViewModel
  (state + commands, 1:1 with its View) → Repository (source of truth, caching/retry,
  never depends on another repository) → Service (thin stateless API/platform wrapper).
  Skip the optional domain/use-case layer until logic is reused across ≥2 ViewModels.
- Project structure is layer-first: `lib/{data, domain, ui, routing, config}`, feature
  folders nested inside `ui/`, shared widgets in `ui/core/`. (Blog "feature-first is the
  standard" claims don't survive verification — the official reference app, Compass, is
  layer-first. Feature-first is a valid escalation once app/team size demands it.)
- Class names mirror roles: `HomeViewModel`, `HomeScreen`, `UserRepository`,
  `ClientApiService`.

## State management — lean by default

- Plain `ChangeNotifier`/`ValueNotifier` ViewModels with hand-wired constructor injection
  in `main.dart`. Zero extra dependencies, zero codegen — this matches both official
  guidance ("personal preference") and what VegaStack has actually shipped.
- Escalate to Riverpod only when async state genuinely needs sharing across ≥3 widgets,
  tests need provider-override mocking, or a second app shares a state-heavy module.
  No get_it — official docs steer away from service locators; `provider` is the official
  DI pick if constructor wiring ever gets unwieldy.

## Networking & auth

- One `dio` client centralized in a single `ApiClient` — never scattered HTTP calls.
  The app consumes the same contract-first REST API as the web app (web.md).
- Auth is the same Better Auth instance as web, via the bearer plugin: capture the token
  from the `set-auth-token` response header on sign-in; store it in
  `flutter_secure_storage` (never shared_preferences); attach `Authorization: Bearer` via
  a dio interceptor; clear storage and route to sign-in on 401.
- Do NOT depend on `better_auth_flutter` (0.1.0, negligible adoption as of 2026-08) —
  hand-roll the interceptor; revisit at a real 1.0.
- `shared_preferences` for non-secret local metadata only. `drift` only if genuine
  offline/relational needs exist — never speculatively.

## Design system on mobile

- Material 3 (default since 3.16); semantic colors via a hand-authored `ColorScheme` plus
  `ThemeExtension` for tokens outside Material's roles — mirroring the web design-system
  token names 1:1 from one Dart source of truth.
- House taste mapped: `CardTheme(elevation: 0)` with `outlineVariant` borders (flat,
  borders-only); TextTheme capped at `FontWeight.w600`, never bold; subtle motion with
  reduced-motion respected; Lucide-style iconography.

## Navigation, models, testing, deploy

- Navigation: the shipped app uses plain `Navigator`; `go_router` is the official Flutter
  team pick for route-heavy apps (inferred) — adopt it when deep links/route state demand
  it, not by reflex.
- Models: the shipped app hand-writes all models — stay hand-written by default; freezed +
  json_serializable only when codegen demonstrably earns its build cost (inferred
  threshold, not MK-ratified).
- Test where MVVM pays off: unit-test ViewModels and Repositories; widget-test critical
  screens; integration tests only for can't-ship-broken flows (sign-in, payment). Golden
  tests, if adopted: `alchemist` over the discontinued `golden_toolkit` (inferred — no
  VegaStack golden-test precedent yet).
- Deploy: GitHub Actions is the house CI; Fastlane for store signing/upload and real build
  flavors (`--flavor` + per-env entry points) are the researched defaults (inferred — no
  shipped store-deploy precedent yet; confirm before wiring).

Undecided (ask MK rather than assume): push-notification provider preference, offline/sync
expectations per product, store-release cadence.
