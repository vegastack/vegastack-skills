// The control-room knob and the machine-local sync state — pure functions only.
//
// One org, one shallow clone: `~/.vegastack/control-room/<org>/`. Which clone belongs to which
// org, and when each was last successfully fetched, lives in one machine-local state document at
// `~/.vegastack/factory.json` — never in the repository, because freshness is a property of this
// machine and not of the code. Everything here is total and side-effect free so every branch is
// unit-testable; the effectful half lives in `sync.ts`.

import { join } from 'node:path'

export interface ControlRoomKnob {
  org: string
  repo: string
  group: string | null
  sha: string | null
}

export interface ControlRoomEntry {
  repo: string
  path: string
  branch: string
  remote?: string
  lastSyncedAt: string | null
  sha: string | null
}

export interface FactoryConfig {
  schemaVersion: 1
  controlRooms: Record<string, ControlRoomEntry>
}

const DEFAULT_MAX_AGE_MINUTES = 30

// `control-room: <org>/<repo>#<group>@<sha7>` — group and sha are both optional, and the value
// stops at the first whitespace so the trailing `# comment` every knob line carries is ignored.
export function parseControlRoomKnob(devMdText: string): ControlRoomKnob | null {
  const match = /^control-room:\s*([^\s#]+)(#[^\s]*)?/m.exec(devMdText ?? '')
  if (!match) return null
  const repo = match[1]!
  if (repo === 'none' || !repo.includes('/')) return null
  const org = repo.split('/')[0]!
  const tail = (match[2] ?? '').replace(/^#/, '')
  const [groupPart, shaPart] = tail.split('@')
  const group = groupPart ? groupPart : null
  const sha = shaPart ? shaPart : null
  return { org, repo, group, sha }
}

// Freshness is a duration, not a timestamp: `<n>m` or `<n>h`. Anything unparseable falls back to
// the default rather than disabling the refresh, because a typo must not silently freeze a clone.
export function parseSyncMaxAge(devMdText: string): number {
  const match = /^sync-max-age:\s*(\d+)\s*([mh])/m.exec(devMdText ?? '')
  if (!match) return DEFAULT_MAX_AGE_MINUTES
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_AGE_MINUTES
  return match[2] === 'h' ? value * 60 : value
}

export function defaultClonePath(org: string, home: string): string {
  return join(home, '.vegastack', 'control-room', org)
}

export function factoryConfigPath(home: string): string {
  return join(home, '.vegastack', 'factory.json')
}

// A missing state file is an empty config — the first sync writes it. An unreadable one throws:
// silently resetting it would drop every other org's clone record and re-clone the world.
export function readFactoryConfig(text: string | null): FactoryConfig {
  if (text === null || text === undefined || text.trim() === '') return { schemaVersion: 1, controlRooms: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('~/.vegastack/factory.json is not valid JSON — fix or delete it')
  }
  const controlRooms: Record<string, ControlRoomEntry> = {}
  const raw = (parsed as { controlRooms?: unknown } | null)?.controlRooms
  if (raw && typeof raw === 'object') {
    for (const [org, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) controlRooms[org] = entry as ControlRoomEntry
    }
  }
  return { schemaVersion: 1, controlRooms }
}

export function withSyncResult(config: FactoryConfig, org: string, entry: ControlRoomEntry): FactoryConfig {
  return { schemaVersion: 1, controlRooms: { ...config.controlRooms, [org]: entry } }
}

// Age is measured from the last successful fetch, never from the clone directory's mtime: a fetch
// that finds nothing new leaves mtime untouched, so an unchanged control room would look
// permanently stale and re-fetch on every session.
export function ageMinutes(lastSyncedAt: string | null, now: number): number | null {
  if (!lastSyncedAt) return null
  const at = Date.parse(lastSyncedAt)
  if (!Number.isFinite(at)) return null
  return Math.floor((now - at) / 60_000)
}

export function isStale(lastSyncedAt: string | null, now: number, maxAgeMinutes: number): boolean {
  const age = ageMinutes(lastSyncedAt, now)
  if (age === null) return true
  return age >= maxAgeMinutes
}
