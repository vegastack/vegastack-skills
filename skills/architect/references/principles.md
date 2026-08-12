# Principles — how VegaStack decides

How MK actually makes architecture decisions, distilled from seven months of his sessions
and repos. Each rule carries its why — apply the reasoning, not just the rule.

## Build lean first

One deployable until a concrete requirement forces a split. A single, properly structured
Next.js app owns the UI, RSC, route handlers, auth, and the REST/OpenAPI control plane — no
NestJS or Hono beside it, no speculative queue, cache, or worker. A notification sender is a
cron handler inside the app, not its own deployable. **Why:** agents habitually propose
services MK then has to strip out ("why do we still need workers like extra bloat or
maintenance surface?"). On a 3-4 person team, every moving part is real maintenance, and the
lean version is usually also the faster and more reliable one.

Lean-first governs the *count of moving parts*, not the rigor inside each part.
Correctness-critical logic — money, auth, tenancy, audit, secrets — always gets full rigor.

## Every moving part names its trigger

Propose infrastructure only together with the trigger that justifies it, stated in the
recommendation: "a separate worker WHEN jobs exceed request timeouts", "a queue WHEN volume
makes inline processing lossy", "OpenBao WHEN self-hosting customer-managed secrets".
Provision only what the current build phase actually uses — infrastructure tracks real
usage, never anticipated usage. **Why:** MK stated "OpenBao mandatory in production" and
walked it back five days later ("some projects are just simple and straightforward").
Blanket mandates rot; triggers stay true as projects differ.

## Pre-launch means delete, not migrate

Zero real users = no backward compatibility, no legacy shims, no deprecation windows, no
feature flags hiding unfinished work. Delete outright; reset the dev database rather than
writing migration chains. This is the DEFAULT — most VegaStack projects are pre-launch at
any given time. Expand/migrate/contract discipline begins when real users exist, not before.
**Why:** carrying compatibility for users who don't exist is pure bloat ("NO FEATURE FLAGS
PLEASE... i dont want any backwards compatibility as this is an unreleased app").
One exception: a versioned API contract consumed by a shipped mobile app counts as having
real users even while the web side iterates freely — app-store install lag keeps old
clients alive (mobile.md).

## Reuse before you build new

Extend the existing table, service, or spine (ACL, change-log, outbox, realtime channel)
before creating a parallel one. When two components do the same job, merge them into one
canonical source. Promote a util to `/lib` the moment a second feature uses it. **Why:**
duplicated systems of record are the reference-architecture mistake MK explicitly engineers
against; two sources of the same truth always drift.

## Enforce boundaries mechanically

Architectural boundaries that matter get a CI guard script that fails the build — monorepo
import direction (apps → packages, never the reverse; workers never import UI/React),
runtime gravity (below), server/client code separation. **Why:** convention alone was tried
and failed; a guard script is cheaper than re-reviewing the same violation forever.

## Runtime gravity: long-running work never lives in the request tier

Anything that can run long, hold a connection, or outlive a request — agent execution, job
processing, media pipelines — runs in a separate worker/runner tier, never inside a route
handler or an OpenNext Worker. **Why:** request-scoped tiers have timeouts and body limits;
the reference codebase MK studied executed workflows inside Next.js handlers and it is the
single anti-pattern he cites most.

## Effort scales with stakes, not habit

Security, auth, tenancy, money, and architecture foundations get generous, thorough,
adversarial treatment. Routine features on a small team get medium thoroughness — do a cheap
reconnaissance pass before committing to full-cost work, and don't build governance ceremony
a 3-4 person team will never exercise. **Why:** MK's own most recent self-correction — his
previous architecture skill "got too complicated" by applying flagship-platform rigor
everywhere.

## Decisions are verified, recorded, and reversible for a reason

- Resolve uncertainty with evidence, never with the safer-sounding guess: check the live
  official docs (current year), verify the claimed constraint, then decide. MK refused to
  accept an unverified "Better Auth forces text UUID columns" claim — it was false.
- Present decisions as 2-3 options with a clear recommendation and the tradeoff that
  matters, then record what was chosen and why (an ADR or one dated ledger line).
- MK reverses when: a verified assumption proves false · added cleverness regresses UX ·
  a heavyweight mandate meets a simple project · his own tooling over-complicates. He
  reverses toward less machinery on low stakes and toward more rigor only when a concrete
  bug or vulnerability is found. Anticipate this: don't defend machinery he'd delete.

## Context gates rigor — ask, don't assume

Rigor flexes on facts, not labels: pre-launch or live · internal, client, or OSS ·
self-hosted or managed · handles money/PII or not · has real users or not. These live in
`.vegastack/arch.md`. Client work gets the same approval gates and honesty as internal work
— if anything, more documentation, never less. When two recorded decisions conflict or the
profile can't answer, ask MK with a recommendation instead of assuming.
