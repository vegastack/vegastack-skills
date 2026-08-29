---
"@vegastack/skills": minor
---

dev-status stops reporting already-recorded decisions as pending, and the workflow's shipped artifacts render correctly where they are actually read.

- dev-status: a decision already in the register no longer stays "pending" forever when its gist carries a markdown link.
- dev-status: `status.mjs` emits `titlePlain` and `gistPlain`, so the terminal board never prints raw link markup.
- dev-review: the known-patterns template's four entry fields are list items, so a project's file renders one line per field; appended entries inherit the shape.
- dev-implement: changeset entries carry a stated shape — one plain first sentence, detail as sub-bullets after a blank line.
- dev-implement: the evidence tail's sha stays bare, with the reason on the record — GitHub auto-links it once the branch is pushed.
- Docs: one-line rows in both README skills tables; legacy plan headers bulleted.
