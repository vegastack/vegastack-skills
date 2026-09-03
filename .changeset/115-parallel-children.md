---
"@vegastack/vegafactory": minor
---

A parent issue can now run its independent children at the same time, each in its own worktree, and join them back in plan order.

- dev-plan's plan format gains an optional `**Independent groups:**` block — one line per child or task group with an explicit file set — and `plan-lint` blocks a group with no file set, an overlapping set, a repeated id, a member in two groups, and a line outside the grammar.
- `plan-lint --groups --json` prints the validated groups, so the grammar has exactly one parser in the family.
- New `dev-implement/scripts/children.mjs`: `plan | launch | join | remove` over that JSON — parallel-or-sequential with its reason, the concurrency cap, child branch and worktree names, the per-harness launch shape, the declared-file-set scope check and the fast-forward join. Dry-run until `--write`.
- Child worktrees branch from the parent's HEAD **sha**, never a ref: `worktree.mjs create --base <sha>` and the new `childWorktreePlan` refuse anything that could move under a parallel run.
- New saved workflow `assets/workflows/implement-children.js` runs one agent per child with `isolation: "worktree"`; dev-setup offers to install it to `.claude/workflows/` on the operator's yes. On Codex each child is one `codex exec -C <worktree>`, because `spawn_agent` takes no cwd.
- `vegafactory dispatch` launches one parent run instead of one run per child when two or more ready, unassigned children each sit in a group of their own.
- A child that fails keeps its branch and worktree and is reported; a child whose diff leaves its declared set is not merged at all.
