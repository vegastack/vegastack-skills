---
"@vegastack/skills": patch
---

dev-chronicle: the entry format now renders correctly in GitHub file views — fields are list items (single newlines soft-wrap into one paragraph otherwise), titles carry a full markdown link to the issue, and bare #N references are banned from entries (file views never auto-link them). The footer sits after a blank line as its own paragraph.
