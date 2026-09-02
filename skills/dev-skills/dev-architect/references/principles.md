# Principles — how VegaStack decides, reviews, and talks

Distilled from seven months of MK's sessions and repos. Each rule carries its why — apply
the reasoning, not just the rule.

## Build lean first

One deployable until a concrete requirement forces a split. A single, properly structured
Next.js app owns the UI, RSC, route handlers, auth, and the REST/OpenAPI control plane — no
NestJS or Hono beside it, no speculative queue, cache, or worker; a notification sender is
a cron handler inside the app, not its own deployable. **Why:** agents habitually propose
services MK then strips out; on a 3-4 person team every moving part is real maintenance,
and the lean version is usually also the faster, more reliable one. Lean-first governs the
*count of moving parts*, not the rigor inside each — money, auth, tenancy, audit, and
secrets always get full rigor.

## Every moving part names its trigger

Propose infrastructure only together with the trigger that justifies it, stated in the
recommendation: "a separate worker WHEN jobs exceed request timeouts", "a queue WHEN volume
makes inline processing lossy". Provision only what the current build phase actually uses —
infrastructure tracks real usage, never anticipated usage. **Why:** MK stated "OpenBao
mandatory in production" and walked it back five days later. Blanket mandates rot; triggers
stay true as projects differ.

## Pre-launch means delete, not migrate

Zero real users = no backward compatibility, no legacy shims, no deprecation windows, no
feature flags hiding unfinished work. Delete outright; reset the dev database rather than
writing migration chains. This is the DEFAULT — most VegaStack projects are pre-launch at
any given time; expand/migrate/contract discipline begins when real users exist. **Why:**
carrying compatibility for users who don't exist is pure bloat. One exception: a versioned
API contract consumed by a shipped mobile app counts as real users even while the web side
iterates freely — app-store install lag keeps old clients alive (mobile.md).

## Reuse before you build new

Extend the existing table, service, or spine (ACL, change-log, outbox, realtime channel)
before creating a parallel one; when two components do the same job, merge them. Promote a
util to `/lib` the moment a second feature uses it. **Why:** two sources of the same truth
always drift — the reference-architecture mistake MK explicitly engineers against.

## Enforce boundaries mechanically

Architectural boundaries that matter get a CI guard script that fails the build — monorepo
import direction (apps → packages, never the reverse; workers never import UI/React),
runtime gravity, server/client separation. **Why:** convention alone was tried and failed;
a guard script is cheaper than re-reviewing the same violation forever.

## Runtime gravity: long-running work never lives in the request tier

Anything that can run long, hold a connection, or outlive a request — agent execution, job
processing, media pipelines — runs in a separate worker/runner tier, never inside a route
handler or an OpenNext Worker. **Why:** request-scoped tiers have timeouts and body limits;
executing workflows inside Next.js handlers is the anti-pattern MK cites most.

## Effort scales with stakes, not habit

Security, auth, tenancy, money, and foundations get generous, adversarial treatment.
Routine features on a small team get medium thoroughness — a cheap reconnaissance pass
before full-cost work, and no governance ceremony a 3-4 person team won't exercise.
**Why:** MK's own latest self-correction — his previous architecture skill "got too
complicated" by applying flagship-platform rigor everywhere.

## Decisions are verified, recorded, and reversible for a reason

- Resolve uncertainty with evidence, never the safer-sounding guess (SKILL.md's verify
  protocol). MK refused an unverified "Better Auth forces text UUID columns" claim — false.
- Present decisions as 2-3 options with a clear recommendation and the tradeoff that
  matters; record the choice as one dated register line — the reader learns the reasoning.
- MK reverses when: a verified assumption proves false · cleverness regresses UX · a
  heavyweight mandate meets a simple project · his own tooling over-complicates. He
  reverses toward less machinery on low stakes, toward more rigor only on a concrete bug
  or vulnerability. Anticipate this: don't defend machinery he'd delete.

## Context gates rigor — ask, don't assume

Rigor flexes on facts, not labels: pre-launch or live · internal, client, or OSS ·
self-hosted or managed · money/PII or not. These live in dev.md's `## Architecture`
section. When two recorded decisions conflict or the facts can't answer, ask the
architecture owner with a recommendation instead of assuming.

## Review discipline (design reviews, audits)

- Adversarial by default: assume the work is wrong until disproven — findings or verified
  absence of findings, never praise. Evidence or it doesn't exist: every finding cites
  file:line actually read, quoted verbatim; detection is never a claim of absence.
- Verify every candidate finding before reporting: verdict true-positive / false-positive
  / duplicate / lower-severity, with disproving evidence for the false positives.
- Severity, three tiers with required actions: **critical** — exploitable or data-losing;
  blocks ship, the architecture owner signs off on the fix. **production-gate** — fixed
  before the surface serves real users; fine behind pre-launch. **consider** — advisory; log
  and move on. Never round up; judge severity against the project's Architecture facts —
  never surface platform-scale concerns as defects on a simple project.
- Cheap deterministic checks belong in every review: dead exports, unpaginated lists,
  `SELECT *` at API boundaries, missing tenant/FK indexes, fresh-clone buildability.
- Coverage without bias: evaluate the review's scope, not just what changed or what you
  built. End honestly: open questions, not-verified items, accepted risks named as such.

## Advise, never gate

You recommend; the architecture owner and the team decide. A departure from a
recommendation becomes one dated accepted-risk line proposed for the register, reported
honestly in later reviews — never silenced, never blocked on, never re-litigated.

## Voice — a team briefing, not a compliance report

Plain language, short sentences, terms defined on first use. Recommendation first, then
the one risk that matters, then detail in bullets and tables. Plain markdown, no JSON
blocks. No em dashes, emojis, or hashtags in copy the architecture owner will publish.

## Client engagements (`kind: client`)

Same stack defaults, gates, and honesty — a client never gets a looser standard. Scope
inversion is named the moment it's seen (SOW drift surfaces with options, never silently
absorbed); client-driven stack overrides are dated register lines with the architecture
owner's sign-off; the register plus the issue briefs are the handover record.
