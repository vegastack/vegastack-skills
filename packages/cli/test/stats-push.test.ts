import { expect, test, beforeEach } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeRecord } from '../src/stats/record.ts'
import { appendRecord, listOutbox } from '../src/stats/outbox.ts'
import { commitSubject, commitBody, planPush, pushOutbox } from '../src/stats/push.ts'

let home: string
let clone: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'vsk-push-home-'))
  clone = await mkdtemp(join(tmpdir(), 'vsk-push-clone-'))
})
const record = (over: Record<string, unknown> = {}) => normalizeRecord({
  repo: 'vegastack/vegafactory', ts: '2026-09-03T10:00:00.000Z', issue: 121, stage: 'implement',
  harness: 'claude', model: 'fable-5.1', outcome: 'complete', duration_s: 92, cost_usd: 1.25,
  tokens: { in: 900, out: 300, cache_read: 40_000, cache_write: 1_200 }, ...over,
})

test('commitSubject follows the agreed format and lists mixed agents once each', async () => {
  await appendRecord(home, record(), 'mini')
  await appendRecord(home, record({ harness: 'codex', model: 'gpt-5.6' }), 'mini')
  const subject = commitSubject(await listOutbox(home), { ghUser: 'kmanojkumar', hostname: 'mini' })
  expect(subject).toBe('stats: vegastack/vegafactory +2 runs SEP-2026 · kmanojkumar@mini · claude/fable-5.1, codex/gpt-5.6')
})

test('commitBody is one line per record', () => {
  expect(commitBody([record(), record({ issue: 122, stage: 'review', outcome: 'handback', duration_s: 30, cost_usd: 0.4 })]))
    .toBe('#121 implement complete 92s 42400 tokens $1.25\n#122 review handback 30s 42400 tokens $0.40')
})

test('planPush names the clone target per batch and refuses nothing when clean', async () => {
  await appendRecord(home, record(), 'mini')
  const plan = planPush(await listOutbox(home), clone, { ghUser: 'kmanojkumar', hostname: 'mini' })
  expect(plan.copies).toEqual([{
    from: join(home, '.vegastack/stats/outbox/vegastack__vegafactory/SEP-2026/mini.jsonl'),
    to: join(clone, 'stats/vegastack__vegafactory/SEP-2026/mini.jsonl'), lines: 1,
  }])
  expect(plan.refusals).toEqual([])
})

test('without --commit nothing runs git and the outbox is untouched', async () => {
  await appendRecord(home, record(), 'mini')
  const calls: string[][] = []
  const result = await pushOutbox({
    home, cloneRoot: clone, ghUser: 'kmanojkumar', hostname: 'mini', commit: false,
    git: async (args) => { calls.push(args); return { code: 0, stdout: '', stderr: '' } },
  })
  expect(calls).toEqual([])
  expect(result.pushed).toBe(0)
  expect((await listOutbox(home))).toHaveLength(1)
})

test('a non-fast-forward push rebases once and retries, then clears the outbox', async () => {
  await appendRecord(home, record(), 'mini')
  const calls: string[][] = []
  let pushes = 0
  const result = await pushOutbox({
    home, cloneRoot: clone, ghUser: 'kmanojkumar', hostname: 'mini', commit: true,
    git: async (args) => {
      calls.push(args)
      if (args[0] === 'push') {
        pushes += 1
        if (pushes === 1) return { code: 1, stdout: '', stderr: 'Updates were rejected because the remote contains work' }
      }
      return { code: 0, stdout: '', stderr: '' }
    },
  })
  expect(result.ok).toBe(true)
  expect(result.retries).toBe(1)
  expect(calls.filter((c) => c[0] === 'pull')).toEqual([['pull', '--rebase']])
  expect(await listOutbox(home)).toEqual([])
  expect(await readFile(join(clone, 'stats/vegastack__vegafactory/SEP-2026/mini.jsonl'), 'utf8'))
    .toContain('"issue":121')
})

test('a push that keeps failing leaves the outbox for the next attempt', async () => {
  await appendRecord(home, record(), 'mini')
  const result = await pushOutbox({
    home, cloneRoot: clone, ghUser: 'kmanojkumar', hostname: 'mini', commit: true, maxRetries: 2,
    git: async (args) => (args[0] === 'push'
      ? { code: 1, stdout: '', stderr: 'Updates were rejected' }
      : { code: 0, stdout: '', stderr: '' }),
  })
  expect(result.ok).toBe(false)
  expect(result.deferred).toHaveLength(1)
  expect(await listOutbox(home)).toHaveLength(1)
})
