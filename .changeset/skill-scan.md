---
"@vegastack/skills": minor
---

Projects that author agent skills can now have them scanned for vulnerabilities as part of the workflow, before anything is pushed.

- A new `skill-scan:` knob in `.vegastack/dev.md` names the directory holding the skills to scan; `none`, or no line at all, turns it off and the guard says it skipped rather than erroring.
- `dev-review` ships `scripts/skill-scan.mjs`, which runs [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) over each skill and blocks on any unsuppressed HIGH or CRITICAL finding — never on the aggregate risk score, which a skills repo distorts by documenting the very mechanics being scanned.
- `dev-implement` runs the guard at its Verify gate; `dev-review`'s Security axis triages what it surfaces into the normal review comment and fix loop, and treats every scanner hit as a candidate finding to trace, never a verdict.
- Suppressions live in a JSON SkillSpector baseline whose every rule needs a reason carrying a "Still flag if:" clause — enforced by the guard, not trusted, and applied to fingerprint entries too so an auto-generated baseline cannot silence everything at once.
- `dev-setup` detects skills in a repo and drafts the knob, the Verify bullet, and a blocking pre-publish guard.
- The scanner is contributor-installed; the guard refuses with the install command when it is missing rather than passing quietly, and it is deliberately not part of `bun run check`.
