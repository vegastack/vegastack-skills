---
"@vegastack/skills": minor
---

The skill-scan guard now finds the SkillSpector CLI through the channel that installed it, and keeps it up to date on its own.

- A scanner installed via uv, brew, or pipx is located and run by absolute path, so it is no longer reported as missing when the agent's shell has a different `PATH` than the operator's.
- New `skillspector-update:` knob in `.vegastack/dev.md` — `off | notify | auto`, defaulting to `auto`, which installs SkillSpector when absent and upgrades it before each scan.
- Any install or upgrade failure falls back to the copy already installed and the scan continues; only a scanner that cannot be found at all still blocks.
- An upgrade that changes the version or its dependencies is reported before the findings, so new findings read as the scanner having learned something rather than the change having broken something.
- A baseline that pins `scanner_version` for fingerprint suppressions warns when a different version ran; the pin is never moved automatically.
- `--no-provision` forces a single run to leave the machine untouched.
