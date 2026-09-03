# Refresh contract — vegafactory-setup

Instructions for the scheduled refresh agent (and any human running a manual refresh). This file plus `sources.json` is the complete freshness contract for this skill.

## What this skill claims

TODO: apply the volatile-facts rule (skillify references/authoring.md) before shipping:

- **Durable rules**: versionless principles in this skill's prose. The refresh agent NEVER edits these; if a source change invalidates one, open an issue quoting the evidence.
- **Volatile facts**: version pins, model names, numeric vendor limits, URLs, dated claims. Each lives in a refresh-tracked file named here, evidenced by a `sources.json` entry. A sentence leaning on one vendor mechanism may be marked `<!-- source: SOURCE-ID -->`.

TODO: name the refresh-tracked files and the sections the refresh agent may edit.

## Evergreen waiver

TODO: if this skill states no volatile facts, replace everything above with one line — "Evergreen: this skill asserts no version pins, vendor mechanism names, numeric vendor limits, or dated facts. Revisit if a future edit introduces any." — and keep `sources: []`.
