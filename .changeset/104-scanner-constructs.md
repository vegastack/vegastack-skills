---
"@vegastack/vegafactory": patch
---

`validate:skill` now rejects a description carrying `: ` (colon-space), the YAML mapping indicator that made skill-maintainer's frontmatter unparseable and its description invisible to every harness; the description itself is fixed. The shipped scripts, hooks and references no longer carry the two constructs that blinded SkillSpector's static analyzers — the `stdio` mode word beside its own quote, and template literals opening on their interpolation — so every skill but two now scans at full coverage, with the same bytes reaching every child process.
