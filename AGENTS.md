# vegastack-skills — agent guide

<!-- vsk-dev:start -->
## Dev workflow

Read `.vegastack/dev.md` for this project's stack, commands, and workflow knobs.

Work flows through GitHub issues. An issue labeled `ready` carries the user's recorded approval and a complete brief — implement it end to end per the `dev-implement` skill, post the evidence in the issue, and hand it back with `for-operator`. Start only on `ready` issues. These five labels are the whole workflow vocabulary — use them and no others: `needs-operator` (waiting on the user) → `ready` (approved) → `working` (claimed by an agent) → `for-operator` (result awaiting user review); `risky` flags security, money, data, or production work.

The user holds the gates: they approve the issue, say the word for a PR, and say a separate word to merge (see `gates` in dev.md); after merge, the `## Ship` runbook in dev.md says what happens next and which steps need their word. Material decisions get one dated line in the decision register dev.md names (`decisions:` knob).

dev.md is the project's self-maintained handbook: when a gotcha, surprise, or repeated instruction surfaces in any run, propose one line for the right dev.md section that would have prevented it — fold into existing lines, never append a log — and add it on the user's yes.
<!-- vsk-dev:end -->

## Repo specifics

- CONTRIBUTING.md and docs/policies/ win over anything else on repo process.
- Skill authoring runs through the `skillify` skill; repo standards live in `skill-maintainer`.
