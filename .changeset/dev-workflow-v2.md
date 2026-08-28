---
"@vegastack/skills": minor
---

Dev workflow v2 — ground-up overhaul of the dev skill family for any stack, greenfield included.

- `.vegastack/dev.md` becomes each project's **single canonical process doc**: release runbook, changelog convention, versioning policy, and rollback fold in as `## Ship` bullets — no separate policy docs. New `authority:` line, `labels:` and `changelog:` knobs, `gates: 1` (direct-to-main for single-operator projects), and a `## Decisions` section carrying the qualification test. The decision register default moves to `.vegastack/decisions.md` with the format `- DD-MM-YYYY (github-username) — decision`; every entry needs the user's explicit yes.
- **dev-setup**: new `references/stack-playbooks.md` maps detection signals to stack-native drafts (npm/changesets, Node app, Flutter, Python, Go, generic) — Ship runbook, changelog convention, version identity, guards, rollback line each. Greenfield repos are a supported path (intended-stack interview, git init / gh repo create on yes) instead of a hard stop. Round C can scaffold release-guard CI steps, the shared cross-project evidence repo (`<owner>/dev-review-evidence`, contents-API uploads, no clones), and an optional decision-capture Stop hook for both Claude Code and Codex (recipe + sourced hook facts in harness-facts.md).
- **dev-implement**: changelog entry is a first-class step before hand-back (changesets written non-interactively as `.changeset/<slug>.md`); evidence comment gains `**Changelog:**` and `**Decision:**` lines; branch pattern reads solely from dev.md.
- **dev-ship**: new `references/runbook.md` — `auto:`/`ask:`/`guard:` semantics (guards run locally, CI is the backstop), release batching, direct-to-main mechanics, bot PRs (merging one is shipping: green checks qualify, only the operator's word merges), roll-forward rollback. Gate 1 verifies the changelog entry; Gate 2 names pending decisions in the merge confirmation before recording them.
- **AGENTS.md section**: hard consent rule — nothing ships without the operator's explicit instruction; the gates knob changes coverage, never the need for a word — plus portable ad-hoc decision capture on both harnesses.
- **dev-intake**: brief template gains docs/changelog surfaces and a Version impact line; `Decision:` comments are gated by the dev.md test.

This repo dogfoods the result: `docs/policies/` is folded into `.vegastack/dev.md` and deleted, the register moved to `.vegastack/decisions.md`, and the release workflow now leads its GitHub release notes with the changelog entry and fails if the entry is missing.
