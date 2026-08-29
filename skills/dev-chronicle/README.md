# dev-chronicle

The project's narrative memory. Every behavior-changing branch carries one story-language entry in `.vegastack/chronicle.md` — what exists now that didn't, why it was built, and the honest one-liner on how it went — written for the operator who returns months later remembering nothing. The changelog tells consumers what changed; the chronicle tells the operator what happened. "Catch me up on this project" renders the digest: the story so far, recent chapters, open threads — read from the chronicle and the decision register only, never git archaeology. The agent entry point is [SKILL.md](SKILL.md).

## Install

```sh
npx @vegastack/skills add dev-chronicle
```

## What's in this skill

| Path | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Agent entry point — the entry format and the digest |
| references/conventions.md (installed copy) | The workflow artifact spec, duplicated into every dev-family install |
| [refresh/REFRESH.md](refresh/REFRESH.md) | Freshness contract (evergreen waiver) |
| [agents/openai.yaml](agents/openai.yaml) | Codex interface metadata |
| `tests/` | Bun tests and fixtures (never packaged) |

## Behavior

dev-implement writes the entries at hand-back (branch-carried, landing atomically with the merge); dev-ship's ship-gate checks presence when dev.md says `chronicle: on`; this skill owns the format and the reading modes. Entries are append-only story — titles name outcomes, never mechanisms; "How it went" is where honesty lives. The digest scales to the ask, and a young project gets short honest answers, never padding.
