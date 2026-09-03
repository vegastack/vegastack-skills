// The push — the outbox's only route into the control room, and the only thing here that touches
// a remote.
//
// It is a git push, not an API call: pushes are not REST requests, so the 5,000/hour and
// 80-creates/minute limits that shape the rest of the factory do not apply, and at roughly 500
// bytes a record a thousand runs is half a megabyte — three orders of magnitude under GitHub's
// 100 MB file guidance.
//
// Two properties make it safe to run unattended. Each machine writes its own file
// (`stats/<repo>/<MON-YYYY>/<host>.jsonl`), so two machines pushing at once produce a
// non-fast-forward and never a content conflict — `pull --rebase` and retry is therefore always the
// right answer. And the outbox is dropped only after the push has actually landed: a failed push
// leaves the spool exactly as it was, and the next attempt replays it.
//
// Dry run by default. `pushOutbox` runs no git at all until `commit` is true, so `vegafactory stats
// push` prints what it would do and a caller has to ask for the write.

import { lstatSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
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
}

const REJECTED = /rejected|non-fast-forward|fetch first/i

export async function pushOutbox(options: {
  home: string
  cloneRoot: string
  ghUser: string
  hostname: string
  commit: boolean
  git: GitRunner
  maxRetries?: number
}): Promise<PushResult> {
  const batches = await listOutbox(options.home)
  const plan = planPush(batches, options.cloneRoot, { ghUser: options.ghUser, hostname: options.hostname })
  const pending = batches.filter(batch => plan.copies.some(copy => copy.from === batch.file))
  const records = pending.flatMap(batch => batch.records)
  if (!options.commit || records.length === 0) {
    return { ok: plan.refusals.length === 0, pushed: 0, retries: 0, deferred: [], refusals: plan.refusals }
  }

  for (const batch of pending) {
    const to = controlRoomStatsPath(options.cloneRoot, batch.repo, batch.month, batch.hostname)
    await mkdir(dirname(to), { recursive: true })
    await appendFile(to, `${batch.records.map(serializeRecord).join('\n')}\n`)
  }

  const git = options.git
  const cwd = options.cloneRoot
  await git(['add', 'stats'], cwd)
  await git(['commit', '-m', plan.subject, '-m', plan.body], cwd)

  const maxRetries = options.maxRetries ?? 3
  let retries = 0
  let pushed = false
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const push = await git(['push'], cwd)
    if (push.code === 0) {
      pushed = true
      break
    }
    if (!REJECTED.test(push.stderr) || attempt === maxRetries - 1) break
    await git(['pull', '--rebase'], cwd)
    retries += 1
  }

  if (!pushed) {
    // The spool is the source of truth, so the unpushed commit is dropped rather than left to be
    // duplicated by the next attempt's append. Best effort: if this fails too, the deferred list
    // still names every file the next attempt will replay.
    await git(['reset', '--hard', '@{upstream}'], cwd)
    return { ok: false, pushed: 0, retries, deferred: pending.map(batch => batch.file), refusals: plan.refusals }
  }

  await dropOutboxFiles(pending.map(batch => batch.file))
  return { ok: plan.refusals.length === 0, pushed: records.length, retries, deferred: [], refusals: plan.refusals }
}
