---
"@vegastack/vegafactory": minor
---

A new `factory` group ships `vegafactory-setup`, the skill that bootstraps and maintains the org control room every repo's profile layers on.

- The control room's files — `org.md`, `people.csv`, `decisions.md`, `groups/<g>/{group.md,people.csv,decisions.md}`, `repos.md`, `boards.md`, `rules/`, `onboarding/`, `templates/` — ship as seed templates with one reference documenting the layout, the precedence, and the read path.
- dev-setup now detects org defaults first and states an inherited knob instead of asking for it; `.vegastack/dev.md` gains a `control-room:` knob.
- `references/conventions.md` states the precedence in one line; the checkpoint-retention rule moved to dev-implement's `references/ledger-and-resume.md`, the skill that applies it.
- `groups/<g>/group.md` carries its harness policy as the one `harness-policy:` line dev.md uses, so the dispatcher's parser layers the two files key by key (the six `harness:` lines it wrote before parsed as nothing), and it gains defaults for `ui-evidence:`, `worktree-retention:`, `skillspector-update:` and `sync-max-age:`; its promise is stated as every knob a group can decide, not every knob a dev.md can hold.
