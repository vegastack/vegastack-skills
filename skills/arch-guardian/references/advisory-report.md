# Advisory report contract

The advisory report is the guardian's review output. It is produced by the agent (not a checker script), is consumable by humans and by automation (a ship skill may parse the JSON block), and carries no gating semantics: findings inform decisions, the team decides.

## Severities

| Severity | Meaning |
|---|---|
| `critical` | security, correctness, or data-loss defect — fix now at any tier |
| `production-gate` | must be addressed before or at production tier |
| `enterprise-gate` | required only at enterprise tier |
| `consider` | improvement; explicitly optional |

A finding's severity comes from the violated rule's tier floor relative to the project's declared tier: a rule at or below the current tier that is violated is `critical` when it is a security/correctness invariant, otherwise it reports at its own tier gate. Rules above the current tier report as that tier's gate, never as failures.

## Evidence discipline

These rules are hard requirements; they exist to make false positives structurally difficult.

1. Every finding cites concrete evidence: `file:line`, a config key, a schema statement, or a fetched source URL. A claim without evidence is a **question**, listed separately — never a finding.
2. Every finding names the principle or rule ID it derives from, so "why does this apply to me" is always answerable from the report.
3. Detection is never a claim of absence. "No RLS statements found in `db/`" is a question unless every schema/migration file was actually read.
4. Behavior that cannot be verified in context (runtime, provider, recovery) is listed under `notVerified` with a reason and a suggested verification — never asserted either way.
5. Repeated identical findings are capped with a count; a report is a decision aid, not a wall of noise.
6. Grades summarize, they do not gate: `sound` / `attention` / `at-risk` per reviewed area, plus a one-line overall assessment. There is no REJECT vocabulary; a deliberate, recorded team decision the guardian disagrees with is reported as `accepted risk — guardian recommends revisiting`, with the reason.

## Report shape

Markdown for humans, ending with one fenced `json` block for automation:

```json
{
  "schemaVersion": 1,
  "project": "name",
  "tier": "production",
  "overall": "one-line assessment",
  "grades": { "identity": "sound", "tenancy": "attention" },
  "findings": [
    {
      "severity": "production-gate",
      "principle": "TEN-002",
      "summary": "one-sentence defect statement",
      "evidence": ["db/001-tenant.sql:14"],
      "suggestedAction": "what to change"
    }
  ],
  "questions": ["things the review could not determine from evidence"],
  "notVerified": [{ "claim": "PITR restore works", "reason": "not executed", "verify": "run a restore drill" }]
}
```

## Evidence recipes

Deterministic searches worth running during a review (read the hits before citing them — a match is a lead, not a finding):

- **Tenant tables without RLS**: for each `CREATE TABLE` with a `workspace_id` column, confirm matching `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` statements exist, and that policies do not reduce to `USING (true)`.
- **Composite tenant keys**: tenant-owned unique/foreign keys should include `workspace_id`; a bare `id` uniqueness on a tenant table is a lead for TEN-001.
- **Plaintext secrets**: search tracked files for private key blocks, `Authorization: Bearer` literals, and provider key prefixes; check `.env*` files are gitignored and `.env.local` stays local-only.
- **Session-state tenancy**: `SET (?!LOCAL)` / `set_config(..., false)` in SQL near tenant context is a lead for TEN-003 (context must be transaction-local).
- **Runtime placement**: EVE/`@workflow/*` or `pg-boss` imports inside a web bundle or OpenNext worker source root are leads for RUN-001/RUN-002.
- **Cookie/CSRF posture**: auth configuration disabling secure cookies, CSRF, or origin checks is a lead for AUTH-003.
- **Sandbox egress**: sandbox configuration without an explicit allowlist (deny-by-default) is a lead for SBX-003.
- **Unpinned models**: `latest` or alias model identifiers in production routes are leads for MLIFE-001.

Respect `.guardianignore` (path prefixes, one per line) when the project provides one, and say in the report which paths were excluded or skipped.
