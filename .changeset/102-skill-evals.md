---
"@vegastack/vegafactory": minor
---

Every skill now carries agentskills.io eval cases, and skillify names `claude plugin eval` as the Claude-side runner beside the subagent procedure.

- `evals/evals.json` per skill (`skill_name`, `evals[] {id, prompt, expected_output, files[], assertions[]}`), unpackaged like `tests/`, written by the scaffolder as a placeholder, and warned on by `structure.mjs check` when missing or malformed.
- The eval playbook documents the case format, the runner invocation with its verified status on the build date, the subagent procedure that runs the same cases on every harness, and the `timing.json` / `grading.json` / `benchmark.json` result files.
- `**/evals/results/` and `*-workspace/` are gitignored; README tables carry the `evals/` row.
