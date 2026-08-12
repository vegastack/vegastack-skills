# Freshness contract — architect

Most of this skill is durable taste and recorded decisions; it does not go stale on its
own. Exactly one file decays with the platform landscape: `references/pinned-facts.md`
(plus the version claims embedded in `references/stack.md` and `references/mobile.md`).

## Mechanism

1. **Weekly scheduled agent (primary).** A scheduled Claude Code/Codex job re-verifies
   each pinned fact against its stated source URL and opens ONE pull request quoting
   evidence for anything that changed (fact text, version, date, source). The diffing
   judgment lives in the agent run, not in maintained scripts. The PR is human-reviewed —
   never auto-merged.
2. **Refresh-on-use (safety net, written into SKILL.md).** When a recommendation leans on
   a pinned fact older than 60 days, the consuming agent re-verifies that one fact first
   and says so. Never bulk-refresh in-session.
3. **Registry baseline (`sources.json`).** The repo-shared refresh runner
   (`tooling/refresh/refresh-evidence.mjs`) keeps checksum baselines for the critical
   source pages so CI can detect upstream drift deterministically between weekly runs.

## Rules

- Critical sources (Hyperdrive supported versions, Better Auth docs, eve/Workflow SDK
  deploy constraints) get `critical: true` — drift there warrants a prompt PR, not a
  batch.
- Every edited fact keeps the pattern: fact → why it changes a decision → source URL →
  verified date. The file carries one blanket verified-date for facts checked together;
  a fact re-verified alone gets its own inline date, superseding the blanket one.
- A fact that stops being decision-changing is deleted, not kept for completeness.
