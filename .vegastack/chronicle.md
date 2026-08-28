# Chronicle — vegastack-skills

The project's story, newest first: what got built, why, and how it went — for the operator's future recall. Format home: the dev-chronicle skill (lands with issue #17 of the v3 epic; entries before it follow the epic's agreed format).

## 29-08-2026 — Intake learned to size the work (#13)

**What:** When you bring an idea now, intake says out loud how heavy it is — research (a question), quick-build (small, plan drafted in the same sitting, one approval), or full-plan (a real planning stage before code) — and the label routes everything after. Bugs must arrive with reproduction steps or they become research first. Big features become a parent map with sub-issues instead of one monster.
**Why:** Underestimation was invisible: everything looked the same at intake, then blew up mid-build. Now the size call is explicit, overridable, and mechanically routed.
**How it went:** Clean rewrite; the brief template gained the marker, the bug section, and the seams rule so test placement is settled while questions are still allowed.
**Changed:** dev-intake v3 (scope calls, epic maps, one-approval quick-builds, bug variant, marker approvals) · brief template v3.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/13-dev-intake-v3

## 29-08-2026 — The rules grew teeth (#11)

**What:** Five small guard programs now enforce what used to be prose promises: an agent can't claim an issue without recorded approval, can't post a malformed brief/plan/evidence comment, and can't ship a branch whose tests weren't just re-run fresh — or whose docs fell behind the code. Machine-checkable facts hard-stop the agent; fuzzy signals (like "skipping tests for now" appearing in a report) only warn.
**Why:** The v3 assessment's biggest finding: the workflow preached "every rule that can be a check becomes a guard" while enforcing almost everything with prose. Prose bends under pressure; exit codes don't.
**How it went:** Two regex bugs caught by the unit tests before review ever saw them; the preflight guard passed its first live run against a real issue on the first try.
**Changed:** preflight + evidence-check (dev-implement) · brief-lint (dev-intake) · plan-lint (dev-plan, home of the banned-placeholder list) · ship-gate (dev-ship) · 44 unit tests · all shipped to installs.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/11-guard-scripts

## 29-08-2026 — Plans became a real stage, not a hope (#12)

**What:** There is now a dev-plan skill: big issues get a written, operator-approved plan before any code — exact files, what each task consumes and produces, the failing test written before the implementation, and a banned list for hand-wavy phrases like "handle edge cases". Small issues get the same plan shape inline at intake, so one approval still covers them.
**Why:** Short vague plans were where agents drifted: surface-level work, missed steps, invented scope. The plan format makes the gaps visible before they cost a build.
**How it went:** Smooth build; review caught the ratchet rule living in two files and some dead cross-skill links — both fixed. The behavioral eval showed the format clearly beats an unguided plan (the unguided one had no progress checkboxes, no interface contracts, and "write tests" without tests).
**Changed:** New dev-plan skill (installable) · scope-ratchet rules single-homed in it · README tables list it in workflow order.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/12-dev-plan-skill

## 28-08-2026 — The workflow got a shared rulebook (#10)

**What:** Every dev skill now reads one conventions file instead of each half-stating the rules. Issue comments carry hidden machine-readable markers, every artifact names the operator the same way, edited documents show visible version numbers, and issues carry scope labels (research / quick-build / full-plan) that say how heavy the process is at a glance.
**Why:** The v3 overhaul needs every skill and script to agree on formats — one home per rule, so nothing drifts.
**How it went:** Smooth; the one judgment call was switching this repo's release knob to on-request so the epic ships as a single version.
**Changed:** New conventions reference in dev-setup · five new labels wired into templates and this repo · register format now names the operator · chronicle file started (this entry).
**Decisions:** none new (executes the recorded v3 plan).
— approved by operator (kmanojkumar) · built by claude · branch feat/10-workflow-conventions
