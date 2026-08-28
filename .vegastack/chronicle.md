# Chronicle — vegastack-skills

The project's story, newest first: what got built, why, and how it went — for the operator's future recall. Format home: the dev-chronicle skill (lands with issue #17 of the v3 epic; entries before it follow the epic's agreed format).

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
