import { expect, test, beforeEach } from 'bun:test'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeRecord } from '../src/stats/record.ts'
import {
  OutboxRefusal, outboxFile, sanitizeHostname, appendRecord, listOutbox,
  dropOutboxFiles, appendSkillInvocations, takeSkillInvocations,
} from '../src/stats/outbox.ts'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'vsk-outbox-')) })
const record = (issue: number) => normalizeRecord({
  repo: 'vegastack/vegafactory', ts: '2026-09-03T10:00:00.000Z', issue, stage: 'implement',
})

test('hostnames are sanitised and the outbox path is one segment per repo, month and host', () => {
  expect(sanitizeHostname('MK-Mac-mini.local')).toBe('mk-mac-mini')
  expect(sanitizeHostname('box 01/prod')).toBe('box-01-prod')
  expect(outboxFile(home, 'vegastack/vegafactory', 'SEP-2026', 'mini'))
    .toBe(join(home, '.vegastack/stats/outbox/vegastack__vegafactory/SEP-2026/mini.jsonl'))
})

test('appendRecord creates the tree and appends one line per record', async () => {
  const file = await appendRecord(home, record(121), 'mini')
  await appendRecord(home, record(122), 'mini')
  const lines = (await readFile(file, 'utf8')).trimEnd().split('\n')
  expect(lines).toHaveLength(2)
  expect(JSON.parse(lines[1]!).issue).toBe(122)
})

test('a record with problems is refused, not written', async () => {
  const broken = { ...record(121), repo: '' }
  await expect(appendRecord(home, broken, 'mini')).rejects.toBeInstanceOf(OutboxRefusal)
})

test('a symlinked outbox file is refused and named', async () => {
  const file = outboxFile(home, 'vegastack/vegafactory', 'SEP-2026', 'mini')
  await mkdir(join(home, '.vegastack/stats/outbox/vegastack__vegafactory/SEP-2026'), { recursive: true })
  await writeFile(join(home, 'elsewhere.jsonl'), '')
  await symlink(join(home, 'elsewhere.jsonl'), file)
  await expect(appendRecord(home, record(121), 'mini')).rejects.toThrow(file)
})

test('listOutbox replays every pending batch after a failed push', async () => {
  await appendRecord(home, record(121), 'mini')
  await appendRecord(home, { ...record(130), ts: '2026-10-01T00:00:00.000Z' }, 'mini')
  const batches = await listOutbox(home)
  expect(batches.map((b) => b.month).sort()).toEqual(['OCT-2026', 'SEP-2026'])
  expect(batches.every((b) => b.repo === 'vegastack/vegafactory')).toBe(true)
  await dropOutboxFiles(batches.map((b) => b.file))
  expect(await listOutbox(home)).toEqual([])
})

test('a corrupt line is skipped and reported, never fatal', async () => {
  const file = await appendRecord(home, record(121), 'mini')
  await writeFile(file, (await readFile(file, 'utf8')) + 'not json\n')
  const batches = await listOutbox(home)
  expect(batches[0]!.records).toHaveLength(1)
})

test('skill invocations accumulate per session and are taken exactly once', async () => {
  await appendSkillInvocations(home, 'sess-1', [{ name: 'dev-implement', trigger: 'typed', harness: 'claude' }])
  await appendSkillInvocations(home, 'sess-1', [{ name: 'dev-architect', trigger: 'model', harness: 'claude' }])
  expect(await takeSkillInvocations(home, 'sess-1')).toEqual([
    { name: 'dev-implement', trigger: 'typed', harness: 'claude' },
    { name: 'dev-architect', trigger: 'model', harness: 'claude' },
  ])
  expect(await takeSkillInvocations(home, 'sess-1')).toEqual([])
  expect(existsSync(join(home, '.vegastack/stats/sessions/sess-1.skills.jsonl'))).toBe(false)
})
