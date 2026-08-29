---
name: dev-chronicle
description: The project's narrative record — what got built, why, and how it went, in plain language for the operator's future recall. Use when asked to "catch me up on this project", "what did we build here", "what happened in this repo", "tell me the story so far", "what's the project story", when a chronicle entry needs writing for finished work, or when dev-implement's hand-back cites the chronicle format. Not for the consumer-facing changelog (dev-implement writes those per the changelog knob), release notes (dev-ship), or current board state ("what needs me" is dev-status).
---

# dev-chronicle

`.vegastack/chronicle.md` is the project's story, newest first — the answer to "what did I build here and what happened?" months later, when the operator remembers nothing. Entries are **story language for a human**, never commit-log prose: the changelog tells consumers what changed; the chronicle tells the operator what happened.

Nearest neighbors: `dev-implement` writes the entries at hand-back (the write rule lives there; the format lives here); `dev-status` answers "what needs me now" — this skill answers "how did we get here". `dev-ship`'s ship-gate checks entry presence when dev.md says `chronicle: on`.

## The entry — one per behavior-changing branch

```markdown
## DD-MM-YYYY — <title: the change as a human outcome — not a mechanism, not a commit subject> ([#<issue>](<issue url>))

- **What:** <2–4 plain sentences: what exists now that didn't, from the operator's point of view>
- **Why:** <the need that prompted it>
- **How it went:** <the honest one-liner: smooth / what fought back / what was cut>
- **Changed:** <the user-visible changes, simple words — sub-bullets or one ·-separated line>
- **Decisions:** <register lines it produced, or "none">

— approved by operator (<username>) · built by <agent> · branch <name>
```

- Titles name the outcome ("Invoice reminders now chase late payers"), never the mechanism ("add reminderAt column"). The issue reference is a full markdown link to `…/issues/<n>` (correct for PRs too — GitHub redirects); a bare `#N` never appears anywhere in an entry, because file views don't auto-link it.
- The fields are LIST ITEMS and the footer sits after a blank line — single newlines soft-wrap into one paragraph in rendered markdown; bullets are what guarantee a line per field.
- Prepend — newest first. File missing → create it with a two-line header naming this skill as the format home.
- **How it went** is where honesty lives: what fought back, what was cut, what surprised. "Smooth" is a fine answer; silence is not.
- Research issues get an entry only when the findings changed direction; docs/test-only merges get none (ship-gate's excuse flag covers both records at once).
- A notable ship event — rollback, failed release — becomes its own short entry on the next branch, not a rewrite of an old one. Entries are never edited except for typos; the story is append-only like the register.

## The digest — "catch me up"

On "catch me up on this project" (or any story-so-far ask), read **only** `.vegastack/chronicle.md` and the decision register — never git archaeology — and render three parts, plain language throughout:

1. **The story so far** — 3–5 sentences: what this project is, the arc of what's been built, where it stands.
2. **Recent chapters** — the last 3–7 entries, one line each: date, the outcome title, and the one thing worth remembering from How-it-went.
3. **Open threads** — pending decisions the register hasn't recorded, entries whose How-it-went named unfinished business, and (when `dev-status` is installed) a one-line pointer to run it for the live board.

Length scales with the ask: "catch me up quickly" is one paragraph; a returning-after-months operator gets all three parts. Never pad — a young project with three entries gets three honest lines.

## Setup

The `chronicle:` knob in dev.md (`on` default | `off`) governs whether dev-implement writes entries and ship-gate checks them; `dev-setup` writes the knob. A project that turns it on mid-life starts from now — no retroactive backfill unless the operator asks, and then it's marked as reconstructed.

Close every run with the plain-language summary: what was written or rendered, and anything the story surfaced that deserves the operator's attention.
