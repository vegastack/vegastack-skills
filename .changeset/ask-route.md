---
'@vegastack/vegafactory': minor
---

dev-intake, dev-plan and dev-implement now ask their questions in the issue when no harness question tool is available, and parse your reply on the next run.

- A new `questions` comment type carries the round: numbered questions, lettered options, exactly one recommendation with its reason, and a reply line.
- Reply in an ordinary comment — `1: b`, `2: a — because …`, `3: other — …`, or `all recommended`; anyone on the issue may answer, and an answer is never an approval.
- A partly answered round is re-asked at the next `rev` carrying only the open questions, at their original numbers.
- The route is decided programmatically: `VSK_ASK_ROUTE` first, then whether the run has a question tool, then whether the asker is the issue's operator.
- A later session with no local copy of the round reads it back out of the posted comment (`--round`), and text that could forge a marker or close the block is refused in both directions.
- dev-setup ships the shared `scripts/questions.mjs` and `references/ask-route.md` into all three skills.
- On the issue route dev-intake creates the issue before its first round — `needs-operator`, operator assigned, the request as the body — so the round has a surface; the tool route still creates it after approval.
- A reply line whose letter runs into prose with no dash (`1: a is wrong, go with b`) is reported as malformed and re-asked, instead of being recorded as the letter it opens with.
- `ask-route.md` points at `harness-facts.md` by path rather than by link, because the three consumer skills do not ship that reference; a repo test now resolves every link in a packaged reference against the consumer's bundle.
