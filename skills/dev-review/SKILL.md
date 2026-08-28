---
name: dev-review
description: Independent review of finished implementation work — a diff against its brief and plan. Use when dev-implement's review step runs, when asked to "review this branch/diff/issue", "give this a second pair of eyes", "check the finished work on issue N", when a cross-agent session (Claude or Codex) is handed a REVIEW REQUEST, or when review findings need a fix loop, re-review, or adjudication. Not for reviewing an unbuilt plan (dev-plan's approval gate), architecture review (dev-architect), shipping gates (dev-ship), or generic PR review in repos outside this workflow.
---

# dev-review

Review is a specified system, not a vibe: fresh eyes per axis, severities with teeth, a bounded fix loop, and every dismissal on the record. The reviewer's job is findings or verified absence of findings — never praise. Formats follow the `dev-setup` skill's `references/conventions.md`; the reviewer briefs live in [dispatch-prompts](references/dispatch-prompts.md).

Nearest neighbors: `dev-implement` invokes this per dev.md's `review:` knob and applies the findings; `dev-ship` consumes the verdict marker; `dev-plan`'s approval gate reviews plans before build — this skill reviews built work after.

## Inputs — files, never pasted context

Build the review package first: `git log --oneline <base>..<head>` + `git diff --stat` + `git diff -U10`, written to `.vegastack/.tmp/<issue>-<slug>/review-<base7>..<head7>.diff`. Reviewers get paths — the brief (issue body), the plan comment, the package file, the project's `.vegastack/review-known-patterns.md` — plus the binding constraints copied verbatim. Reviewers write their full reports to `.tmp` files and return short status; a dead reviewer's findings survive on disk.

## The axes — parallel, fresh, never merged

| Axis | Runs | Judges |
|---|---|---|
| **Spec** | always | the diff vs the CURRENT brief + plan: missing, scope creep, implemented-but-wrong — quoting the brief line per finding; includes the tests-are-real rubric |
| **Standards** | always | project rules (known-patterns file + repo docs, which override) + the fixed smell baseline pasted in full into its prompt |
| **Security** | on `risky`, or when touch points hit auth, money, user data, or external input | data-flow traces, exploitability before severity — method in [security-axis](references/security-axis.md) |

Each axis is a fresh subagent with no memory of writing the code (its prompt: [dispatch-prompts](references/dispatch-prompts.md)). Axes report separately and are never re-ranked into one list — a change can pass one axis and fail another, and merging lets one mask the other.

**Never pre-judge.** A dispatch containing "do not flag…", "don't treat X as a defect", or "at most minor" is forbidden — if you believe something is a false positive, let the reviewer raise it and adjudicate it openly in the loop.

## The review comment — one per cycle, rounds appended

```markdown
<!-- vsk:v1 type=review round=<n> sha=<head7> agent=<claude|codex> verdict=<clean|needs-fixes> -->
## Review — round <n> @ <sha7>

**Verdict: <clean|needs-fixes>** — spec: <counts> · standards: <counts> · security: <counts | n/a (no surface)>

### <Axis> axis
**Finding [N]: <title>** — **[SEVERITY]** (confidence: high|medium|low) `path/file.ts:42`
<issue> / <why it matters> / <fix, fenced snippet> / <quoted brief line, spec axis>

<details><summary>Nitpicks and low-confidence (N) — non-blocking</summary>…</details>

Reviewed: <sha7> · axes: <list> · reviewer: <mode>
```

Severities: `[CRITICAL]` (security axis: exploitable now — blocks) > `[MUST-FIX]` (wrong, broken, or contradicts the brief — blocks) > `[SHOULD-FIX]` (convention or quality, does not block) > `[NIT]`. Finding IDs are `Finding [N]` — never `#N`, which GitHub auto-links. Low-confidence findings and nitpicks go in the collapsed block, never the main list. Group one recurring defect across files into one finding with a location list.

## The loop — 3 rounds max, then open adjudication

`[CRITICAL]` and `[MUST-FIX]` findings enter the loop; `[SHOULD-FIX]`/`[NIT]` are fixed opportunistically or recorded as deferred minors — they never extend it.

- **Rounds 1–2:** resume (or redispatch) the implementer with the open findings verbatim and the report-file path. It fixes, re-runs the covering tests, appends its fix report to the same file.
- **Round 3:** a fresh implementer — "a prior implementer attempted this; read the report file for what was tried." A loop surviving two resumes usually means the implementer can't see its own problem.
- **Every round:** the re-review is scoped to the fix diff (`FIX_BASE..HEAD`, a new package file); the re-reviewer verdicts each finding **ADDRESSED / NOT ADDRESSED** ("attempted" is not addressed), and new breakage in the fix diff joins the open list. Out-of-scope observations become deferred minors.
- **At the cap:** adjudicate each open finding yourself, openly — parked with a ruling ("why the code stands"), or fixed forward — every adjudication lands in the evidence comment's Review line and the ledger. Adjudicating early to end a loop is pre-judging with a different name.

## Noise controls — hard filters, not politeness

- Default quiet profile: spec, bugs, and security always; style only where a documented rule exists. The comment count is the noise metric.
- `.vegastack/review-known-patterns.md` (seed: [template](assets/review-known-patterns.md.template)) holds the project's never-flag patterns — each entry REQUIRES a **"Still flag if:"** exception clause; a suppression without one is a blind spot. Operator dismissals of findings get appended there by dev-implement's corrections loop, so a dismissed pattern stays dismissed.

## Cross-agent — the independence upgrade

On `risky` (or `review: cross-agent` in dev.md), the review runs on the other agent per [cross-agent](references/cross-agent.md): announce the invocation to the operator at trigger time, send the `REVIEW REQUEST (vsk cross-agent v1)` handoff (`codex exec` from Claude; `claude -p` from Codex), and summarize the outcome at the end. The reviewing agent posts its own review comment (`agent=codex`), so independence is verifiable. CLI absent → fall back to the manual relay and note that dev-setup recommends installing it.

## Closing

End with the plain-language summary: verdict, what was found and fixed, what was adjudicated and why, and what's worth the operator double-checking.
