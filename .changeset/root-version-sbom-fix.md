---
"@vegastack/skills": patch
---

Restore a pinned `0.0.0` placeholder version on the workspace root: `npm sbom` purl generation requires every package to carry a version, so the 0.9.0 release pipeline failed at the SBOM step (after a successful npm publish — 0.9.0 has no GitHub release/SBOM as a result). The stack playbook's npm guidance now says to pin `0.0.0` instead of deleting the field. No package content changes.
