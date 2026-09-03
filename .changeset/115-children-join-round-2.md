---
"@vegastack/vegafactory": patch
---

The parallel-children scripts fail closed where they guessed, and the join acts on what the children reported.

- `children.mjs join --results` now diffs and merges the `branch` each child reports, so a branch the harness named is found rather than re-derived from the issue title; a reported value that is not a branch name is refused before any git call. A `done` child whose diff cannot be read is not merged, is written up in the ledger as not merged, and holds every merge. `wrote` reports whether the parent branch moved, so a join that landed one child and then blocked on another no longer reports a write it made as no write.
- `launch`, `join` and `remove` block when the issue lookup behind `--repo` fails, instead of creating or looking for branches named from the issue number alone; `plan` still previews with a warning.
- A group naming two children is refused by `plan-lint` and by `children.mjs plan`: they would run at the same time on one file set, and a parallel group carries one child.
- The Claude launch prompt names the harness-created worktree as the child's checkout, not a path nothing created.
