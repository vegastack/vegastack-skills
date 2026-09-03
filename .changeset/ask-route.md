---
'@vegastack/vegafactory': minor
---

dev-intake, dev-plan and dev-implement now ask their questions in the issue when no harness question tool is available, and parse your reply on the next run.

- A new `questions` comment type carries the round: numbered questions, lettered options, exactly one recommendation with its reason, and a reply line.
- Reply in an ordinary comment — `1: b`, `2: a — because …`, `3: other — …`, or `all recommended`; anyone on the issue may answer, and an answer is never an approval.
- A partly answered round is re-asked at the next `rev` carrying only the open questions, at their original numbers.
- The route is decided programmatically: `VSK_ASK_ROUTE` first, then whether the run has a question tool, then whether the asker is the issue's operator.
- dev-setup ships the shared `scripts/questions.mjs` and `references/ask-route.md` into all three skills.
