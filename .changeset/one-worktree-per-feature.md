---
"@vegastack/vegafactory": minor
---

Every branch now lives in its own worktree under `.vegastack/.worktrees/<n>-<slug>/`, and `vegafactory worktree` manages their whole lifecycle.

- New `vegafactory worktree list|status|create|restore|remove|prune`. `remove` and `prune` are dry-run until `--write`; `create` and `restore` write by default. `worktree` is no longer a reserved verb.
- The lifecycle is derived from git and GitHub on every read, never stored: `active`, `parked`, `merged`, `abandoned`, `orphan-dir`, `branch-only`.
- A worktree is removed only when it is clean, pushed, merged into the default branch and unlocked. `--force` lifts the not-merged check and nothing else — uncommitted, unpushed and locked work is never discarded. The local and remote branches are never touched.
- `prune` proposes only parked worktrees past `worktree-retention:` (default 14 days, measured from the later of the last commit and the last ledger edit), and pushes an unpushed candidate before removing it.
- Two new dev.md knobs, written by dev-setup: `worktree-include:` (gitignored files copied into each new worktree) and `worktree-retention:`. `commands:` gains a `setup` field that each new worktree replays, and dev-setup adds `.vegastack/.worktrees/` to the project `.gitignore`.
- `ship-gate.mjs` resolves the branch's worktree itself and runs its git calls, its dev.md read and the fresh check command there, so the old checkout-mismatch block no longer forces a branch switch in the main checkout. `--worktree <path>` overrides.
- dev-implement claims, resumes and corrects inside one worktree; dev-ship removes it after the merge. The scenario matrix, the lifecycle states and the safe-to-remove test live in dev-implement's `references/worktrees.md`.
