#!/usr/bin/env node
// Stop heartbeat — one nudge, once per session, when a session holding a `working` claim is
// about to stop with a ledger it never touched.
//
// Installed to .vegastack/hooks/stop-heartbeat.mjs and wired on the Stop event. It says
// nothing about context budgets: a countdown makes a session stop early, which is the exact
// failure this hook exists to prevent.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const HEARTBEAT_REASON = 'checkpoint the ledger before stopping'

const WORKTREE = /\.vegastack\/\.worktrees\/(\d+)-([^/]+)/g

// Re-implemented rather than imported: hook files are installed standalone into consumer
// projects, and a missing sibling module would break every session.
export function worktreeClaim(cwd) {
  if (typeof cwd !== 'string') return null
  // The LAST segment wins: a checkout nested inside another worktree is claimed by the
  // innermost one, which is the tree the session is actually working in.
  const matches = [...cwd.matchAll(WORKTREE)]
  if (matches.length === 0) return null
  const match = matches[matches.length - 1]
  return { number: Number(match[1]), slug: match[2] }
}

// A pure guard chain: the first closed gate is the answer, and its name is the `why`.
export function shouldNudge({ stopHookActive, worktree, issueState, ledgerUpdatedAt, sessionStartedAt, alreadyNudged }) {
  if (stopHookActive) return { nudge: false, why: 're-entered stop hook' }
  if (alreadyNudged) return { nudge: false, why: 'already nudged this session' }
  if (!worktree) return { nudge: false, why: 'not inside a feature worktree' }
  if (issueState !== 'working') return { nudge: false, why: `the issue is ${issueState || 'in no workflow state'}` }
  if (!sessionStartedAt) return { nudge: false, why: 'no session marker, so the session start is unknown' }
  if (!ledgerUpdatedAt) return { nudge: true, why: 'no ledger comment yet' }
  const ledger = Date.parse(ledgerUpdatedAt)
  const started = Date.parse(sessionStartedAt)
  if (!Number.isFinite(ledger) || !Number.isFinite(started)) return { nudge: false, why: 'unreadable timestamps' }
  if (ledger >= started) return { nudge: false, why: 'ledger written this session' }
  return { nudge: true, why: 'ledger untouched this session' }
}

// --- CLI -----------------------------------------------------------------------------

// Mirrors dev-implement's scripts/lib/gh.mjs exactly: execFileSync with an argument array,
// no shell, no string interpolation. VSK_GH is a TEST SEAM only, never set in a real run.
function ghJson(args) {
  const out = execFileSync(process.env.VSK_GH || 'gh', args, { encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024 })
  return JSON.parse(out)
}

function ledgerUpdatedAt(comments) {
  let latest = null
  for (const comment of comments) {
    if (/<!--\s*vsk:v1\s+[^>]*type=ledger/.test(comment.body || '')) latest = comment.updated_at
  }
  return latest
}

function repoSlug() {
  return ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return
  }
  const worktree = worktreeClaim(process.cwd())
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : ''
  const marker = sessionId ? join(tmpdir(), 'vsk-session-' + sessionId) : ''
  const nudged = sessionId ? join(tmpdir(), 'vsk-heartbeat-' + sessionId) : ''
  const sessionStartedAt = marker && existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null

  const early = shouldNudge({
    stopHookActive: Boolean(payload.stop_hook_active),
    worktree,
    issueState: 'working',
    ledgerUpdatedAt: null,
    sessionStartedAt,
    alreadyNudged: Boolean(nudged && existsSync(nudged)),
  })
  // Everything above is free; only a session that could still nudge pays for the two gh calls.
  if (!early.nudge) return

  const slug = repoSlug()
  const labels = ghJson(['issue', 'view', String(worktree.number), '-R', slug, '--json', 'labels']).labels || []
  const states = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator']
  const issueState = labels.map((label) => label.name).find((name) => states.includes(name)) || null
  const comments = ghJson(['api', 'repos/' + slug + '/issues/' + worktree.number + '/comments', '--paginate'])

  const verdict = shouldNudge({
    stopHookActive: Boolean(payload.stop_hook_active),
    worktree,
    issueState,
    ledgerUpdatedAt: ledgerUpdatedAt(Array.isArray(comments) ? comments : []),
    sessionStartedAt,
    alreadyNudged: false,
  })
  if (!verdict.nudge) return
  if (nudged) writeFileSync(nudged, new Date().toISOString())
  process.stdout.write(JSON.stringify({ decision: 'block', reason: HEARTBEAT_REASON }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch {
    // a heartbeat that cannot reach GitHub stays silent rather than blocking a stop
  }
  process.exit(0)
}
