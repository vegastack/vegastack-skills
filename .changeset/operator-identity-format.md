---
"@vegastack/skills": patch
---

Operator identity drops the word "operator": every workflow artifact now names the operator as `(<github-username>)` alone.

- `conventions.md`'s `## Operator identity` is the one home for the rule; approval markers become `Approved by (<username>) on DD-MM-YYYY: "<their words>"` and register lines `- DD-MM-YYYY (<username>) — <decision>`.
- The revision marker follows: `per (<username>) correction`.
- `dev-chronicle`'s attribution line becomes `— approved by (<username>) · built by <agent> · branch <name>`.
- `dev-setup`'s profile template seeds new projects with the short register format, and `dev-review`'s known-patterns template uses it for dismissal attribution.
- Existing approval markers, chronicle entries and decision-register lines are append-only records and keep the form they were written in.
