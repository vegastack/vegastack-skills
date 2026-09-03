---
"@vegastack/vegafactory": minor
---

Every branch now lives in its own worktree under `.vegastack/.worktrees/<n>-<slug>/`, and `vegafactory worktree` manages their whole lifecycle.

- New `vegafactory worktree list|status|create|restore|remove|prune`. `remove` and `prune` are dry-run until `--write`; `create` and `restore` write by default. `worktree` is no longer a reserved verb.
- The lifecycle is derived from git and GitHub on every read, never stored: `active`, `parked`, `merged`, `abandoned`, `orphan-dir`, `branch-only`.
- A worktree is removed only when it is clean, pushed, merged into the default branch and unlocked. `remove` fetches the default branch first and counts a squash or rebase merge as merged by patch content, so the routine post-merge removal needs no `--force` under any `merge:` knob. `--force` lifts the not-merged check and nothing else — uncommitted, unpushed and locked work is never discarded. The local and remote branches are never touched.
- `prune` removes only parked worktrees past `worktree-retention:` (default 14 days, measured from the later of the last commit and the last ledger edit), pushing an unpushed candidate first; the window stands in for the not-merged check there, and dirty, unpushed or locked work still keeps its worktree.
- `create <issue>` and `restore <issue>` need no `--slug`: create names the worktree from the issue title (`<type>:` prefix as the branch type), restore from the branch that carries the number.
- Two new dev.md knobs, written by dev-setup: `worktree-include:` (gitignored files copied into each new worktree) and `worktree-retention:`. `commands:` gains a `setup` field that each new worktree replays, and dev-setup adds `.vegastack/.worktrees/` to the project `.gitignore`.
- `ship-gate.mjs` resolves the branch's worktree itself and runs its git calls, its dev.md read and the fresh check command there, so the old checkout-mismatch block no longer forces a branch switch in the main checkout. `--worktree <path>` overrides.
- dev-implement claims, resumes and corrects inside one worktree; dev-ship removes it after the merge. The scenario matrix, the lifecycle states and the safe-to-remove test live in dev-implement's `references/worktrees.md`.
