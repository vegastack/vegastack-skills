# Agent product

Apply this reference only when the `agents` capability is enabled or agent authoring/execution is observed.

## Authoring and publication

- **AGENT-001 — Immutable publication.** Instructions, model policy, tools, skills, connections, channels, schedules, memory, knowledge, structured output, approvals, and evals MAY change in a draft. Publishing **MUST** compile a normalized immutable version.
- **AGENT-002 — Version-pinned execution.** Every run and conversation **MUST** pin the published agent version, policy version, tool schemas, model policy, knowledge policy, and EVE/Workflow protocol family. Draft edits **MUST NOT** mutate in-flight work.
- **AGENT-003 — Deterministic compiler.** Compilation **MUST** use canonical ordering, explicit defaults, a schema version, and source digest; identical inputs must produce byte-identical output. Compilation **MUST NOT** resolve plaintext secrets.
- **AGENT-004 — Risk-based publication.** Publishing **MUST** gate schema compatibility, secret references, permissions, capability escalation, external tools, EVE compatibility, eval regressions, output schemas, approval coverage, egress, quota, and migration impact.

| Draft concern | Published output | Required gate |
|---|---|---|
| instructions and model policy | normalized prompt and route | schema and data-class policy |
| tools, skills, connections | typed capabilities and scopes | risk, secret reference, approval |
| schedules and channels | admission triggers | tenant, dedupe, timezone, owner |
| output contract | versioned JSON Schema | conformance evaluation |
| memory and knowledge | provenance and retention policy | tenant and data-class validation |

Use the lifecycle `draft → preview → publish → production → rollback`. There is no separate staging state. Risk-increasing changes require review; a low-risk text change MAY use policy-approved automation. Rollback activates an earlier immutable version and never rewrites history.

Support private and workspace sharing plus versioned templates. Template copies retain provenance but become independent drafts. Public marketplace moderation, discovery, and billing remain out of scope.
