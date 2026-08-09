# Adaptive workflows

## Greenfield

Discover confirmed facts before recommending. Ask no more than three material questions at once and branch only when an answer activates a topic:

1. Product objective, users, lifecycle stage, access, tenancy mode — and the **tier** (prototype / production / enterprise), a deliberate choice the user confirms.
2. Clients: web, Flutter, public API, connectors or channels.
3. Agents, automation, ordinary jobs, untrusted execution and external effects.
4. Data classes, residency, retention, deletion, RPO/RTO and availability/latency objectives (production tier and above).
5. Hosting/self-hosting, workload/growth, team/on-call/cost, milestone, and deferrable choices.

If facts are unavailable, name bounded assumptions and choose the simplest applicable default. Recommend one capability set and topology sized by the minimum-viable-architecture principle: every proposed moving service names the trigger that justifies it, and every deferred one names the trigger that would. State immediate and deferred decisions, risks, implementation order, and what evidence would qualify the design at the declared tier. Offer a slim profile draft; write only after confirmation.

## Brownfield

Before asking, inspect repository instructions, manifests and locks, deployables, package graph, schemas/migrations, identity, APIs/generated clients, jobs/workflows, infra/deployment, ADRs, telemetry and runbooks. Run `profile-tool.mjs inspect` for an observed read-only draft.

Separate:

- current observed state;
- intended state from committed artifacts;
- target recommendation at the declared tier;
- immediate security/correctness risks;
- required migrations and rollback;
- optional improvements;
- runtime evidence that is not verified.

Prefer incremental migration with compatibility windows and rollback over needless rewrites. Never convert detection heuristics into claims of absence or compliance.

## Reviews

Identify the decision scope, gather evidence (read the relevant files; use the evidence recipes in the [advisory report contract](advisory-report.md)), and produce an advisory report: per-area grades, severity-ranked findings with evidence, questions, and not-verified items. Findings above the project's tier report as that tier's gate, not as defects.

## Other lifecycle tasks

For questions and explanations, answer directly: the recommendation and at most one material risk. The full response contract applies only to design reviews, ADRs, and migration plans.

- **Explanation:** answer the decision directly; load only references needed to explain it.
- **ADR:** a decision record, not a waiver — capture owner, decision, alternatives, risks, and revisit trigger.
- **Threat model:** model only enabled/exposed surfaces and their trust boundaries, at the tier's depth.
- **Deployment:** compare declared hosting with deployables, data, secrets, recovery and rollback.
- **Source drift:** refresh affected entries only; recommendations change only through review.
- **Migration/removal:** distinguish current/target state, preserve compatibility, and clean durable data, credentials, queues and contracts.

## Decision horizons

Sequence work as: irreversible security/data/identity boundaries; contracts and durable ownership; deployable placement and recovery; delivery scaffolding; measured optimization. Every phase names owner, verification, rollback and any decision record to update.
