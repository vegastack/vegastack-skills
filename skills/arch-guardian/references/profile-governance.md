# Profile and governance

The v4 profile is slim advisor memory — roughly a dozen lines of confirmed facts. `capabilities` is authoritative intent; repository detection is evidence for drift, never a reason to silently enable anything. Versions are read from lockfiles and manifests at advice time and are never duplicated into the profile.

| Field | Meaning |
|---|---|
| `project.tier` | `prototype` / `production` / `enterprise` — decides which concerns apply (see foundation) |
| `project.kind`, `tenancy` | confirmed project facts |
| `hosting` | production hosting target (`none` for a non-deployable package) |
| `capabilities` | enabled list: `web`, `flutter`, `agents`, `jobs`, `sandbox`, `connectors`, `knowledge`, `models`, `realtime`, `notifications`, `enterprise-identity` |
| `notes` | free-form confirmed facts and recorded deviations |

## Tier declaration

Choosing the tier is a deliberate product decision, not a guess: prototype means the team accepts that only irreversibles are guarded; production means real users depend on it; enterprise means compliance-grade posture. Raising the tier is a review event — the guardian re-reviews enabled capabilities against the new floor and reports the gap as `production-gate`/`enterprise-gate` findings, not failures.

## Capability activation

Apply rules only when a capability is enabled in the profile or observed in the repository, at or below the declared tier. Key implications:

- Flutter activates delegated OAuth/PKCE and generated-client rules.
- Agents activate durable-execution ownership rules; at prototype tier a simpler loop is acceptable with a named migration path (see durable execution).
- Untrusted execution activates the sandbox boundary.
- Shared-schema multi-tenancy activates `TEN-*` at every tier.
- Production secrets activate secret-custody guidance — the mechanism is tier- and trigger-dependent (see security and privacy), never automatically OpenBao.
- Removing a capability requires a cleanup/migration plan for durable data, credentials, queues, and contracts.

## Deviations

There is no exception or suppression machinery. When the team deliberately departs from a recommendation:

1. Record it — one line in `notes` for small departures; an ADR ([template](../assets/adr-template.md)) for consequential ones (owner, decision, revisit trigger).
2. The guardian keeps reporting it in reviews as `accepted risk — guardian recommends revisiting`, with the reason. Recording a decision makes it visible and deliberate; it never silences the advisor and nothing gates on it.

## Governance operations

- Drift PRs from the automated source refresh are reviewed by whoever merges them.
- Source staleness thresholds are a minimum of 14 days, aligned to the weekly automated refresh.
- Profiles may pin `foundationVersion` (currently `0.4.0`); it is decoupled from the installer npm package version, so installer upgrades never change a project's pinned foundation.
- Full qualification matrices (e.g. `DUR-007`) are required before the production tier, not before every merge; interim reviews record the gap under `notVerified`.
