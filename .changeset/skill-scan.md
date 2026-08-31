---
"@vegastack/skills": minor
---

Projects that author agent skills can now have them scanned for vulnerabilities as part of the workflow, before anything is pushed.

- A new `skill-scan:` knob in `.vegastack/dev.md` names the directory holding the skills to scan; `none`, or no line at all, turns it off and the guard says it skipped rather than erroring.
- `dev-review` ships `scripts/skill-scan.mjs`, which runs [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) over each skill and blocks on any unsuppressed HIGH or CRITICAL finding — never on the aggregate risk score, which a skills repo distorts by documenting the very mechanics being scanned.
- `dev-implement` runs the guard at its Verify gate; `dev-review`'s Security axis triages what it surfaces into the normal review comment and fix loop, and treats every scanner hit as a candidate finding to trace, never a verdict.
- Suppressions live in a JSON SkillSpector baseline whose every rule needs a reason carrying a "Still flag if:" clause — enforced by the guard, not trusted, and applied to fingerprint entries too so an auto-generated baseline cannot silence everything at once.
- Baseline matchers must be **literal**: `*`, `?`, `[` and `]` are rejected. A single wildcard rule can silence every finding while the run still reports success, and rejecting wildcard spellings one at a time proved to be an arms race — naming the file is the only checkable form of "as narrow as its cause".
- The guard refuses anything it cannot verify, not just findings: an unreadable profile or report, a report shape it does not recognise, an unrecognised severity, a scan that inspected zero files or left files partly read, an analyzer that did not finish, a crash, a profile giving `skill-scan` conflicting values, and any directory holding a `SKILL.md` that discovery did not reach — nested too deep, dot-prefixed, or behind a symlink. An unscanned skill nobody mentions looks exactly like a clean one.
- Discovery reads two levels, so a grouped authored layout (`<root>/<group>/<skill>/`) scans instead of silently finding nothing.
- `dev-setup` detects skills in a repo and drafts the knob, the Verify bullet, and a blocking pre-publish guard.
- The scanner is contributor-installed; the guard refuses with the install command when it is missing rather than passing quietly, and it is deliberately not part of `bun run check`.
