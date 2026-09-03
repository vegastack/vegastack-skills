#!/usr/bin/env node
// Decision nudge — at most once per session, and only when the last message smells
// directional, ask whether this session settled something the decisions register should hold.
//
// Installed to .vegastack/hooks/decision-nudge.mjs and wired on the Stop event. It replaces
// the inline shell recipe this skill used to carry: Node is guaranteed by the installer while
// `jq` is not, and a hook that silently exits because `jq` is missing is a guard that is not
// there. The prose instruction in the AGENTS.md dev section remains the portable base; this
// is a deterministic nudge on top of it, not a replacement.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const NUDGE_REASON =
  'Before finishing: if this session settled a directional choice (the Decisions test in .vegastack/dev.md), propose one dated register line and ask the user to confirm; otherwise finish.'

const DIRECTIONAL = /decided|chose|instead of|convention|from now on|standardi[sz]|switch(ed|ing)? to/i

export function isDirectional(message) {
  return typeof message === 'string' && DIRECTIONAL.test(message)
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return
  }
  if (payload.stop_hook_active) return
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : ''
  if (!sessionId) return
  const marker = join(tmpdir(), 'vsk-decision-nudge-' + sessionId)
  if (existsSync(marker)) return
  if (!isDirectional(payload.last_assistant_message)) return
  writeFileSync(marker, new Date().toISOString())
  process.stdout.write(JSON.stringify({ decision: 'block', reason: NUDGE_REASON }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch {
    // never break a stop over a nudge
  }
  process.exit(0)
}
