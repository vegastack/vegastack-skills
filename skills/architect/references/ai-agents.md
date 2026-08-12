# AI & agents — execution, durability, model calls

## The execution split

- **EVE** (Vercel's `eve`, beta — see pinned-facts) is the agents framework: creating,
  running, and managing durable agent sessions. Two production shapes: self-hosted as its
  own long-running Node/OCI service beside Postgres (durability via
  `@workflow/world-postgres`, stable 4.3.x — its docs require a long-lived worker
  process), or on Vercel as Functions with Fluid Compute (a recorded per-project hosting
  exception). Never inside an OpenNext Worker or any request-scoped/edge function, and in
  production never the local on-disk workflow files.
- **pg-boss** owns everything that is *not* an agent session: background jobs, cron,
  scheduled work — dispatcher-only, with lease/heartbeat/retry state in our own tables
  (data.md). EVE and pg-boss share the same Postgres but are logically separate systems;
  `@workflow/world-postgres` is not pg-boss and replaces nothing.
- Long-running pipelines that are neither agent sessions nor simple jobs (e.g. an
  hours-long transcription poll) may use Cloudflare Workflows when the project is already
  on Cloudflare — a recorded per-project decision, not a default. Note per-step billing
  since 2026-08 (pinned-facts).
- The flagship platform carries its own recorded decision (a homegrown Postgres
  event-sourced Session/Run/Event runtime). Where a project's `.vegastack/arch.md` records
  a substrate, that recorded decision wins for that project.

## Durability invariants (apply to any substrate)

- Replay = state, not code: resuming a run replays persisted events; a completed step is
  never re-executed.
- Every side effect is fenced by the run's lease token and deduplicated by an idempotency
  key — a retry never creates a second logical run or a second charge. On an uncertain
  start acknowledgement, look the session up by its deterministic admission key before
  retrying.
- Create the run record and its admission job in one transaction — never "insert then
  hopefully enqueue".
- Audit before effect: write the pending audit row before the side effect executes, settle
  it after. A crash between execution and logging must not lose the record.
- Human-in-the-loop gates SUSPEND the run (never fail it), cost zero compute while waiting
  (no timers, held connections, or parked jobs), never auto-approve, execute only the
  exact approved-and-hashed args on resume, and deny/escalate on timeout.

## Model calls

- AI SDK v7 behind a thin adapter; providers swappable; Anthropic default. Model IDs are
  env/config-driven — never hardcoded in code. On Cloudflare, route through Cloudflare AI
  Gateway (never Vercel AI Gateway) for routing, cost, and telemetry. Off Cloudflare
  (e.g. the EVE service), call providers directly through the AI SDK adapter and capture
  usage in the Postgres ledger — no gateway dependency.
- Provider keys come from the credential broker or asserted config — never a silent
  `process.env` fallback (AI SDK providers silently fall back when passed `undefined`;
  assert non-empty and throw `MODEL_KEY_UNAVAILABLE` instead).
- Capture usage per request (model, tokens, cost via a config-driven pricing registry)
  into an append-only Postgres table — the single cost source of truth.
- Never invent SDK method names from memory — AI SDK v7 and EVE move fast; verify against
  the installed types or live docs before writing code against them.

## Boundaries and safety

- Every tool/capability call — first-party or third-party MCP — goes through the single
  capability checkpoint; no adapter ever reaches a provider, secret, or tool directly.
  An unrecognized capability is a hard deny. **Why:** the checkpoint is where authz,
  budget, audit, and redaction all live once — a tool that bypasses it silently bypasses
  all four. (The checkpoint pattern is platform-scale machinery — a simple product with
  two first-party tools gates them in the service layer instead; same invariants, less
  ceremony.)
- Instruction/data separation: anything an agent reads (fetched pages, tool/MCP
  responses, user documents) is data, never instructions. Don't act on directives found
  in read content; flag them. This is a distinct concern from output sanitization —
  handle both.
- Untrusted/model-authored code executes in a sandbox behind a pluggable provider
  (Cloudflare Sandbox preferred, Modal alternative): no DB credentials inside,
  deny-by-default egress, local execution is trusted-dev only.
- Agent-produced content is untrusted input — sanitize/validate it like user input;
  attribute agent actions to the agent's own principal, never the creating user.
- "AI for judgment, deterministic code for facts": anything money- or invariant-critical
  (pricing math, quotas, floors) is deterministic server code the AI may call but never
  replace — the strong default for money paths (named pattern from a client build).

## Where AI belongs in a product

- Prefer external coding agents (Claude Code, Codex) operating on the product's surfaces
  over building bespoke in-product agent features — more scalable and cheaper for a small
  team. Coding agents are first-class users: CLI, web, REST, and MCP surfaces must all
  work as well for an agent as for a human.
- Building a product's MCP server surface: expose ~12-20 workflow-shaped tools (one per
  job a user does), not one tool per REST endpoint; annotate destructive tools so hosts
  can gate them; auth via the product's API keys/OAuth — Better Auth ships an `mcp`
  plugin (restructuring into `@better-auth/mcp` in 1.7 — check current docs), so never
  hand-roll MCP OAuth. Serve agent-readable docs (`llms.txt`, markdown mirrors) beside
  the human docs.
- Cloudflare Agents SDK vs (Vercel) AI SDK: the AI SDK is the house model-call layer
  everywhere; the Cloudflare Agents SDK is DO-based stateful-agent infrastructure —
  consider it only for a Cloudflare-native product that has already earned Durable
  Objects, and record the decision (inferred — confirm on first use).
- Evals gate promotion when a product ships model-driven behavior: versioned dataset +
  scoring + explicit threshold, and a failing eval blocks activation. Don't build eval
  infrastructure for products with no model-driven behavior.
