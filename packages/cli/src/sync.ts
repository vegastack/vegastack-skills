// The control-room sync engine — the only effectful half of the verb.
//
// Refreshing a shallow clone nobody edits by hand: fetch, hard reset, record the sha. Every
// refusal is fail-closed and names the path it refused, because the one thing worse than a stale
// control room is a silently discarded local edit. The clone is read-only to this module: it
// never commits and never pushes.

import { execFile } from 'node:child_process'
import { lstat, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'
import {
  ageMinutes, defaultClonePath, isStale, parseControlRoomKnob, withSyncResult,
  type ControlRoomEntry, type FactoryConfig,
} from './control-room.ts'

const run = promisify(execFile)

// The teammate's existing gh credential, injected per invocation: no token ever reaches argv, a
// remote URL, or the clone's own config. The empty first value resets any inherited helper chain
// so only this one applies.
export const GIT_CREDENTIAL_ARGS: readonly string[] = [
  '-c', 'credential.helper=',
  '-c', 'credential.helper=!gh auth git-credential',
] as const

export interface SyncTarget {
  org: string
  repo: string
  group: string | null
  clonePath: string
  branch: string
  remote: string
  recordedSha: string | null
}

export interface SyncResult {
  ok: boolean
  action: 'clone' | 'refresh' | 'fresh' | 'stale' | 'refused'
  org: string
  path: string
  sha: string | null
  lastSyncedAt: string | null
  ageMinutes: number | null
  message: string
  config: FactoryConfig
}

async function git(args: string[], options: { cwd?: string } = {}) {
  // GIT_TERMINAL_PROMPT=0 turns a missing credential into a failure instead of a hung process —
  // this runs unattended from a hook and a dispatcher tick.
  return run('git', args, { cwd: options.cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
}

async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink()
  } catch {
    return false
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

// The profile names the room; `org` is the bootstrap path for a repo whose profile does not yet —
// the first dev-setup run — and resolves the room by the fixed convention the profile template
// hardcodes, `<org>/vegafactory-control-room`. A profile that names a different org wins, loudly.
export function resolveTarget(input: { devMdText: string; config: FactoryConfig; home: string; org?: string }): SyncTarget | null {
  const fromProfile = parseControlRoomKnob(input.devMdText)
  const org = input.org?.trim()
  if (fromProfile && org && fromProfile.org !== org) {
    throw new Error(`--org ${org} disagrees with the profile's control-room: ${fromProfile.repo} — edit the knob rather than passing another org`)
  }
  const knob = fromProfile ?? (org ? { org, repo: `${org}/vegafactory-control-room`, group: null, sha: null } : null)
  if (!knob) return null
  const entry = input.config.controlRooms[knob.org]
  return {
    org: knob.org,
    repo: entry?.repo ?? knob.repo,
    group: knob.group,
    clonePath: entry?.path ?? defaultClonePath(knob.org, input.home),
    branch: entry?.branch ?? 'main',
    remote: entry?.remote ?? `https://github.com/${knob.repo}.git`,
    recordedSha: knob.sha,
  }
}

export function planSync(input: {
  cloneExists: boolean
  lastSyncedAt: string | null
  now: number
  maxAgeMinutes: number
  force: boolean
}): { action: 'clone' | 'refresh' | 'fresh'; reason: string } {
  if (!input.cloneExists) return { action: 'clone', reason: 'no local clone yet' }
  if (input.force) return { action: 'refresh', reason: 'forced' }
  if (isStale(input.lastSyncedAt, input.now, input.maxAgeMinutes)) {
    return { action: 'refresh', reason: `last fetch older than ${input.maxAgeMinutes}m` }
  }
  return { action: 'fresh', reason: `fetched within ${input.maxAgeMinutes}m` }
}

export async function syncControlRoom(input: {
  target: SyncTarget
  config: FactoryConfig
  now: number
  maxAgeMinutes?: number
  force?: boolean
  dryRun?: boolean
}): Promise<SyncResult> {
  const { target, config, now } = input
  const maxAgeMinutes = input.maxAgeMinutes ?? 30
  const previous: ControlRoomEntry | undefined = config.controlRooms[target.org]
  const lastSyncedAt = previous?.lastSyncedAt ?? null
  const base = {
    org: target.org,
    path: target.clonePath,
    sha: previous?.sha ?? null,
    lastSyncedAt,
    ageMinutes: ageMinutes(lastSyncedAt, now),
    config,
  }

  // Symlink refusals come before any git call: a symlinked clone path or state directory is how a
  // hard reset reaches files it was never meant to touch.
  for (const path of [target.clonePath, dirname(target.clonePath)]) {
    if (await isSymlink(path)) {
      return { ...base, ok: false, action: 'refused', message: `refusing to sync: ${path} is a symlink` }
    }
  }

  const cloneExists = await exists(`${target.clonePath}/.git`)
  const plan = planSync({ cloneExists, lastSyncedAt, now, maxAgeMinutes, force: input.force ?? false })

  if (plan.action === 'fresh') {
    return { ...base, ok: true, action: 'fresh', message: `control room ${target.org}: ${plan.reason}` }
  }
  if (input.dryRun) {
    return { ...base, ok: true, action: plan.action, message: `would ${plan.action} ${target.clonePath} (${plan.reason})` }
  }

  try {
    if (plan.action === 'clone') {
      await git([...GIT_CREDENTIAL_ARGS, 'clone', '--depth', '1', '--branch', target.branch, target.remote, target.clonePath])
    } else {
      // Never reset a clone somebody edited: refuse, name the path, and leave the edit alone.
      const dirty = (await git(['-C', target.clonePath, 'status', '--porcelain'])).stdout.trim()
      if (dirty) {
        return {
          ...base,
          ok: false,
          action: 'refused',
          message: `refusing to reset ${target.clonePath}: it has local modifications — nobody should hand-edit the clone`,
        }
      }
      // The remote and branch come from the machine config on every refresh, not from what the
      // clone was created with: editing `remote` or `branch` in factory.json is the documented way
      // to point a machine at a different control room, and a fetch of the baked-in `origin` would
      // report success while still reading the old room. FETCH_HEAD is what the fetch just wrote,
      // whichever branch it was — a `--depth 1 --branch` clone tracks only its original branch.
      await git(['-C', target.clonePath, 'remote', 'set-url', 'origin', target.remote])
      await git([...GIT_CREDENTIAL_ARGS, '-C', target.clonePath, 'fetch', '--depth', '1', 'origin', target.branch])
      await git(['-C', target.clonePath, 'reset', '--hard', 'FETCH_HEAD'])
    }
  } catch (error) {
    const reason = (error as Error).message.split('\n')[0] ?? 'git failed'
    // A first clone that fails has nothing to fall back on; an existing clone stands and the
    // caller is told how old it is.
    if (!cloneExists) {
      return { ...base, ok: false, action: 'refused', message: `cannot clone ${target.repo}: ${reason}` }
    }
    return { ...base, ok: false, action: 'stale', message: `refresh failed: ${reason}` }
  }

  const sha = (await git(['-C', target.clonePath, 'rev-parse', '--short=7', 'HEAD'])).stdout.trim()
  const syncedAt = new Date(now).toISOString()
  const entry: ControlRoomEntry = {
    repo: target.repo,
    path: target.clonePath,
    branch: target.branch,
    ...(previous?.remote ? { remote: target.remote } : {}),
    lastSyncedAt: syncedAt,
    sha,
  }
  return {
    ok: true,
    action: plan.action,
    org: target.org,
    path: target.clonePath,
    sha,
    lastSyncedAt: syncedAt,
    ageMinutes: 0,
    message: `control room ${target.org}: synced ${sha}`,
    config: withSyncResult(config, target.org, entry),
  }
}
