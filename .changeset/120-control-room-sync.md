---
"@vegastack/vegafactory": minor
---

`vegafactory sync` keeps a shallow control-room clone current at `~/.vegastack/control-room/<org>/`, and the skills read that clone instead of the network.

- `.vegastack/dev.md` gains `sync-max-age:` and records the clone sha it was drafted from in `control-room:`; the SessionStart hook refreshes the clone when the last successful fetch is older than that age.
- dev-status reports which org or group knobs moved since the profile was drafted, as a proposal — hand edits in dev.md still win, and nothing is edited automatically.
- A clone with local modifications, a symlinked clone path, or an unreadable `~/.vegastack/factory.json` is refused by name; a failed fetch keeps the existing clone and reports when it last synced.
