---
"@vegastack/skills": minor
---

skill-maintainer and skillify are sharpened against each other: skill-maintainer owns the standards and the repo and release operations, skillify owns the procedure and cites those standards instead of restating them.

- skill-maintainer's description is a calm "Use when working on this repository…" conditional with a "Not for" clause; operating rule 4 states the calm-description standard with its reason, rule 7 is worded positive, and rule 8 names `readme:sync --write` after a packaging change. The body is under 1,200 words: script-behaviour detail now points at the scripts' own dry-run and usage output, and the release workflow routes to dev.md's `## Ship` runbook instead of carrying a stale copy.
- skill-maintainer's rename line and content-versioning bullet now follow dev.md and release-ops.md: a skill rename is MINOR unless the operator declares MAJOR (the body previously said MAJOR, contradicting both).
- skillify's checklist item 1 adds "body ≤1,200 words, detail routed to references" and cites skill-maintainer's rules 2–6; the worked example and anti-patterns moved to `references/authoring.md`, which now cites skill-maintainer's Hard limits table instead of mirroring it; the eval playbook gains the colleague test and the remove-a-rule-before-rewriting-it rule.
- Both trigger fixtures carry mirrored near-miss negatives against the other skill; skill-maintainer gains its fixture.
- No normative rule is weakened: every rule that left one body is cited from its remaining home, and the hard limits are unchanged.
