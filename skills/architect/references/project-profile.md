# Project profile — `.vegastack/arch.md`

The per-project memory that stops every session from re-deriving the same facts. It is a
head start, never the source of truth: the repository wins every disagreement.

## First run in a project

If `.vegastack/arch.md` does not exist and the task is architectural:

1. First infer what you can from the repo — package.json/lockfile (runtime), wrangler
   files (Cloudflare; a `d1_databases` binding with no Postgres driver = the D1-only
   product class), Dockerfiles/compose (self-managed), drizzle config (database),
   better-auth usage, `@aws-sdk/client-s3`/R2 bindings (storage), pg-boss dependency
   (jobs), `eve`/`ai` packages (agents vs plain AI features), pubspec.yaml (mobile).
2. Ask MK or the team member only what the repo can't answer, in one short message:
   - Where does this deploy? (Cloudflare Workers via OpenNext · self-managed server ·
     both · exception: Vercel)
   - Stage and kind? (pre-launch or live · internal, client, or oss)
   - Anything non-default? (mobile app, agents, separate workers, unusual services)
3. Write `.vegastack/arch.md` from [the template](../assets/arch-template.md), show it,
   and confirm before relying on it. Creating the file needs the same write authorization
   as any other file.

Never create the file during a purely read-only task or an explanation — suggest it instead.

## Every later run

- Read the file, then trust the repo over it. If the repo disagrees (the file says bun but
  the lockfile is pnpm-lock.yaml; a wrangler.jsonc appeared; a mobile/ directory exists),
  say so and propose the exact one-line file update. Never silently follow a stale profile,
  and never silently rewrite it either.
- Decisions and their dates belong in the `notes:` lines — one line per decision ("2026-08:
  DO for realtime only, dropped for chat — SSE+Postgres instead"). This is the project's
  decision ledger; keep entries short and dated.
- If the file records something that contradicts this skill's defaults, the file wins for
  that project — it is a recorded decision. Report it as accepted risk only if it crosses
  a red line.
