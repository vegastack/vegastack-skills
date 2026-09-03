---
"@vegastack/vegafactory": minor
---

dev-setup now detects which agent harnesses are on the box and drafts a per-stage harness policy the rest of the workflow can read.

- Two new dev.md knobs: `harnesses:` records each harness and its version (or `absent`), and `harness-policy:` carries one `<stage> <agent> <model> <effort>` entry for each of the six stages — intake, plan, implement, review, status, chronicle.
- Only one harness on the box → dev-setup recommends `review: subagent` and says cross-agent is off until a second one exists; any harness the policy names but the box lacks is recorded in `## Environments` with the capability it gates.
- dev-review's cross-agent invocation takes the reviewing agent's model and effort from that policy's `review` entry, passing them as flags in the exec arg array.
- harness-facts.md gains the per-harness model, effort and concurrency controls (Claude Code's `--model`/`--effort` and the `CLAUDE_CODE_MAX_*` caps; Codex's `-c model=` / `-c model_reasoning_effort=` and `agents.max_concurrent_threads_per_session`) under three refresh sources, plus the reproducible `codex exec` skill-loading drill.
- The shipped `harness-policy:` defaults name Claude models by the alias Claude Code accepts (`fable`, `sonnet`); the bare `fable-5-1` / `sonnet-5` forms were refused as unrecognized by `claude --model`.
