#!/usr/bin/env node
// Session end → one statistics record.
//
// Installed to .vegastack/hooks/session-end.mjs and wired on the SessionEnd event of whichever
// harness the project uses. It is deliberately thin: the payload goes to
// `vegafactory stats record --source <kind>` on stdin and every decision about what a record
// contains lives in TypeScript that `bun test` can reach. A hook that parsed vendor JSON in shell
// would put a parse error inside the user's session, which is exactly where it must never be.
//
// Node rather than sh for the same reason the other hooks in this package are Node: the installer
// guarantees Node, it does not guarantee `jq`, and a hook that silently exits because `jq` is
// missing is a guard that is not there.
//
// Two invariants: it always exits 0, and it never blocks. The record is written synchronously
// (it is a file append), while the push is spawned detached and throttled to at most one per five
// minutes per machine, so closing a session never waits on a network round trip.

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PUSH_THROTTLE_MS = 5 * 60 * 1000

// Claude Code sets CLAUDE_PROJECT_DIR in every hook environment; Codex does not. That one fact is
// the whole harness detection, and it is a fact about the environment rather than a guess from the
// payload's shape.
export function sourceFor(env) {
  return env.CLAUDE_PROJECT_DIR ? 'claude-session-end' : 'codex-session-end'
}

export function shouldPush(markerPath, now) {
  try {
    return now - statSync(markerPath).mtimeMs >= PUSH_THROTTLE_MS
  } catch {
    return true // no marker yet: this machine has not pushed since it booted
  }
}

function main() {
  let payload = ''
  try {
    payload = readFileSync(0, 'utf8')
  } catch {
    return
  }
  const bin = process.env.VSK_VEGAFACTORY || 'vegafactory'
  try {
    spawnSync(bin, ['stats', 'record', '--source', sourceFor(process.env)], {
      input: payload,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  } catch {
    return
  }
  const marker = join(process.env.TMPDIR || tmpdir(), 'vsk-stats-push')
  if (!shouldPush(marker, Date.now())) return
  writeFileSync(marker, new Date().toISOString())
  try {
    const child = spawn(bin, ['stats', 'push', '--commit'], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    // the outbox keeps the records; the next session end, or the daily catch-up, pushes them
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch {
    // a session must never fail to end because nobody could count it
  }
  process.exit(0)
}
