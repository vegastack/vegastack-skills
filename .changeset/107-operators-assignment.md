---
"@vegastack/vegafactory": minor
---

Every workflow issue is now assigned to the human whose move it is, so GitHub's own notifications reach them without extra tooling.

- dev.md gains an `operators:` knob — the csv of humans who own issues here; dev-setup writes the detected login and offers the list in Round B.
- The workflow conventions' Labels table gains an assignee column, and states the operator rule once: an issue's operator is its approval-marker author when `operators:` names them, else its issue author when listed, else the first listed.
- dev-intake creates with `--assignee`, dev-plan assigns on `needs-operator` and unassigns on `ready`, dev-implement claims by assigning the runner and hands back to the operator.
- `preflight.mjs` warns (never blocks) when a `ready` issue already carries an assignee, naming who holds it.
- `status.mjs` reads the knob and the caller, returns `assignees` and a resolved `operator` per issue, and derives `needsYou` and `unowned`; dev-status defaults to your own board and takes `--all` for the team's.
