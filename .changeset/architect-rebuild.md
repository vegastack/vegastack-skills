---
"@vegastack/skills": minor
---

Replace arch-guardian with architect — a from-scratch rebuild of the VegaStack architecture skill.

The retired arch-guardian (106 rules, 18 reference files, profile/schema/refresh tooling, its own test corpus) is deleted. The new `architect` skill encodes the same intent — consistent, MK-grade architecture decisions from any team member's agent — as a lean advisory skill: an evidence-distilled decision-table stack reference, dated source-verified platform facts, lean-first principles with their reasoning, domain taste references (web, data, infra, AI/agents, security, mobile), and a per-project `.vegastack/arch.md` profile created by a first-run Q&A where the repository always wins over the stored file.

Breaking for existing installs: `npx @vegastack/skills add architect` (the old skill name is gone; remove old arch-guardian installs manually or with `remove`). `doctor` now checks for `.vegastack/arch.md` instead of `architecture.json`. The repo-shared refresh runner moved from the skill to `tooling/refresh/`.
