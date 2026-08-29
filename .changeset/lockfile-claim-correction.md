---
"@vegastack/skills": patch
---

The release runbook's claim about the post-version install is corrected: it carries dependency changes into the lockfile, it does not re-pin the workspace's own version there.

- dev-setup's npm playbook drafts the corrected step into every bootstrapped project.
- Its version-identity note now says a lockfile's older workspace pin is not a defect, and hand-editing it is never the move.
- skill-maintainer's release ops carries the verified behavior (bun 1.3.10, 29-08-2026).
