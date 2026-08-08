# Deployment review: release/profile

Delete checklist items for absent capabilities; absence is not a failed control.

## Artifact identity

- Commit:
- OCI/image/package digests:
- SBOM/provenance/signatures:
- Database migration:
- Architecture profile digest:

## Placement

Verify each enabled owned deployable and each shared/external contract against the selected profile. For Cloudflare/OpenNext, verify owned EVE/jobs stay in external long-running Node/OCI placement.

## Safety gates

- [ ] Backward-compatible API/events and expand/contract migration
- [ ] Applicable runtime/protocol families are exact and atomically qualified
- [ ] Applicable tenancy/authz paths are cache-safe and negatively tested
- [ ] Applicable sandbox/connector/secret boundaries are qualified
- [ ] Applicable backup/restore evidence is within confirmed RPO/RTO
- [ ] Rollout, health, rollback, and incident ownership are explicit
