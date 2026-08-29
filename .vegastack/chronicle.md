# Chronicle — vegastack-skills

The project's story, newest first: what got built, why, and how it went — for the operator's future recall. Format home: the dev-chronicle skill.

## 29-08-2026 — The weekly refresh can no longer paint itself into a corner (#37)

**What:** The automated freshness checker used to lock up permanently if a "human must re-review this page" source went past its review window while the page itself never changed — and the only escape was a hand-edit the rules forbid. Now, when the checker cryptographically proves the page is byte-for-byte what a human last reviewed, the review clock refreshes itself; anything that actually changed still stops the line for human eyes.
**Why:** Found live: the first post-release refresh run failed three-of-three attempts on a Cloudflare docs source that was 16 days "overdue" despite being provably unchanged.
**How it went:** Textbook dev-debug — red command reproduced locally in one try; the test harness fought back twice (macOS /var symlink guard, a required registry option) before the true red.
**Changed:** verified-unchanged sources refresh their review clock under accepting runs · two regression tests incl. the read-only-mutates-nothing guarantee.
**Decisions:** none.
— approved by operator (kmanojkumar) · built by claude · branch fix/37-refresh-deadlock

## 29-08-2026 — The system survived its own audit and got harder (#35)

**What:** The epic's closing sweep put four fresh adversarial reviewers over everything built this week — and their ~20 findings are now fixed: the ship gate can no longer be talked past by routine rulings, plans can't hide unfenced test steps or checkbox-less tasks, every standalone install carries the shared rulebook, bug issues actually route to the debugger, and the one rationalization a pressure test ever caught ("a PR is just preparation") is now a named excuse with its answer printed in the shipping skill.
**Why:** The operator's bar: pressure-test and adversarially review every change before releasing. The sweep found real holes; shipping them would have been the old prose-only workflow all over again.
**How it went:** The audit caught its own builders repeatedly (unticked checkboxes on eleven issues, a stale changeset sentence headed for the public changelog) — every catch fixed on the record.
**Changed:** ship-gate/plan-lint/preflight/brief-lint spec conformance + fail-closed tests · @source shared packaging (conventions.md everywhere) · fix:-to-dev-debug routing · cross-agent handoff literals · resume-protocol exclusions · plan-template Revisions slot · truthful release notes.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch fix/35-v3-hardening

## 29-08-2026 — The skills stopped spoiling their own plots (#21)

**What:** Every skill's one-line description now says only when to use it and what it's not for — the step-by-step summaries are gone. That matters because agents sometimes follow the summary instead of opening the skill, skipping steps the summary didn't mention. The repo docs now also name all ten workflow skills in one place.
**Why:** An empirically observed failure mode from the external research: a description that narrates process becomes a shortcut past the process.
**How it went:** Three descriptions still carried summaries (setup, ship, architect). The family-wide trigger check (149 queries) caught one real contradiction — status and chronicle both claiming "what happened while I was away" as a must-win — resolved in chronicle's favor; and stripping setup's summary had silently removed its trigger nouns, restored as proper Use-when phrases.
**Changed:** dev-setup, dev-ship, and dev-architect descriptions rewritten · one family order across CONTRIBUTING, the AGENTS.md template, and the README rows.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch chore/21-descriptions

## 29-08-2026 — Small honesty fixes in the advisor and the factory (#20)

**What:** Architecture guidance marked "(inferred)" can now actually graduate: confirming one proposes a dated register line and removes the tag — before, nothing ever flipped inferred to ratified. And the skill factory's testing playbook now says out loud what this epic learned by doing: trigger checks must re-run across the whole family when it changes, and workflow skills get their real proof from a sandbox drill, not single prompts.
**Why:** Both were quiet drift risks found in the v3 assessment.
**How it went:** Four surgical edits; nothing fought back.
**Changed:** dev-architect ratification rule + count-free red-lines heading · skillify family-level trigger rule + workflow-skill eval note.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/20-refinements

## 29-08-2026 — Bugs must be caught red-handed before they're "fixed" (#19)

**What:** Bug work now has a hard order: first build one command that provably fails because of the reported symptom — no theorizing allowed before it exists — then shrink it, list ranked suspects with testable predictions, probe one variable at a time with tagged logging, and write the failing regression test before the fix. If no command can be built, the agent asks for artifacts instead of guessing; if no honest seam exists for the test, that gap is recorded instead of papered over.
**Why:** "Fixed" something that was never the cause is the most expensive kind of done.
**How it went:** Smooth; the ship-gate tag check and intake's Reproduction requirement were already waiting for this skill to plug into.
**Changed:** dev-debug skill (installable) · eight-rung loop ladder reference.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/19-dev-debug

