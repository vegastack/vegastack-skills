---
"@vegastack/skills": minor
---

New dev-review skill: independent review as a specified system. Parallel fresh-context reviewers per axis — spec (diff vs the current brief/plan, with a tests-are-real rubric), standards (project known-patterns + repo docs overriding a fixed 12-smell baseline), security (data-flow-traced, on risky work or security surfaces) — reported separately, never merged. One review comment per cycle with verdict, `Finding [N]` ids, CRITICAL/MUST-FIX/SHOULD-FIX/NIT severities, collapsed nitpicks, and a reviewed-SHA stamp. Bounded fix loop (3 rounds, scoped re-reviews, fresh implementer on round 3) ending in open adjudication; never-pre-judge rule; hard noise filters via a per-project review-known-patterns file whose entries require "Still flag if:" clauses; announced Codex↔Claude cross-agent mode with a defined REVIEW REQUEST handoff. dev-implement's review step now invokes this skill.
