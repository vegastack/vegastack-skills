// The push — the outbox's only route into the control room, and the only thing here that touches
// a remote.
//
// It is a git push, not an API call: pushes are not REST requests, so the 5,000/hour and
// 80-creates/minute limits that shape the rest of the factory do not apply, and at roughly 500
// bytes a record a thousand runs is half a megabyte — three orders of magnitude under GitHub's
// 100 MB file guidance.
//
// Three properties make it safe to run unattended. Each machine writes its own file
// (`stats/<repo>/<MON-YYYY>/<host>.jsonl`), so two machines pushing at once produce a
// non-fast-forward and never a content conflict — `pull --rebase` and retry is therefore always the
// right answer. One push runs at a time on a machine: the dispatcher's tick and a session-end
// hook share one outbox and one clone, and a lock file under the outbox keeps the second of them
// from appending the same records twice or hard-resetting the first one's commit. And the outbox
// is dropped only after the push has actually landed — every git step's exit code is read, so a
// commit that failed and a push that then had nothing to send is a deferred push, not a success —
// and a failed push leaves the spool exactly as it was for the next attempt to replay.
//
// Dry run by default. `pushOutbox` runs no git at all until `commit` is true, so `vegafactory stats
// push` prints what it would do and a caller has to ask for the write.

import { lstatSync } from 'node:fs'
import { appendFile, mkdir, open, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dropOutboxFiles, listOutbox, type OutboxBatch } from './outbox.ts'
import { repoSegment, serializeRecord, type StatsRecord } from './record.ts'

