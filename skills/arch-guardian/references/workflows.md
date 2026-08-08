# Adaptive workflows

## Greenfield

Discover confirmed facts before recommending. Ask no more than three material questions at once and branch only when an answer activates a topic:

1. Product objective, users, lifecycle stage, access and tenancy mode.
2. Clients: web, Flutter, public API, connectors or channels.
3. Agents, automation, ordinary jobs, untrusted execution and external effects.
4. Data classes, residency, retention, deletion, RPO/RTO and availability/latency objectives.
5. Hosting/self-hosting, workload/growth, team/on-call/cost, milestone, and deferrable choices.

If facts are unavailable, name bounded assumptions and choose the simplest applicable default. Recommend one capability set and topology. For each enabled capability state ownership, boundary, contract, placement, immediate/deferred decisions, risks, implementation order and qualification evidence. Offer a profile/artifact draft; write only after confirmation.

## Brownfield

Before asking, inspect repository instructions, manifests and locks, deployables, package graph, schemas/migrations, identity, APIs/generated clients, jobs/workflows, infra/deployment, ADRs, telemetry and runbooks. Run `profile-tool.mjs inspect` for an observed read-only draft.

Separate:

- current observed state;
- intended state from committed artifacts;
- target recommendation;
- immediate security/correctness risks;
- required migrations and rollback;
- optional improvements;
- runtime evidence that is `NOT VERIFIED`.

Prefer incremental migration with compatibility windows and rollback over needless rewrites. Never convert detection heuristics into claims of absence or compliance.

## Other lifecycle tasks

For questions and explanations, answer directly: the verdict if there is one, the recommendation, and at most one material risk. The full eight-part response contract applies only to design reviews, ADRs, and migration plans — not to questions, explanations, or short follow-ups.

- **Explanation:** answer the decision directly; load only references needed to explain it.
- **Review:** identify decision scope, run applicable checks, and prioritize actionable findings.
- **ADR:** distinguish a foundation change from project accepted risk; record exact control/path scope.
- **Threat model:** model only enabled/exposed surfaces and their trust boundaries.
- **Deployment:** compare declared production target with deployables, data, secrets, SLO/recovery and rollback.
- **Source drift:** refresh affected entries only; qualification state changes only through review.
- **Migration/removal:** distinguish current/target state, preserve compatibility, and clean durable data, credentials, queues and contracts.

## Decision horizons

Sequence work as: irreversible security/data/identity boundaries; contracts and durable ownership; deployable placement and recovery; delivery scaffolding; measured optimization. Every phase names owner, verification, rollback and any ADR action.
