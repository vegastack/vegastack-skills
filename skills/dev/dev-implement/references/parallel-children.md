# Parallel children

A parent issue whose plan declares [independent groups](../../dev-plan/references/plan-format.md) with disjoint file sets can run those children at the same time. The parent owns everything deterministic through `scripts/children.mjs`; the harnesses own only the running.

The safe default is sequential. Parallel is what a declared, validated, disjoint file set buys — nothing else unlocks it.

## The shape of a run

```
plan-lint --file <parent plan> --groups --json  →  groups.json
children.mjs plan   --parent <n> --groups groups.json --repo <o/r>   # dry-run preview + the ledger line
children.mjs launch --parent <n> --groups groups.json --repo <o/r> --harness claude|codex --write
children.mjs join   --parent <n> --groups groups.json --repo <o/r> --write
bun run check   (whatever dev.md's check command is) + the skill-scan guard   # ONCE, after the join
```

`plan-lint --groups` is the only parser of the group grammar; `children.mjs` consumes its JSON and never re-reads the markdown. Every verb is dry-run until `--write`, and `launch`, `join` and `remove` need `--repo` because a child's branch name comes from its real issue title — a guessed title is a branch the child never created.

## The two harness paths

- **Claude Code** — one `Workflow` call by name: the saved `implement-children` workflow (`assets/workflows/implement-children.js`, installed to `.claude/workflows/` by dev-setup on the operator's yes) pipelines one `agent()` per child with `isolation: "worktree"`, and returns `{ issue, status, branch, head, files, message }` per child. `children.mjs launch --harness claude` prints the exact call and its args. The workflow has no filesystem access, so it never joins anything.
- **Codex** — one `codex exec -C <child worktree>` per child, the argv coming straight from #114's launch table. `spawn_agent` takes no cwd, so an in-session agent would share the parent's writable root and could not write to a sibling worktree; separate processes are the isolation. Here the parent creates the child worktrees itself (`--write`).

**Correctness never rests on a harness setting.** Every child is told the parent's HEAD **sha** and branches from that sha explicitly. Claude's `worktree.baseRef: "head"` is belt-and-braces, not load-bearing.

## The fallback ladder

1. Workflows unavailable → spawn the same children as subagents with `isolation: "worktree"` and the same prompts.
2. No isolation available → run the children in plan order, and write the ledger line `- Parallel: no — <reason>; children run in plan order`.

`children.mjs plan` emits that line itself whenever it decides sequential — fewer than two groups carrying members is the ordinary reason.

## Caps

The effective concurrency is the smallest of the configured cap, `cpus - 2`, and the 16-agent workflow ceiling, which is a hard bound. The configured cap comes from `~/.vegastack/factory.json`: `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` on the Claude path, `agents.max_concurrent_threads_per_session` on Codex.

## The join

Children merge into the parent branch in plan order with `git merge --ff-only`: a child branched from the parent HEAD fast-forwards, and anything else means its base moved — which a merge commit would hide.

- A child is merged only when its result says `done` **and** its diff against its base sha stays inside its declared set.
- **A child that failed warns.** Its branch and its worktree are left in place, the parent continues with the others, and the run ends in a hand-back naming it.
- **A child that wandered blocks.** `child #<n> touched <path>, outside its declared set` — it is not merged, and the parent says so in the ledger and the evidence comment. The declared set is the contract that made the parallel run legal in the first place.

One verify after the join, not one per child.

## Who writes what

Each child posts its own ledger and its own evidence comment on its own issue. The parent's ledger carries only the join lines:

```
- Parallel: 2 children — join order #131, #132
- Join: #131 merged aaaaaaa
- Join: #132 not merged (touched packages/cli/src/dispatch.ts outside its declared set)
```

## Removal

`children.mjs remove` takes the child checkouts only, never a branch, and refuses a worktree that is dirty or unmerged. It is dry-run until `--write`, and removing anything waits for the operator's word.