## 29-08-2026 — The operator got a front desk (#18)

**What:** Asking "status" or "what needs me" now produces the board: your queue first (things awaiting your word, oldest first), then what's waiting on plans, ready for agents, in flight with live task counts, gone quiet, and any decisions awaiting their merge — each line a named link, ending with the single most valuable thing to do next.
**Why:** The operator's view was raw label-digging across issues; the workflow's whole state should be one ask away.
**How it went:** Smooth; the marker conventions made every signal (ledger age, checkbox progress, pending decisions) mechanically readable.
**Changed:** dev-status skill (installable) · status.mjs gatherer with unit tests.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/18-dev-status

## 29-08-2026 — The project can now tell its own story (#17)

**What:** "Catch me up on this project" works: the chronicle you are reading has an owner skill that defines the entry format and renders the digest — the story so far, the recent chapters, the open threads — without digging through git. Every build already writes its chapter; now the reading side exists too.
**Why:** The operator kept forgetting what a project contained and what had happened in it; changelogs answer what changed for consumers, not what happened for the builder.
**How it went:** Smooth — the file and knob had been dogfooded since #10, so the skill mostly wrote down rules already being lived.
**Changed:** dev-chronicle skill (installable) · this file's header now points at it.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/17-dev-chronicle

## 29-08-2026 — Shipping stopped taking anyone's word for it (#16)

**What:** Before any PR, the ship gate now re-runs the project's checks itself, verifies the docs still describe the code, requires the changelog AND the story entry, and refuses review verdicts that weren't clean or openly ruled on. A merge instruction older than a week (or following a behavior-touching rebase) gets one polite re-confirm instead of blind obedience, and every ship ends by asking "what one line would have prevented this issue's friction?"
**Why:** Self-reported evidence was the last trust gap — claims are now re-proven at the moment they matter.
**How it went:** Small, surgical; the preflight guard also caught the coordinator claiming an issue before running preflight — order corrected, lesson recorded.
**Changed:** dev-ship v3 (ship-gate wiring, staleness bound, retro close, operator register format) · ship-gate gains the chronicle presence check.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/16-dev-ship-v3

## 29-08-2026 — Dark builds got a black box recorder (#15)

**What:** While an agent builds unattended, it now keeps a live ledger on the issue — each finished task, each judgment call with its reasoning and what it costs if wrong, each review round. If the session dies or forgets (context limits), a fresh one reads brief → plan → ledger → git history — nothing else — and resumes at the exact right spot instead of redoing finished work. Tests are written before code at the boundaries the brief fixed, no status is ever claimed without a fresh command proving it, and when you correct something, the docs get corrected in the same breath as the code.
**Why:** Session death used to mean starting over blind, and "tests pass" was sometimes a memory, not a fact.
**How it went:** Clean rewrite on top of the merged guards and review system; the SKILL stayed within budget by moving ledger mechanics to a reference.
**Changed:** dev-implement v3 (ledger + resume, TDD rules, verification gate, ratchet stop, doc-sync corrections, bounded direct path) · chronicle entries now written by the build itself.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/15-dev-implement-v3

## 29-08-2026 — Review became the strongest link (#14)

**What:** Reviewing finished work is now its own skill with real machinery: three separate fresh-eyed reviewers (does it match the brief · does it follow the rules · is it secure, when it matters), findings with severities that either block or don't, one tidy review comment per cycle, a fix loop that can't spin forever (three rounds, then every leftover gets an open ruling), and the option to have the *other* AI (Codex) do the review on risky work — announced to you before and after, never silently.
**Why:** The reviewer was the least-specified actor guarding dark-mode work — a two-line prompt deciding whether unattended code ships. Now it's the most-specified.
**How it went:** Built on the merged conventions and guards; the preflight guard blocked this very issue's start over an unresolved assumption, which got resolved with evidence instead of a guess — the system policing its own construction.
**Changed:** dev-review skill (installable) · dev-implement's review step now invokes it · per-project never-flag file with mandatory "Still flag if:" clauses.
**Decisions:** none new.
— approved by operator (kmanojkumar) · built by claude · branch feat/14-dev-review-skill

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
