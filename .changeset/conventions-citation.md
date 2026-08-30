---
"@vegastack/skills": patch
---

Every dev-family skill now cites `references/conventions.md` from its own SKILL.md, in one shape, and the register-line format is stated in one place instead of three.

- dev-architect, dev-ship, dev-chronicle, and dev-debug shipped the packaged copy with no pointer to it from the agent entry point.
- dev-architect, dev-ship, and dev-setup each spelled out their own variant of the register line; all three now point at conventions' Operator identity section.
- dev-plan restated the approval marker and operator-identity format for an artifact it does not own, and told the reader to find the file "wherever dev-setup is installed" — wrong on a standalone install, which ships its own copy.
- All ten citations now name the path the copy actually occupies, so they resolve on a single-skill install.
