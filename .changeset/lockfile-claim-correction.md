---
"@vegastack/skills": patch
---

The release runbook's claim about the post-version install is corrected: it carries dependency changes into the lockfile, it does not update the workspace's own recorded version there.

- dev-setup's npm playbook drafts the corrected step into every bootstrapped project.
- Its version-identity note is package-manager-neutral: npm re-records a version-only bump on the next install, bun does not, so an older recorded version is a behavior to confirm rather than a defect — and never a hand-edit.
- skill-maintainer's release ops records the observed bun behavior, including that `--frozen-lockfile` passes with the older record.
