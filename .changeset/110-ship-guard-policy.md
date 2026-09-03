---
'@vegastack/vegafactory': minor
'@vegastack/vegafactory-dashboard': minor
---

The ship guard no longer reads `.vegastack/dev.md` and no longer matches the raw command text.

- Its only policy is `~/.vegastack/guard/<owner>__<repo>.json`, keyed by the checkout's origin remote and compiled from dev.md by dev-setup on your yes or by the new `vegafactory guard sync [--check]` — outside every worktree, so a run under bypassed permissions cannot edit its own profile into permission. With the file missing, stale-for-another-repo or malformed, every guarded command asks and names the sync command; `--check` exits 2 when the file is stale, and the SessionStart hook says so. Run `vegafactory guard sync` once per repo after upgrading.
- Commands are read as a shell reads them — quotes, escapes, `;` `&&` `||` `|` `&`, subshells, `$(…)`, `sh -c` — wrappers, paths and git/gh global options resolved, then matched on the argv: every refspec spelling of a push to the default branch (`HEAD:main`, `refs/heads/main`, `main:main`, `+main`), force, delete and `--no-verify` flags in any position, `--tags`, `gh api` on a merge URL, and text handed to another interpreter. The reviewer's nineteen bypasses are now test cases.
- A `## Ship` `ask:` step guards a command only when the step names it in backticks; a prose step is a runbook instruction, not a pattern.
- The dispatcher refuses a repo whose compiled policy is missing, and the headless prompt fences the issue's title and outcome as data.
- Contract change: the hook's `--check` mode takes `--policy PATH` and `--repo owner/repo` instead of `--dev-md`.
