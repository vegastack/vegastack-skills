# ADR-NNN: Decision title

- Status: proposed | accepted | superseded | rejected
- Date: YYYY-MM-DD
- Project-Owner: accountable person
- Scope-Paths: comma-separated exact repository-relative paths
- Rule-ID: canonical rule identifier or `none`
- Control-IDs: comma-separated exact checker/manual control IDs, or `all` for a rule-level exception that omits the profile controls list
- Exception-ID: profile exception ID or `none`
- Foundation-Deviation-Acknowledged: true | false
- Review-Date: YYYY-MM-DD | none
- Review-Event: concrete event | none

## Context and facts

Separate observed facts, constraints, assumptions, preferences and prior accepted decisions. Identify current, target and migration states.

## Decision and rationale

State the primary decision, ownership, boundaries and why it fits. State the rejected alternative and reason.

## Risks and accepted deviation

Describe each risk, who accepts it, affected paths/tenants/data, and why the foundation recommendation remains unmet.

## Compensating controls

Map preventive, detective and recovery controls to each risk. Do not claim an untested control works.

## Verification

List static sentinels, declared controls, reproduced tests, and `NOT VERIFIED` environment behavior with reason, risk, owner and next action.

## Rollback or migration

Describe rollback, migration/exit behavior, compatibility window, irreversible steps and cleanup.

## Review trigger

Give an expiry date or concrete event. Missing, expired or malformed exception ADRs fail validation.
