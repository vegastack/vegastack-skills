# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/vegastack/vegastack-skills/security/advisories/new) on this repository. Do not open a public issue for security problems.

We aim to acknowledge reports within 5 business days.

## Disclosure

We follow a 90-day coordinated disclosure window: unless we agree otherwise with the reporter, details may be published 90 days after the initial report, or earlier once a fix is released.

## Supported versions

Only the latest published minor of `@vegastack/skills` receives security fixes.

| Version | Supported |
|---|---|
| latest minor (see [npm](https://www.npmjs.com/package/@vegastack/skills)) | yes |
| older versions | no — upgrade |

## Scope notes

- The installer makes no network calls at install time; `doctor` performs a single version check against registry.npmjs.org. Anything contradicting that is a vulnerability — report it.
- The bundled checksum manifest proves package-internal consistency; publisher identity is attested by npm provenance. Weaknesses in either model are in scope.
- Fake credentials under any skill's `tests/fixtures/` are intentional test fixtures, not leaks (see `.gitleaks.toml`).
