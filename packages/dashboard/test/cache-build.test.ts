import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CACHE_SCHEMA_VERSION, openCache, refreshCache, type Db } from '../src/lib/cache/build'

const record = (issue: number) => JSON.stringify({
  ts: '2026-09-02T10:00:00.000Z', repo: 'vegastack/vegafactory', issue, cost_usd: 0.4,
  skills: [{ name: 'dev-implement', trigger: 'model', harness: 'claude' }],
})
const count = (db: Db, t: string) => db.query<{ n: number }>(`select count(*) as n from ${t}`).get()!.n

async function room() {
  const root = await mkdtemp(join(tmpdir(), 'vf-room-'))
  const dir = join(root, 'stats', 'vegastack__vegafactory', 'SEP-2026')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'mini.jsonl'), `${record(122)}\n{bad\n`)
  return { root, file: join(dir, 'mini.jsonl'), cache: join(root, 'stats.db') }
}

test('unchanged sources are skipped, changed ones replace their rows, vanished ones drop them', async () => {
  const { root, file, cache } = await room()
  const db = await openCache(cache)
  expect(await refreshCache(db, root)).toMatchObject({ total: 1, skippedLines: 1 })
  expect(count(db, 'skill_invocations')).toBe(1)
  expect((await refreshCache(db, root)).ingested).toEqual([])
  await writeFile(file, `${record(122)}\n${record(121)}\n`)
  expect((await refreshCache(db, root)).ingested).toHaveLength(1)
  expect(count(db, 'runs')).toBe(2)
  await rm(file)
  expect((await refreshCache(db, root)).removed).toHaveLength(1)
  expect(count(db, 'runs')).toBe(0)
  db.run(`pragma user_version = ${CACHE_SCHEMA_VERSION + 1}`)
  db.close()
  expect(count(await openCache(cache), 'sources')).toBe(0)
  await writeFile(cache, 'this is not a database')
  expect(count(await openCache(cache), 'runs')).toBe(0)
})

test('the cache directory is created; the server owns the path, not the caller', async () => {
  const { root } = await room()
  const nested = join(root, 'does', 'not', 'exist', 'yet', 'stats.db')
  const db = await openCache(nested)
  expect(count(db, 'runs')).toBe(0)
})
