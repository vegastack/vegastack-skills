---
"@vegastack/skills": minor
---

The skill-scan baseline gains a `coverage` section, for files a scanner could not finish reading.

- SkillSpector's own baseline suppresses findings only. It has no way to express "the scan of this file is incomplete", so a skill whose script the scanner cannot fully parse would block forever with no recourse. `coverage` entries accept that, named by `skill` and `file`, under the same discipline as a rule: a written reason carrying a "Still flag if:" clause, enforced by the guard.
- An acceptance covers exactly the file it names. If a skill has a second unread file that is not accounted for, it still blocks — accepting a known cause must not silently cover an unknown one.
- `AE1` findings are accepted through `coverage` too. Despite arriving as HIGH findings, they are completeness signals: the scanner's own text is "Referenced artifact was not completely inspected."
- A degraded or partly-read scan no longer hides the findings it did produce. Only a failed execution short-circuits, where no field of the report can be trusted.
- `skill-maintainer` documents the triage decision order — fix, rule, fingerprint, coverage, park — and the SkillSpector behaviours already traced on this repo, so future findings are adjudicated the same way rather than re-derived.
