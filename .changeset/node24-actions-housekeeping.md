---
"@vegastack/skills": minor
---

Housekeeping: standardize on Node 24 and current GitHub Actions

- `engines.node` raised from `>=20.11` to `>=24` (Node 20 is EOL; Node 24 is LTS and what CI/release run on)
- CI matrix collapsed to Node 24; deprecated actions bumped: `actions/checkout` v4→v7, `actions/setup-node` v4→v7, `softprops/action-gh-release` v2→v3
