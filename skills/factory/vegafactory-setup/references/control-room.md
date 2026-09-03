# The control room

The org's `vegafactory-control-room` repository: what each file holds, which file wins when two disagree, and how a run reads it. `vegafactory-setup` seeds every file here from `assets/control-room/*.template`; `dev-setup` reads them before it asks a repo anything.

## Layout

```
org.md                       global only: org name, goals, what applies to everyone (questionnaire)
people.csv                   login,name,role,slack,timezone,groups
decisions.md                 org-level register (same line format as repos)
groups/<g>/group.md          department defaults: one line per knob a repo dev.md can hold
groups/<g>/people.csv        group-level people (adds to / overrides org)
groups/<g>/decisions.md      group-level register
repos.md                     registry: repo, group, board, owner (maintained by this skill)
boards.md                    project boards and repo -> board mapping
rules/                       org-wide review known-patterns, security rules, CODEOWNERS pattern
onboarding/new-repo.md       checklist run by vegafactory-setup, then dev-setup
onboarding/new-teammate.md   gh auth, harness install, skills install, control-room access, Slack
templates/                   hook wiring snippets, board workflow, dev.md section overrides
stats/<owner>__<name>/<MON-YYYY>/<hostname>.jsonl   one record per run or session, written by automation
stats/<owner>__<name>/<MON-YYYY>.summary.json       regenerated per repo per month
stats/<owner>__<name>/<MON-YYYY>.timeline.json      regenerated: the month's issue label timelines, read through gh at rollup
stats/org/<MON-YYYY>.summary.json                   regenerated across every repo
stats/org/<MON-YYYY>.skills.json                    regenerated: invocations per skill
```

`stats/` is the one tree automation writes, and the shape is the reason it can. One file per repo, per month, per **machine** means two machines never touch the same file, so a concurrent push is a non-fast-forward — solved by `pull --rebase` and a retry — and never a content conflict needing a human. The repo segment is `<owner>__<name>` so a path stays two levels deep and a repo name can never be mistaken for a month directory. The three summaries are **regenerated**, never appended: a summary that accumulated would drift the first time a record arrived late from a machine that was offline. Records are counts and identifiers only — never prompt text, assistant text, tool arguments, or file contents — and `rules/stats-privacy.md` is where that promise is written down for everyone the org onboards.

`groups/dev/` is the only department seeded today; another department is a new `groups/<g>/` with the same three files.

## Precedence — nearest wins

Hand edits in a repo's `.vegastack/dev.md` beat `groups/<g>/*`, which beat `org.md`, which beat the skill defaults. The one exception is the decision registers: `decisions.md` at org, group, and repo level **concatenate** — a group register never hides an org decision, and no register overrides another.

The rule has one home in dev-setup's `references/conventions.md` (the precedence sentence); this file shows how the files realise it and never restates it in different words.

## What each file may and may not carry

- `org.md` holds global policy only: the org name, the goals in one paragraph, and what applies to everyone — language, the date format, the "nothing ships without the operator's instruction" stance, and the statistics policy lines `stats:`, `stats-people:`, `stats-override:`. **A department knob never appears in `org.md`** — `review:`, `gates:`, `merge:`, and the harness policy belong to `groups/<g>/group.md`, because two departments reading one org file would each need the other's answer to be wrong.
- `org.md`'s `## Automation identity` block records the org's GitHub App by name, five lines and no more: `app:` the App name, `app-slug:` the slug the actor string and the install URL both follow, `app-install:` the installation id from `gh api orgs/<org>/installations`, `app-secrets:` the two secret **names**, and `app-permissions:` the granted set. The permission table, the mint recipe, rotation and the kill switch live in dev-setup's `references/github-app.md` and are never restated here.
- `groups/<g>/group.md` carries one default for every knob a `.vegastack/dev.md` can hold, so a repo that answers nothing still gets a complete profile.
- `repos.md` and `boards.md` are registries, written when a repo is registered or a board is linked, never hand-curated in parallel with them.
- **Nothing secret goes in any file — names of secrets only.** A control room is readable by everyone the org onboards, and a name (`NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`) is all a runbook needs; the value lives in the secret store the name points at.
- A step the operator declines is recorded in `org.md` as an unconfirmed line, in the same form `dev-setup` writes for a knob it could not confirm — so the next run asks again instead of assuming.

## The read path

Once `vegafactory sync` exists (issue #120), every read comes from the local shallow clone at `~/.vegastack/control-room/<org>/`, refreshed by `vegafactory sync`, the dispatcher tick, and SessionStart when it is older than 30 minutes.

Until then, read a single file over the API:

```sh
gh api repos/<org>/vegafactory-control-room/contents/<path> -q '.content' | base64 -d
```

A control room that does not exist, or that the caller cannot read, is not an error: the run degrades to asking the questions itself and says which answers it could not inherit.

## `people.csv`

The header line is exactly:

```
login,name,role,slack,timezone,groups
```

`login` is the GitHub username and the row's identity. A row in `groups/<g>/people.csv` with a `login` already present at org level **overrides** that row for that group; a `login` not present at org level **adds** a person to the group. `groups` on an org row is the comma-free list of the groups the person belongs to (use `;` between group names, since the file is comma-separated).

`role` is recorded only on the operator's word — never inferred from org membership — because `lead` gates the people-level statistics views.

## Boards

A board is created, field-configured and linked by **the operator runs these** commands, in this order — every one of them needs the `project` scope, which lives on a human token and never on an agent's:

1. `gh auth refresh -s project` — adds the scope to the operator's own `gh` login; without it every command below 403s.
2. `gh project create --owner <org> --title "<title>"` — note the number it prints; that number is the `board:` knob and the `number` column of `boards.md`.
3. `gh project field-list <n> --owner <org> --format json -q '.fields[] | select(.name=="Status") | .id'` — the id of the default Status field.
4. `gh project field-delete --id <field-id>` — the default Status options are not the workflow's states.
5. `gh project field-create <n> --owner <org> --name Status --data-type SINGLE_SELECT --single-select-options "needs-operator,needs-plan,ready,working,for-operator,Done"` — the five state labels plus Done, in that order.
6. `gh project link <n> --owner <org> --repo <owner/repo>` — one call per repo that mirrors onto this board.

Then, in the project's Workflows UI, switch on the four built-in automations, which have no CLI: auto-add `is:issue is:open`, item closed → Done, PR merged → Done, and auto-archive after 14 days.

The mirror itself is one way. `.github/workflows/factory-board.yml` (dev-setup's `assets/factory-board.yml.template`) writes Status from the issue's single state label with the App token; nothing reads the board back, so a card dragged by hand is cosmetic until the next label change.

## Registers

`decisions.md` at every level uses the register line format defined in dev-setup's `references/conventions.md`, installed beside this file — one dated line per decision, append-only, no other metadata. This file does not restate the format; read it there.
