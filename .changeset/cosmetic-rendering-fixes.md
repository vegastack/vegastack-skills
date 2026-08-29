---
"@vegastack/skills": minor
---

Cosmetic rendering fixes across the workflow's shipped artifacts, confirmed against GitHub's own markdown renderer in file mode.

- dev-review: the known-patterns template's four entry fields are list items, so a project's file renders one line per field; appended entries inherit the shape.
- dev-implement: changelog entries carry a stated shape — one plain first sentence, detail as sub-bullets after a blank line.
- dev-implement: the evidence comment's tail links its sha to the commit; the guard accepts the bare form too.
- dev-status: `status.mjs` emits `titlePlain` and `gistPlain`, so the terminal board never prints raw link markup.
- Docs: one-line rows in the root README skills table; legacy plan headers bulleted.
