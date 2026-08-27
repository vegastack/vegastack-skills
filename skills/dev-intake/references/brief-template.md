# Issue brief template

The issue body a `ready` issue must have. Write the sections that apply, delete the rest. The test for every section: would a fresh agent have to guess or ask without it?

```markdown
## Outcome

What exists when this is done, in observable terms — what the user can do, what the
system produces. One paragraph.

## Out of scope

The nearby things this issue deliberately does NOT do. This is what stops scope creep
in dark mode — name the tempting adjacent work.

## Rules and edge cases

The behavior that isn't obvious: validations, permissions, limits, empty/error/concurrent
cases, what happens on failure. Bullet list, one behavior per line.

## UI states            <!-- only when there is UI -->

Loading, empty, error, success, disabled. Which design-system components. Copy for
user-facing text. Responsive and keyboard behavior when it matters.

## Approach and touch points

The chosen technical approach in a few lines: which parts of the codebase change,
new/changed interfaces or schemas, data migrations. Routine choices (file names,
helpers, fixtures) stay the implementer's — don't specify them.

## Tests and acceptance

What proves it works: the cases tests must cover (success, boundary, failure,
authorization where relevant) and the commands to run. Acceptance = the Outcome plus
these passing.

## Risks and stop conditions

What could go wrong and what should make the agent stop and ask instead of pushing
through — beyond the standing stop-list in .vegastack/dev.md.

## Assumptions — confirm or correct

Anything material the grounding investigation could not verify, one per line, each
awaiting the user's confirm/correct. The issue cannot go `ready` while one is
unconfirmed. Verified facts never appear here — they live in their section with
their evidence. Delete the section once every entry is resolved.
```

## Writing rules

- Inline over linked: the material details live in the issue itself. A link supports; it never substitutes.
- Concrete over abstract: "rejects amounts over 10,000 with error E402" beats "validates input".
- Evidence over confidence: touch points name real file paths; a dependency capability claim carries the doc check and its date; what couldn't be verified goes to Assumptions, never stated as fact.
- The brief binds the agent, so ambiguity is a bug in the brief — if two readings exist, the interview wasn't done.
