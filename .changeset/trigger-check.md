---
"@vegastack/vegafactory": minor
---

skillify ships `scripts/trigger-check.mjs`, a deterministic family-level trigger guard that runs in `bun run check` as `validate:triggers`.

- Walks every skill's `tests/fixtures/trigger-queries.json` and blocks when two skills both claim one normalised query as `should_trigger: true` without a mutual `ambiguous_with`.
- Warns on fixture hygiene: neighbour names no skill here carries, one-sided references, missing or short fixtures; warnings fail only under `--strict`.
