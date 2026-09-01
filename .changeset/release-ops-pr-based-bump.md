---
"@vegastack/skills": patch
---

`skill-maintainer`'s release-ops reflects a branch-protected default branch: the version bump lands by PR, not by direct push.

- The release flow's bump step commits on a `chore/release-<version>` branch and opens its PR; merging it is the operator's word, and the tag goes on the merged commit.
- Rollback reverts through a PR too — protection applies to reverts, and a rollback is when that discipline matters most.
