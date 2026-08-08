# Profile and governance

The v3 profile declares project facts without assuming a full-stack product. `capabilities` is authoritative intent; repository detection is evidence for drift, not a reason to silently enable anything.

## Capability ownership

- `owned`: the project owns source, deployment, operations and migration. Enabled owned capabilities declare exact versions, placement and source roots.
- `shared-managed`: another VegaStack owner runs the capability for this project.
- `external-managed`: a third party runs it behind a project-approved contract.
- `not-applicable`: use only for disabled capabilities.

Enabled shared/external capabilities declare owner/service, contract name/version, tenant/security boundary, identity/audience, data/residency, SLO/recovery dependency, incident ownership, compatibility and migration/exit behavior. They do not require provider source roots in the consumer repository.

Owned durable capabilities declare concrete owners in `controls`: agents name `workflowDatabaseOwner` and `agentRunOwner`; jobs name `databaseOwner`; owned knowledge names `postgresOwner` and, when `binaryObjects` is true, `objectStorageOwner`; notifications name `durableIntentOwner`. Credential-bearing connectors/model routing set `credentialBearing: true`, and SCIM activates production secret custody. These are confirmed project facts, never generated placeholders.

Never invent owner, SLO, retention, residency, compliance or version values. Missing material facts remain validation errors or `NOT VERIFIED` evidence.

## Capability activation

Apply rules only when activated by declared intent or observed drift. Key implications:

- Flutter requires delegated OAuth/OIDC code with S256 PKCE and generated REST/OpenAPI client consumption.
- Agents require qualified EVE/Postgres World plus AgentRun.
- Owned agent admission requires pg-boss; shared admission requires an explicit qualified contract.
- Untrusted execution requires a sandbox and trusted capability broker.
- SCIM requires organization mapping and complete deprovisioning.
- Cloudflare/OpenNext plus owned agents/jobs requires external long-running Node/OCI placement.
- Removing a capability requires a cleanup/migration plan for durable data, credentials, queues and contracts.
- Production secrets activate OpenBao unless an explicit shared/external secrets contract is declared.

## Exceptions

Every project rule is waivable by the project owner. A valid exception declares an exact single rule, exact repository-relative evidence paths, project owner, rationale/decision, risks, compensating controls, verification, rollback/migration, review date or event, and acknowledgement of foundation deviation. `controls` is optional: an exception that omits it covers all controls under its single rule; one that declares control IDs suppresses only the controls it lists. Its contained ADR repeats the identity and decision.

Static exceptions match only when rule and exact evidence path match and, when `controls` is declared, the control ID also matches. Wildcards and directory-prefix suppression are forbidden. An exception that lists controls never suppresses a finding for a control it does not list, and no exception covers a second rule. Manual exceptions declare `verificationType: manual-qualification` and remain visibly accepted risk.

Outcome semantics:

| Outcome | Meaning | CI |
|---|---|---|
| `PASS` | recommendation satisfied | pass |
| `FAIL` | violation or invalid/expired/mismatched exception | fail |
| `EXCEPTED` | valid active project-owner accepted risk; recommendation remains unmet | pass |
| `NOT VERIFIED` | environment behavior not reproduced; reason/risk/owner/next action required | configurable warning |

The guardian may still state `GUARDIAN VERDICT: REJECT` when an accepted risk is unsafe. Foundation evolution changes the recommended baseline; project exceptions remain distinguishable and do not silently expire on source drift.

## Governance operations

- Evidence labels are optional; they are reserved for review and drift reports and never affect exception matching.
- Drift PRs from the automated source refresh are reviewed by whoever merges them; drift policy has no per-topic owners.
- Source staleness thresholds are a minimum of 14 days, aligned to the weekly automated refresh; shorter thresholds only produce false staleness between refreshes.
- Profiles pin the foundation version (currently `0.3.0`); it is decoupled from the installer npm package version, so installer upgrades never change a project's pinned foundation.
- `DUR-007`-style full qualification matrices are required before the first paying tenant, not before every merge; interim merges record `NOT VERIFIED` with reason, owner, and next action.
