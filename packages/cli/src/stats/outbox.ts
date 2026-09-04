// The outbox — the machine-local spool every record lands in before it ever reaches the network.
//
// Two reasons it exists rather than writing straight into the control-room clone. First, #120's
// clone is refreshed with `git reset --hard`, so a record written there would be eaten by the next
// sync. Second, a run must never wait on, or fail because of, a push: the record is on disk the
// moment the run ends, and the push is a separate, retryable step that leaves the spool alone
// until it has actually landed.
//
// One file per repo, per month, per machine: `~/.vegastack/stats/outbox/<repo>/<MON-YYYY>/<host>.jsonl`.
// Two machines therefore never write the same file, which is what makes the push a fast-forward
// append instead of a merge.
//
// Every write target is `lstat`ed first and refused if it is anything but a missing path or a
// regular file. A symlinked outbox file would turn "append a line of counts" into "append to
// whatever that link points at", and a spool that follows links is a spool that can be aimed.

import { appendFile, lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  monthToken, recordProblems, repoSegment, serializeRecord,
  type SkillInvocation, type StatsRecord,
} from './record.ts'

export class OutboxRefusal extends Error {}

export function outboxRoot(home: string): string {
  return join(home, '.vegastack', 'stats', 'outbox')
}

function sessionRoot(home: string): string {
  return join(home, '.vegastack', 'stats', 'sessions')
}

// A hostname is a filename here, so it is reduced to one lowercase segment. The domain suffix goes
// because `mini.local` and `mini.lan` are the same machine on two networks, and one machine that
// writes two files a month is one machine the rollup counts twice.
export function sanitizeHostname(raw: string): string {
  const base = String(raw ?? '').split('.')[0] ?? ''
  const cleaned = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'unknown-host' : cleaned
}

function safeSegment(raw: string, fallback: string): string {
  const cleaned = String(raw ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '')
  return cleaned === '' ? fallback : cleaned
}

export function outboxFile(home: string, repo: string, month: string, hostname: string): string {
  return join(outboxRoot(home), repoSegment(repo), month, `${sanitizeHostname(hostname)}.jsonl`)
}

export interface OutboxBatch {
  file: string
  repo: string
  month: string
  hostname: string
  records: StatsRecord[]
}

async function refuseIrregular(path: string): Promise<void> {
  let stats
  try {
    stats = await lstat(path)
  } catch {
    return // a missing path is the normal case: the first record of the month creates it
  }
  if (!stats.isFile()) throw new OutboxRefusal(`refusing to write ${path} — it is not a regular file`)
}

export async function appendRecord(home: string, record: StatsRecord, hostname: string): Promise<string> {
  const problems = recordProblems(record)
  if (problems.length > 0) throw new OutboxRefusal(`refusing to write an unusable record: ${problems.join('; ')}`)
  const file = outboxFile(home, record.repo, monthToken(new Date(record.ts)), hostname)
  await mkdir(dirname(file), { recursive: true })
  await refuseIrregular(file)
  await appendFile(file, `${serializeRecord(record)}\n`)
  return file
}

async function readdirSafe(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort()
  } catch {
    return []
  }
}

// A corrupt line is skipped, never fatal: a half-written record from a machine that lost power is
// one lost run, while a parser that throws on it strands every good record behind it forever.
export async function listOutbox(home: string): Promise<OutboxBatch[]> {
  const root = outboxRoot(home)
  const batches: OutboxBatch[] = []
  for (const repoDir of await readdirSafe(root)) {
    for (const month of await readdirSafe(join(root, repoDir))) {
      for (const entry of await readdirSafe(join(root, repoDir, month))) {
        if (!entry.endsWith('.jsonl')) continue
        const file = join(root, repoDir, month, entry)
        let text: string
        try {
          text = await readFile(file, 'utf8')
        } catch {
          continue
        }
        const records: StatsRecord[] = []
        for (const line of text.split('\n')) {
          if (line.trim() === '') continue
          try {
            records.push(JSON.parse(line) as StatsRecord)
          } catch {
            // skipped on purpose — see the comment above
          }
        }
        batches.push({
          file,
          // The record's own `repo` is the authority; the directory name is a filename-safe
          // rendering of it and cannot always be turned back into `owner/name`.
          repo: records[0]?.repo ?? repoDir.replace('__', '/'),
          month,
          hostname: entry.replace(/\.jsonl$/, ''),
          records,
        })
      }
    }
  }
  return batches
}

export async function dropOutboxFiles(files: string[]): Promise<void> {
  for (const file of files) await rm(file, { force: true })
}

// --- the per-session skill sidecar --------------------------------------------------------
//
// Skill invocations are captured by hooks that fire long before the session's own record exists,
// so they accumulate in a per-session file that the session-end capture folds in and deletes.

export function sessionSidecar(home: string, sessionId: string): string {
  return join(sessionRoot(home), `${safeSegment(sessionId, 'unknown-session')}.skills.jsonl`)
}

export async function appendSkillInvocations(home: string, sessionId: string, invocations: SkillInvocation[]): Promise<void> {
  if (invocations.length === 0) return
  const file = sessionSidecar(home, sessionId)
  await mkdir(dirname(file), { recursive: true })
  await refuseIrregular(file)
  await appendFile(file, `${invocations.map(entry => JSON.stringify(entry)).join('\n')}\n`)
}

export async function takeSkillInvocations(home: string, sessionId: string): Promise<SkillInvocation[]> {
  const file = sessionSidecar(home, sessionId)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return []
  }
  const invocations: SkillInvocation[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      invocations.push(JSON.parse(line) as SkillInvocation)
    } catch {
      // one unreadable invocation must not cost the session its whole skill list
    }
  }
  await rm(file, { force: true })
  return invocations
}
