---
"@vegastack/skills": minor
---

dev-implement uploads UI evidence through a dry-run-by-default script and keeps its changelog mechanics and dev-review's scanner-provisioning detail out of the skill bodies.

- New `scripts/evidence-upload.mjs`: `--repo <o/r> --issue <n> --file <png> [--evidence-repo <o/r>] [--dev-md <path>] [--write] [--json]` — plans the PUT (path `<repo-name>/<issue>/<timestamp>-<name>`, size) and sends only under `--write`; the `{message, content}` body rides gh's stdin so the base64 payload never touches argv or any output line; one retry under a `-r2` name on HTTP 409; symlinks, non-image extensions, empty files, and a missing `evidence-repo:` knob are refused with exit 2.
- New `references/changelog-and-chronicle.md` carries the per-knob changelog mechanics, the entry's first-line rule, and the chronicle hand-off; dev-implement's body keeps a one-paragraph pointer and its Verify bullet names the script instead of a shell one-liner.
- dev-review's body keeps one sentence on scanner provisioning; the uv/brew/pipx lookup, the `skillspector-update:` knob, `--no-provision`, and the upgrade-reporting rule live in its README.
- `ghJson` in `scripts/lib/gh.mjs` accepts an `input` option that feeds the child's stdin, so one gh runner serves reads and stdin-fed writes.
