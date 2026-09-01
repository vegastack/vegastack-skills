---
name: dev-review
description: Independent review of finished implementation work — a diff against its brief and plan — and the skill-scan vulnerability guard. Use when dev-implement's review step runs, when asked to "review this branch/diff/issue", "give this a second pair of eyes", "check the finished work on issue N", when a cross-agent session (Claude or Codex) is handed a REVIEW REQUEST, when review findings need a fix loop, re-review, or adjudication, or when asked to scan skills for vulnerabilities, triage scanner findings, or judge whether a third-party skill is safe to install. Not for reviewing an unbuilt plan (dev-plan's approval gate), architecture review (dev-architect), shipping gates (dev-ship), or generic PR review in repos outside this workflow.
---

# dev-review

Review is a specified system, not a vibe: fresh eyes per axis, severities with teeth, a bounded fix loop, and every dismissal on the record. The reviewer's job is findings or verified absence of findings — never praise. Formats follow `references/conventions.md`, the spec `dev-setup` authors and every dev-family skill ships a copy of; the reviewer briefs live in [dispatch-prompts](references/dispatch-prompts.md).

Nearest neighbors: `dev-implement` invokes this per dev.md's `review:` knob and applies the findings; `dev-ship` consumes the verdict marker; `dev-plan`'s approval gate reviews plans before build — this skill reviews built work after.

## Inputs — files, never pasted context

Build the review package first: `git log --oneline <base>..<head>` + `git diff --stat` + `git diff -U10`, written to `.vegastack/.tmp/<issue>-<slug>/review-<base7>..<head7>.diff`. Reviewers get paths — the brief (issue body), the plan comment, the package file, the project's `.vegastack/review-known-patterns.md` — plus the binding constraints copied verbatim. Reviewers write their full reports to `.tmp` files and return short status; a dead reviewer's findings survive on disk.

The guard provisions its own scanner: it locates the SkillSpector CLI through whatever channel installed it (uv, brew, pipx) and runs it by absolute path, so a working install is never reported as missing because `PATH` differs between the operator's shell and the agent's. dev.md's `skillspector-update:` knob decides the rest — `auto` (the default) installs it when absent and upgrades it before each scan, falling back to the installed copy on any failure; `notify` only reports what upstream published; `off` never touches the network. `--no-provision` forces one run to leave the machine alone. An upgrade that changes anything is reported before the findings, because after an upgrade a new finding is the tool having learned something, not the diff having broken something.

When dev.md names a `skill-scan:` root, the security dispatch also gets the scan report: `node <path-to-this-skill>/scripts/skill-scan.mjs --json > .vegastack/.tmp/<issue>-<slug>/skill-scan.json` (add `--llm` for the semantic pass — advisory only, never a gate; it is non-deterministic and a degraded run inflates scores). The same guard runs at `dev-implement`'s Verify gate, so by review time it has already passed; the axis is here to triage what sits below the blocking bar and to judge whether anything above it was suppressed rather than fixed.

## The axes — parallel, fresh, never merged

| Axis | Runs | Judges |
|---|---|---|
| **Spec** | always | the diff vs the CURRENT brief + plan: missing, scope creep, implemented-but-wrong — quoting the brief line per finding; includes the tests-are-real rubric |
| **Standards** | always | project rules (known-patterns file + repo docs, which override) + the fixed smell baseline pasted in full into its prompt |
| **Security** | on `risky`, when touch points hit auth, money, user data, or external input, **or when the diff touches a skill under dev.md's `skill-scan:` root** | data-flow traces, exploitability before severity, and triage of the skill scan's findings — method in [security-axis](references/security-axis.md) |

Each axis is a fresh subagent with no memory of writing the code (its prompt: [dispatch-prompts](references/dispatch-prompts.md)). Axes report separately and are never re-ranked into one list — a change can pass one axis and fail another, and merging lets one mask the other.

**Never pre-judge.** A dispatch containing "do not flag…", "don't treat X as a defect", or "at most minor" is forbidden — if you believe something is a false positive, let the reviewer raise it and adjudicate it openly in the loop.

## The review comment — one per cycle, rounds appended, marker always current

One comment per review cycle. **The single marker at the top is edited every round** to the newest `round`/`sha`/`verdict` — consumers (ship-gate) read the first marker, so a stale round-1 `needs-fixes` must never sit above a clean round 3. Prior rounds stay as plain `## Review — round <n>` sections appended below, carrying no markers of their own.

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
- The skill scan's suppressions follow the same discipline in its own baseline file, and the guard enforces the clause rather than trusting it — a rule scoped `id:` with no `path:` is a repo-wide blind spot. A finding suppressed rather than fixed is a review finding, not a settled matter.

## A scan with no issue attached

A scan run outside an issue — a standalone check, or the pre-publish guard in dev.md's `## Ship` — has no review comment to land in, and never gets attached to an unrelated issue. Findings there route to `dev-intake`: offer the operator one `risky` issue whose **brief body** carries the findings, their locations, and what is already known about each cause. That is intake's job, with its questions, its scope call, and its approval — not a comment posted somewhere convenient.

## Cross-agent — the independence upgrade

The dev.md `review:` knob maps to exactly three states — `subagent` (fresh-subagent axes always, cross-agent never), `cross-agent-risky` (subagent axes normally; the other agent on `risky` — the recommended default where the CLI exists), `cross-agent` (the other agent always). When it runs on the other agent, follow [cross-agent](references/cross-agent.md): announce the invocation to the operator at trigger time, send the `REVIEW REQUEST (vsk cross-agent v1)` handoff (`codex exec` from Claude; `claude -p` from Codex), and summarize the outcome at the end. The reviewing agent posts its own review comment (`agent=codex`), so independence is verifiable. CLI absent → fall back to the manual relay and note that dev-setup recommends installing it.

## Closing

End with the plain-language summary: verdict, what was found and fixed, what was adjudicated and why, and what's worth the operator double-checking.
