# Decision register

One dated line per directional decision (see `## Decisions` in dev.md for what qualifies); append-only. Format: `- DD-MM-YYYY operator (github-username) — the decision`. (Entries before 28-08-2026 use the older `(github-username)` form; the register is never rewritten.)

- 27-08-2026 (kmanojkumar) — Adopted the dev workflow skills for this repo itself (dev.md handbook, operator labels, Ship runbook = the changesets release flow).
- 28-08-2026 (kmanojkumar) — .vegastack/dev.md is each project's single canonical process doc: policy docs fold into it as Ship bullets, the decision register lives beside it at .vegastack/decisions.md, and every rule that can be a deterministic check becomes a guard (local first, CI backstop).
- 28-08-2026 (kmanojkumar) — Dev-skills v2 profile-format changes ship as a minor release: pre-1.0, zero deployed consumers, and the only existing profile (this repo's) is rewritten in the same release.
- 28-08-2026 (kmanojkumar) — architect → dev-architect; arch.md folded into dev.md as ## Architecture; ADRs retired — decisions.md is the only decision record.
- 28-08-2026 (kmanojkumar) — Renaming a skill ships minor by default; major only on the operator's explicit call (removal stays major).
- 30-08-2026 (kmanojkumar) — Authored skills may be grouped one level deep under skills/<group>/ with a GROUP.md; packaging keys and the published bundle stay flat, so install commands never carry a group.
- 31-08-2026 (kmanojkumar) — Skill scanning is a first-class workflow stage: a deterministic SkillSpector guard at the Verify gate blocking on unsuppressed HIGH/CRITICAL findings (never on the aggregate score), triaged by dev-review's Security axis, with suppressions as a justified, reviewed baseline whose matchers are literal.
