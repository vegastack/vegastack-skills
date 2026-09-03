---
"@vegastack/vegafactory": minor
---

The public GitHub App "VegaFactory" has a documented contract, and the control room records its installation.

- New `dev-setup/references/github-app.md`: what the App is for and why it is never the dispatcher's identity, the exact permission table (Issues read/write · Metadata read · Projects (organization) read/write · Pull requests read/write · Contents read), the operator-only creation walk, the org variable and secret names, the `actions/create-github-app-token@v3` mint recipe, the installations command, the rotation order, the uninstall kill switch, and the three-check acceptance drill.
- dev-setup detects an org App installation in Step 1, offers the App-token recipe in place of a personal access token in Round C, and names the gap in its report when no installation is found. A 403 from the installations endpoint is reported as an unknown, never as a missing App.
- Three refresh entries — `GH-APP-PERMS`, `GH-APP-TOKEN`, `GH-APP-INSTALLS` — pin the App reference whole on a 14-day clock, because that file deliberately carries no `<!-- source: -->` markers.
- `vegafactory-setup` gains a `## Round — automation identity`, and the control room's `org.md` an `## Automation identity` block recording the App name, slug, installation id, secret **names** and granted permissions. Generating the private key is not automatable and the skill never attempts it.
