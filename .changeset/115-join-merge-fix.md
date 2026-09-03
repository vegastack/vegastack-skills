---
"@vegastack/vegafactory": patch
---

The parallel-children join now lands every child, not just the first, and the plan linter refuses a group it could never run.

- `mergeArgs(child, index)` fast-forwards only the first child — whose base *is* the parent HEAD, so a refusal there proves the parent moved — and merges every child behind it with `--no-ff --no-edit`. All children branch from the same commit, so the first merge advances the parent and every later child stops being a descendant; `--ff-only` for all of them landed one child and refused the rest. A merge that fails is aborted and the join stops rather than guessing past a conflict.
- `plan-lint` blocks an independent group that declares a file nearly every change edits — `bun.lock`, `package.json`, `packages/cli/packaging.json`, `.vegastack/dev.md`, `.vegastack/chronicle.md`, `.vegastack/skillspector-baseline.json`, or any README — so a plan that cannot run in parallel says so while it is being written instead of at the join.
- `references/parallel-children.md` documents how a half-done join resumes: the unmerged child keeps its branch and worktree, nothing merged is rebased, and the next session runs that child alone against the advanced tip.
