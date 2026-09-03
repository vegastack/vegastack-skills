---
"@vegastack/vegafactory": minor
---

Board mirror: dev-setup writes `.github/workflows/factory-board.yml`, the new `board:` knob names the project, and vegafactory-setup creates and links it. Labels drive the state; the board follows, one way.
- `runs-on` is bound unquoted, so a label-array runner (`[self-hosted, x]`) renders as a YAML sequence rather than one literal label that no runner carries; the mint step is on `actions/create-github-app-token@v3`, the major the App reference documents, and passes `repositories:` so the token is scoped to the one repository the job runs in; the mirror step adds an item only on gh's own "is not an item in project" error and reports every other failure as itself.
