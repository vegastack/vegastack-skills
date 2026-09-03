#!/usr/bin/env node
// SessionStart context — every session opens knowing what needs the operator and which
// worktree claim this checkout holds.
//
// Installed to .vegastack/hooks/session-start.mjs. Reads dev-status's status.mjs and renders
// at most five plain lines. It never blocks and never fails a session: every error path
// prints nothing and exits 0.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_LINES = 5
const WORKTREE = /\.vegastack\/\.worktrees\/(\d+)-([^/]+)/g

// The claim this checkout holds, read from the path alone — no git, no network.
export function worktreeClaim(cwd) {
  if (typeof cwd !== 'string') return null
  // The LAST segment wins: a checkout nested inside another worktree is claimed by the
  // innermost one, which is the tree the session is actually working in.
  const matches = [...cwd.matchAll(WORKTREE)]
  if (matches.length === 0) return null
  const match = matches[matches.length - 1]
  return { number: Number(match[1]), slug: match[2] }
}

export function sessionMarkerPath(sessionId, tmp) {
  return join(tmp, 'vsk-session-' + sessionId)
}

// The hook carries its own copies of the control-room knob grammar and the machine state read:
// hooks are installed standalone into consumer projects and cannot import the CLI or a sibling
// skill. Every helper is total — a session never fails over its opening context.

// The machine-local state document, `<home>/.vegastack/factory.json`, is the one place that knows
// where an org's clone lives and when it was last successfully fetched.
export function readSyncState(configText, org) {
  if (typeof configText !== 'string') return null
  let parsed
  try {
    parsed = JSON.parse(configText)
  } catch {
    return null
  }
  const entry = parsed && parsed.controlRooms && parsed.controlRooms[org]
  if (!entry || typeof entry !== 'object') return null
  return {
    lastSyncedAt: typeof entry.lastSyncedAt === 'string' ? entry.lastSyncedAt : null,
    path: typeof entry.path === 'string' ? entry.path : null,
  }
}

export function syncTarget(devMdText, home, configText = null) {
  const match = /^control-room:\s*([^\s#]+)(#[^\s]*)?/m.exec(String(devMdText ?? ''))
  if (!match) return null
  const repo = match[1]
  if (repo === 'none' || !repo.includes('/')) return null
  const org = repo.split('/')[0]
  const age = /^sync-max-age:\s*(\d+)\s*([mh])/m.exec(String(devMdText ?? ''))
  const value = age ? Number(age[1]) : 0
  const maxAgeMinutes = age && Number.isFinite(value) && value > 0 ? (age[2] === 'h' ? value * 60 : value) : 30
  const state = readSyncState(configText, org)
  return { org, path: (state && state.path) || join(home, '.vegastack/control-room', org), maxAgeMinutes }
}

// Freshness is measured from the last successful fetch, never from the clone directory's mtime:
// a fetch that finds nothing new leaves mtime untouched, so an unchanged control room would look
// permanently stale and re-fetch on every session.
export function shouldSync({ lastSyncedAt, now, maxAgeMinutes }) {
  if (typeof lastSyncedAt !== 'string') return true
  const at = Date.parse(lastSyncedAt)
  if (!Number.isFinite(at)) return true
  return now - at >= maxAgeMinutes * 60_000
}

function item(issue) {
  return `#${issue.number} ${issue.title}`
}

export function renderContext(status, { cwd, states }) {
  const repo = (status && status.repo) || ''
  const board = (status && status.board) || {}
  const bucket = (name) => (Array.isArray(board[name]) ? board[name] : [])
  const [needsOperator, , ready, working, forOperator] = states.map(bucket)

  const yours = [...needsOperator, ...forOperator].sort((a, b) => a.number - b.number)
  const inFlight = ready.length + working.length
  if (yours.length === 0 && inFlight === 0) return [`${repo}: nothing on the board needs you.`]

  const lines = []
  if (yours.length > 0) {
    lines.push(repo + ': ' + yours.length + ' need you — ' + yours.slice(0, 2).map(item).join(', ') + '.')
  } else {
    lines.push(repo + ': nothing needs you right now.')
  }
  if (inFlight > 0) lines.push(ready.length + ' ready, ' + working.length + ' in flight.')
  const orphans = working.filter((issue) => issue.possiblyOrphaned)
  if (orphans.length > 0) lines.push(`Ledger quiet, so possibly orphaned: ${orphans.map(item).join(', ')}.`)

  const claim = worktreeClaim(cwd)
  if (claim) {
    const state = states.find((name) => bucket(name).some((issue) => issue.number === claim.number))
    lines.push(`Your claim: this checkout is worktree ${claim.number}-${claim.slug}, state ${state || 'unknown'}.`)
  }
  return lines.slice(0, MAX_LINES)
}

// --- CLI -----------------------------------------------------------------------------

const STATUS_CANDIDATES = [
  '.claude/skills/dev-status/scripts/status.mjs',
  '.agents/skills/dev-status/scripts/status.mjs',
  join(homedir(), '.claude/skills/dev-status/scripts/status.mjs'),
  join(homedir(), '.agents/skills/dev-status/scripts/status.mjs'),
]

function resolveStatusScript() {
  const named = process.env.VSK_STATUS_SCRIPT
  if (named && existsSync(named)) return named
  return STATUS_CANDIDATES.find((path) => existsSync(path)) || null
}

function readStatus(script) {
  for (const args of [[script, '--me', '--json'], [script, '--json']]) {
    try {
      return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
    } catch {
      // fall through to the plainer call, then give up
    }
  }
  return null
}

function flag(argv, name) {
  const index = argv.indexOf(name)
  if (index === -1 || index === argv.length - 1) return null
  return argv[index + 1]
}

function readIfPresent(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  } catch {
    return null
  }
}

function maybeSync() {
  try {
    const devMdText = readIfPresent(join(process.cwd(), '.vegastack/dev.md'))
    if (devMdText === null) return
    const configText = readIfPresent(join(homedir(), '.vegastack/factory.json'))
    const target = syncTarget(devMdText, homedir(), configText)
    if (!target) return
    const state = readSyncState(configText, target.org)
    if (!shouldSync({ lastSyncedAt: state && state.lastSyncedAt, now: Date.now(), maxAgeMinutes: target.maxAgeMinutes })) return
    spawn('vegafactory', ['sync', '--json'], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // no vegafactory on PATH, or nothing readable: the clone stays as it is
  }
}

function main(argv) {
  const harness = flag(argv, '--harness')
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    payload = {}
  }
  const script = resolveStatusScript()
  if (!script) return
  const status = readStatus(script)
  if (!status) return

  if (payload && typeof payload.session_id === 'string' && payload.session_id) {
    try {
      writeFileSync(sessionMarkerPath(payload.session_id, tmpdir()), new Date().toISOString())
    } catch {
      // a marker we cannot write only costs the Stop heartbeat its silence
    }
  }
  maybeSync()

  const states = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator']
  const lines = renderContext(status, { cwd: process.cwd(), states })
  if (lines.length === 0) return
  const text = lines.join('\n')
  if (harness === 'codex') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }))
  } else {
    process.stdout.write(text + '\n')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch {
    // never fail a session over its opening context
  }
  process.exit(0)
}
