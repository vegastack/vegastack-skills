# Behavioral eval playbook

How to prove a skill actually improves agent behavior before tests cement it. This is a procedure you execute with your own subagents (Task tool or equivalent) — never a custom eval harness, script, or viewer. If you find yourself writing eval tooling, stop; write instructions instead.

## Why eval before tests

Tests lock in behavior. If the behavior is mediocre, tests lock in mediocrity. The eval proves the quality bar first; only then do unit tests cement the proven-good behavior. The corollary: if you didn't watch an agent fail *without* the skill, you don't know the skill teaches anything.

## Method: with-skill vs baseline

1. **Pick 2–3 realistic prompts.** The kind of thing a user would actually type — concrete, with file paths and context, exercising the skill's hardest documented use case, not its happy path. Reuse the strongest entries from `tests/fixtures/trigger-queries.json` where they fit.
2. **Launch both runs per prompt in the same turn.** One subagent instructed to read and follow the new SKILL.md at its path; one baseline subagent given the identical prompt with no mention of the skill. (When improving an existing skill, the baseline is a snapshot of the old version instead.) Same-turn launch keeps the comparison honest and fast.
3. **Capture outputs to a scratch workspace** (never committed): `<scratch>/eval/<prompt-id>/{with_skill,baseline}/`.
4. **Compare against the skill's claimed value**, reading transcripts, not just final outputs.

## Pass criteria

The with-skill run must be *materially* better on the dimensions the skill exists for:

- Output has the contract shape the skill defines (sections, verdicts, file layout) where the baseline's does not.
- The with-skill agent uses bundled scripts/templates instead of reinventing them; note any helper both runs wrote independently — that helper should become a bundled script.
- No contract violations the checklist would catch (frontmatter keys, name grammar, missing pieces).
- The transcript shows the skill's guidance being *used*, not just loaded — sections nobody used are bloat to cut.

**Failure that matters most:** the baseline matches the with-skill output. Then the skill is not earning its tokens — cut it, narrow it, or fold it into a reference.

## Trigger-query eval (description level)

The body eval above assumes the skill got loaded. Separately check the description triggers correctly: walk `tests/fixtures/trigger-queries.json` and judge, for each query, whether an agent seeing only the skill list (name + description) would load this skill. Near-miss negatives are the valuable half — a description that survives them draws a real boundary. Fix failures by editing the *description* (triggers, boundary clause), never by stuffing workflow summary into it.

## Cycle protocol (at most 3)

```
CYCLE 1: run evals → list concrete improvements → apply them to the skill files
CYCLE 2: re-run the SAME prompts → compare before/after → apply what remains
CYCLE 3: re-run → pass, or ship with KNOWN_GAPS
```

Hard stop after 3 cycles. Endless polishing is worse than an honest gap list. Generalize from feedback — fix the pattern that caused the failure, don't overfit wording to one prompt.

## KNOWN_GAPS format

Ships at the bottom of the skill's README.md when the eval did not fully pass:

```markdown
## KNOWN_GAPS

- gap: baseline-quality section ordering under multi-file inputs
  evidence: eval cycle 3, prompt "draft release notes for the 0.4 tag"
  why unresolved: would require restructuring the routing table
  next: revisit when references/format.md is split by artifact type
```

One entry per gap: `gap` / `evidence` (cycle + prompt) / `why unresolved` / `next`. The eval summary itself (prompts used, cycles run, verdict per prompt) goes in the PR body, not the repo.

## Model guidance

<!-- volatile: everything in this section decays; keep model facts out of SKILL.md and update here only. -->

- Run both arms of every comparison on the **same model** — otherwise you measure the model gap, not the skill.
- Use the model that will actually run the skill in production (typically the one powering the current session); a weaker grader cannot judge a stronger writer.
- If a separate grading pass is used, grade blind: give the grader both outputs unlabeled and ask which better satisfies the skill's stated contract.
