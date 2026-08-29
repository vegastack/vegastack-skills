---
"@vegastack/skills": minor
---

Cosmetic rendering fixes across the workflow's shipped artifacts, confirmed against GitHub's own markdown renderer in file mode.

- dev-review's known-patterns template: the four entry fields are list items, so a project's `.vegastack/review-known-patterns.md` no longer renders as one merged paragraph in a file view — appended entries inherit the shape.
- dev-implement: changesets now carry a stated shape — first line one plain sentence, detail after a blank line as short sub-bullets — so the changelog and the release notes that lead with it stop being walls of text (cited by CONTRIBUTING and skill-maintainer's release ops).
- dev-implement: the evidence comment's tail links its sha to the commit; the guard accepts the bare form too.
- dev-status: `status.mjs` emits `titlePlain` and `gistPlain` alongside the raw fields, so the terminal board never prints raw link markup from a post-#44 chronicle title.
- Docs: one-line rows in the root README skills table, and legacy plan headers bulleted.
