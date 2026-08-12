## What

<!-- One or two sentences: what this PR changes and why. -->

## Type of change

- [ ] Installer/CLI (`packages/cli/`)
- [ ] Skill content (`skills/`) — see [content versioning policy](https://github.com/vegastack/vegastack-skills/blob/main/docs/policies/content-versioning.md)
- [ ] Refresh metadata (`skills/*/refresh/`)
- [ ] CI / repo hygiene
- [ ] Docs

## Checklist

- [ ] `bun run check` passes locally
- [ ] No generated files committed (`dist/`, `packages/cli/skill/`, `skill-integrity.json`, `work/`)
- [ ] Semver impact considered per the content versioning policy (content changes only): new reference/section or changed recorded decision = minor, factual refresh/wording = patch, skill removal/rename or profile-format break = major
