# The loop ladder

How to build the red command, cheapest rung that reaches the bug first. The goal is always the same: symptom in, verdict out, seconds per run, no human.

1. **Failing test** at whatever seam reaches the bug — unit, integration, or e2e. First choice when the code path is importable.
2. **Curl / HTTP script** against a running dev server, asserting on status/body — for bugs that live in the request path.
3. **CLI invocation with a fixture input**, diffing stdout/exit code against known-good — for tools and scripts.
4. **Headless browser script** (Playwright or equivalent) driving the UI and asserting on DOM, console, or network — when the bug needs a real browser.
5. **Captured-trace replay** — save a real request/payload/event log once, replay it through the code path in isolation; turns "only happens with production data" into a loop.
6. **Throwaway harness** — boot the minimal slice of the system (one service, mocked deps) that exercises the path with a single call. Deleted in Phase 6.
7. **Property/fuzz loop** — for "sometimes wrong output": run hundreds of random inputs and trap the failure mode; the trapped case seeds the minimised repro.
8. **Bisection harness** — when the bug appeared between two known states (commit, dataset, version): automate "boot at state X, check, report" so `git bisect run` can drive it.

## Tightening

A loop earns its keep on three axes — make it **faster** (mock the slow dependency, cache the boot), **sharper** (assert the exact symptom, not a proxy), **more deterministic** (pin the clock, the seed, the ordering). A 30-second flaky loop is barely better than none; a 2-second deterministic one changes what's possible.

## When no rung works

That's a stop, not a license to guess: `handback` with the rungs tried, why each failed, and the specific artifact or access that would unlock one (a HAR of the failing request, server logs around the timestamp, a screen recording, an environment credential). The operator trades one artifact for a loop; nobody trades theories for luck.
