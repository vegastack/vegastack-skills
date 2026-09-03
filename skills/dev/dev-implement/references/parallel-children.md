# Parallel children

A parent issue whose plan declares independent groups (dev-plan's `references/plan-format.md`) with disjoint file sets can run those children at the same time. The parent owns everything deterministic through `scripts/children.mjs`; the harnesses own only the running.

The safe default is sequential. Parallel is what a declared, validated, disjoint file set buys — nothing else unlocks it.

## The shape of a run

```
plan-lint --file <parent plan> --groups --json  →  groups.json
children.mjs plan   --parent <n> --groups groups.json --repo <o/r>   # dry-run preview + the ledger line
children.mjs launch --parent <n> --groups groups.json --repo <o/r> --harness claude|codex --write
children.mjs join   --parent <n> --groups groups.json --repo <o/r> --results results.json --write   # results.json: what the children returned
bun run check   (whatever dev.md's check command is) + the skill-scan guard   # ONCE, after the join
```

`plan-lint --groups` is the only parser of the group grammar; `children.mjs` consumes its JSON and never re-reads the markdown. Every verb is dry-run until `--write`, and `launch`, `join` and `remove` need `--repo` because a child's branch name comes from its real issue title — a guessed title is a branch the child never created, so when that lookup fails those verbs block and only `plan` previews (with a warning). Each group carries one child; a group naming two is refused by plan-lint and by `plan` alike.

## The two harness paths

- **Claude Code** — one `Workflow` call by name: the saved `implement-children` workflow (`assets/workflows/implement-children.js`, installed to `.claude/workflows/` by dev-setup on the operator's yes) pipelines one `agent()` per child with `isolation: "worktree"`, and returns `{ issue, status, branch, head, files, message }` per child — save that array and hand it to `join --results`. `children.mjs launch --harness claude` prints the exact call and its args. The harness creates each child's worktree, so the prompt names that checkout rather than a path of the parent's; the workflow has no filesystem access, so it never joins anything.
- **Codex** — one `codex exec -C <child worktree>` per child, the argv coming straight from #114's launch table. `spawn_agent` takes no cwd, so an in-session agent would share the parent's writable root and could not write to a sibling worktree; separate processes are the isolation. Here the parent creates the child worktrees itself (`--write`).

**Correctness never rests on a harness setting.** Every child is told the parent's HEAD **sha** and branches from that sha explicitly. Claude's `worktree.baseRef: "head"` is belt-and-braces, not load-bearing.

## The fallback ladder

1. Workflows unavailable → spawn the same children as subagents with `isolation: "worktree"` and the same prompts.
2. No isolation available → run the children in plan order, and write the ledger line `- Parallel: no — <reason>; children run in plan order`.

`children.mjs plan` emits that line itself whenever it decides sequential — fewer than two groups carrying members is the ordinary reason.

## Caps

The effective concurrency is the smallest of the configured cap, `cpus - 2`, and the 16-agent workflow ceiling, which is a hard bound. The configured cap comes from `~/.vegastack/factory.json`: `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` on the Claude path, `agents.max_concurrent_threads_per_session` on Codex.

## The join

Children merge into the parent branch in plan order. The **first** child fast-forwards (`git merge --ff-only`): its base is the parent HEAD, so a refusal there means the parent moved under the run and the join stops. Every child behind it no longer descends from the advanced tip and takes an ordinary three-way merge (`git merge --no-ff --no-edit`) — safe because the declared sets are disjoint and the scope check has already refused anything that strayed. A merge that fails anyway is aborted, and the join stops there rather than guessing past a conflict.

- `--results <file.json|->` is the children's own return value — the workflow's per-child `{ issue, status, branch, head, files, message }`, saved as a JSON array — and the `branch` each child reports is the branch the join diffs and merges, so a branch the harness named is found rather than re-derived from the title. Without `--results` the join looks for each child's planned branch and treats a missing one as failed.
- A child is merged only when its result says `done` **and** its diff against its base sha stays inside its declared set. A `done` child whose diff cannot be read — its reported branch is missing, or its base is unreachable — is not merged and holds every merge: an unproved scope fails closed.
- `wrote` in the JSON reports whether the parent branch moved, not whether the run was clean: a join that landed one child and then blocked on another says `wrote: true`.
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

## When the join stops half-done

A join that stops leaves the parent with some children merged and at least one not. That is a legitimate resting state, not a broken one, and it resumes without rewriting anything:

- The unmerged child keeps its branch and its worktree; nothing already merged is rebased.
- The parent hands back naming the child and why — failed, wandered outside its set, or a merge that conflicted.
- The next session runs that child alone against the **advanced** parent tip, sequentially, and merges it there. A child that wandered gets its declared file set corrected in the plan first, because the set is the contract.

## Removal

`children.mjs remove` takes the child checkouts only, never a branch, and refuses a worktree that is dirty or unmerged. It is dry-run until `--write`, and removing anything waits for the operator's word.
