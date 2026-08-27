---
"@vegastack/skills": minor
---

dev.md becomes the project's self-maintained handbook: new Ship (post-merge runbook with auto/ask steps), Verify, Environments, and Design sections plus a release knob (per-merge | on-request); dev-setup detects release/deploy machinery and drafts them; dev-ship follows the Ship runbook after merge and stops at ask-lines and failures; dev-implement follows the Verify runbook for live evidence. The retro-fold rule lands in the shared AGENTS.md section: gotchas become one proposed dev.md line, folded into existing sections, never a log. Labels renamed for role clarity: needs-you → needs-operator, for-you → for-operator (re-run dev-setup to create them; old labels remain on historical issues). This repo now dogfoods the workflow with its own dev.md whose Ship runbook is the changesets release flow.