export type GitRunner = (args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

// `stats: <repo> +<n> runs <MON-YYYY> · <gh-user>@<hostname> · <agent>/<model>` — the format the
// epic settled on, so the control room's history reads as a log of who ran what, where.
export function commitSubject(batches: OutboxBatch[], options: { ghUser: string; hostname: string }): string {
  const records = batches.flatMap(batch => batch.records)
  const repos = unique(batches.map(batch => batch.repo)).join(', ')
  const months = unique(batches.map(batch => batch.month)).join(', ')
  const agents = unique(records.map(record => `${record.harness ?? 'unknown'}/${record.model ?? 'unknown'}`)).join(', ')
  return `stats: ${repos} +${records.length} runs ${months} · ${options.ghUser}@${options.hostname} · ${agents}`
}

function totalTokens(record: StatsRecord): number | null {
  const parts = [record.tokens.in, record.tokens.out, record.tokens.cache_read, record.tokens.cache_write]
  if (parts.every(part => part === null)) return null
  return parts.reduce((sum: number, part) => sum + (part ?? 0), 0)
}

// One line per record, so `git log` alone answers "what did that push contain" without a checkout.
// A field the capture could not fill prints as `-`, never as a zero.
export function commitBody(records: StatsRecord[]): string {
  return records.map(record => {
    const tokens = totalTokens(record)
    return [
      record.issue === null ? '#-' : `#${record.issue}`,
      record.stage ?? '-',
      record.outcome ?? '-',
      record.duration_s === null ? '-' : `${record.duration_s}s`,
      tokens === null ? '- tokens' : `${tokens} tokens`,
      record.cost_usd === null ? '$-' : `$${record.cost_usd.toFixed(2)}`,
    ].join(' ')
  }).join('\n')
}

export interface PushPlan {
  copies: { from: string; to: string; lines: number }[]
  subject: string
  body: string
  refusals: string[]
}

// The stats working copy is deliberately NOT #120's read-only clone: `vegafactory sync` refreshes
// that one with `git reset --hard`, which would eat records that are committed but not yet pushed.
export function statsClonePath(home: string, org: string): string {
  return join(home, '.vegastack', 'stats', 'control-room', org)
}

export function controlRoomStatsPath(cloneRoot: string, repo: string, month: string, hostname: string): string {
  return join(cloneRoot, 'stats', repoSegment(repo), month, `${hostname}.jsonl`)
}

export function planPush(batches: OutboxBatch[], cloneRoot: string, options: { ghUser: string; hostname: string }): PushPlan {
  const copies: PushPlan['copies'] = []
  const refusals: string[] = []
  for (const batch of batches) {
    const to = controlRoomStatsPath(cloneRoot, batch.repo, batch.month, batch.hostname)
    try {
      // Same fail-closed rule as the outbox: a symlinked target would make "append counts" mean
      // "append wherever that link points", inside a repository that gets pushed.
      if (!lstatSync(to).isFile()) {
        refusals.push(`refusing to write ${to} — it is not a regular file`)
        continue
      }
    } catch {
      // missing is the normal case
    }
    copies.push({ from: batch.file, to, lines: batch.records.length })
  }
  return {
    copies,
    subject: commitSubject(batches, options),
    body: commitBody(batches.flatMap(batch => batch.records)),
    refusals,
  }
}

export interface PushResult {
  ok: boolean
  pushed: number
  retries: number
  deferred: string[]
  refusals: string[]
  // Another push on this machine held the lock; nothing was touched and the outbox will be
  // replayed by the next attempt.
  locked: boolean
}

const REJECTED = /rejected|non-fast-forward|fetch first/i

// --- one push at a time per machine ------------------------------------------------------

export function pushLockPath(home: string): string {
  return join(home, '.vegastack', 'stats', 'push.lock')
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// Created exclusively (`wx`), so two processes racing for it cannot both win. A lock whose pid is
// gone is a push that died mid-way and is taken over; a lock nobody can parse is treated the same,
// because a file no process can clear would otherwise stop every push on the machine for good.
async function acquirePushLock(path: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, 'wx')
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`)
      await handle.close()
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false
    }
    let pid: number | null = null
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as { pid?: unknown }
      if (typeof parsed.pid === 'number') pid = parsed.pid
    } catch {
      pid = null
    }
    if (pid !== null && pidAlive(pid)) return false
    await rm(path, { force: true })
  }
  return false
}

export async function pushOutbox(options: {
  home: string
  cloneRoot: string
  ghUser: string
  hostname: string
  commit: boolean
  git: GitRunner
  maxRetries?: number
}): Promise<PushResult> {
  const dry = await listOutbox(options.home)
  const dryPlan = planPush(dry, options.cloneRoot, { ghUser: options.ghUser, hostname: options.hostname })
  if (!options.commit || dry.every(batch => batch.records.length === 0)) {
    return { ok: dryPlan.refusals.length === 0, pushed: 0, retries: 0, deferred: [], refusals: dryPlan.refusals, locked: false }
  }

  const lock = pushLockPath(options.home)
  if (!(await acquirePushLock(lock))) {
    return { ok: false, pushed: 0, retries: 0, deferred: dry.map(batch => batch.file), refusals: dryPlan.refusals, locked: true }
  }
  try {
    // Listed again under the lock: the push that just released it may have dropped files this
    // process listed a moment ago, and appending those would be the duplication the lock exists
    // to prevent.
    const batches = await listOutbox(options.home)
    const plan = planPush(batches, options.cloneRoot, { ghUser: options.ghUser, hostname: options.hostname })
    const pending = batches.filter(batch => plan.copies.some(copy => copy.from === batch.file))
    const records = pending.flatMap(batch => batch.records)
    if (records.length === 0) {
      return { ok: plan.refusals.length === 0, pushed: 0, retries: 0, deferred: [], refusals: plan.refusals, locked: false }
    }

    for (const batch of pending) {
      const to = controlRoomStatsPath(options.cloneRoot, batch.repo, batch.month, batch.hostname)
      await mkdir(dirname(to), { recursive: true })
      await appendFile(to, `${batch.records.map(serializeRecord).join('\n')}\n`)
    }

    const git = options.git
    const cwd = options.cloneRoot
    const maxRetries = options.maxRetries ?? 3
    let retries = 0
    let pushed = false
    try {
      // Every step's exit code counts. `git push` on a clone with nothing new exits 0, so a commit
      // that failed and was not checked would read as a push that landed, and the outbox would be
      // dropped with the records sitting uncommitted in the clone.
      const staged = await git(['add', 'stats'], cwd)
      const committed = staged.code === 0 ? await git(['commit', '-m', plan.subject, '-m', plan.body], cwd) : staged
      if (committed.code === 0) {
        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
          const push = await git(['push'], cwd)
          if (push.code === 0) {
            pushed = true
            break
          }
          if (!REJECTED.test(push.stderr) || attempt === maxRetries - 1) break
          const rebased = await git(['pull', '--rebase'], cwd)
          if (rebased.code !== 0) {
            // A rebase that stopped leaves the clone mid-rebase; pushing again from there, or
            // hard-resetting over it, is worse than aborting and replaying the spool next time.
            await git(['rebase', '--abort'], cwd)
            break
          }
          retries += 1
        }
      }
    } catch {
      // git missing, or the clone is not a repository: the same failure path as a rejected push.
      pushed = false
    }

    if (!pushed) {
      // The spool is the source of truth, so the unpushed commit is dropped rather than left to be
      // duplicated by the next attempt's append. Best effort: if this fails too, the deferred list
      // still names every file the next attempt will replay.
      try {
        await git(['reset', '--hard', '@{upstream}'], cwd)
      } catch {
        // nothing more to try; the deferred list below is the honest answer
      }
      return { ok: false, pushed: 0, retries, deferred: pending.map(batch => batch.file), refusals: plan.refusals, locked: false }
    }

    await dropOutboxFiles(pending.map(batch => batch.file))
    return { ok: plan.refusals.length === 0, pushed: records.length, retries, deferred: [], refusals: plan.refusals, locked: false }
  } finally {
    await rm(lock, { force: true })
  }
}
