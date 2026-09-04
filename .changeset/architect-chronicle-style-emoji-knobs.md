---
"@vegastack/vegafactory": minor
---

dev.md gains an architecture-owner knob and two chronicle voice knobs, dev-setup writes them without a question, and dev-architect now addresses the architecture owner instead of one named person.

- `architect: <github-username>` names the architecture owner dev-architect speaks to; dev-setup writes `gh api user -q .login` as the default.
- `chronicle-style: plain | story | witty` and `emoji: none | sparing` set the voice of chronicle entries; dev-chronicle's new `references/styles.md` carries the rule every style follows, the boundary of witty, and one worked example per style.
- dev-implement's chronicle write rule cites the two voice knobs.
- dev-architect's directive sentences say "the architecture owner"; sentences recording what MK decided or reversed stay as record, and the three directives about ship consent, rollback go-ahead, and OTP/2FA entry say "the operator".
- The profile template's `## Stop and ask` opens with the pause-only sentence — ask and end the turn rather than end on a promise — followed by the project's concrete list.
