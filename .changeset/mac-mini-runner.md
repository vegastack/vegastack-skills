---
"@vegastack/vegafactory": minor
---

vegafactory-setup ships a dispatcher-box provisioning checklist, and both workflows record the always-on runner group they will move to.

- `onboarding/dispatcher-box.md` is the control room's third onboarding path: two macOS accounts on the box, so a CI job cannot read the dispatcher's tokens; the pinned toolchain (bun 1.3.14, Node 24, gh 2.97+, uv + SkillSpector); the sleep and auto-login rules; the runner registration block; the org-admin group grant; and a reboot drill that proves "always-on".
- `ci.yml` and `release.yml` name the org runner group `vsk-runners-mac-mini` and the exact switch to it, but keep targeting the registered laptop runners: an ungranted or empty group queues a required check forever with `runner: null`, so the switch waits for the operator's org-admin grant.
- Provenance stays off — moving to the mini does not restore it, because npm accepts a provenance bundle only from a GitHub-hosted runner (#57).
