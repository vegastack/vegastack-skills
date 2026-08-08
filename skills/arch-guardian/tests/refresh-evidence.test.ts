import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { refreshEvidence } from '../scripts/refresh-evidence.mjs'

let temporary = ''
let server: ReturnType<typeof Bun.serve>
const calls: string[] = []
const sha = (value: string) => createHash('sha256').update(value).digest('hex')

beforeAll(async () => {
  temporary = await realpath(await mkdtemp(join(tmpdir(), 'vegastack-evidence-')))
  server = Bun.serve({ port: 0, fetch(request) { const path = new URL(request.url).pathname; calls.push(path); if (path === '/cached' && request.headers.get('if-none-match') === '"cached"') return new Response(null, { status: 304 }); return new Response(path === '/changed' ? 'new' : 'same', { headers: { ETag: `"${path}"` } }) } })
})
afterAll(async () => { server.stop(true); await rm(temporary, { recursive: true, force: true }) })

async function files(sources: unknown[], cache: unknown = { schemaVersion: 1, sources: {} }) {
  const registry = join(temporary, `registry-${Math.random()}.json`)
  const cachePath = join(temporary, `cache-${Math.random()}.json`)
  const report = join(temporary, `report-${Math.random()}.json`)
  await writeFile(registry, JSON.stringify({ schemaVersion: 1, sources }))
  await writeFile(cachePath, JSON.stringify(cache))
  return { registry, cache: cachePath, report }
}

const source = (id: string, path: string, topics: string[], critical = false) => ({ id, urls: { primary: `http://127.0.0.1:${server.port}${path}` }, versionDetection: { type: 'parent', source: 'synthetic' }, topics, thresholdDays: 7, critical, checksum: sha('same'), checksumScope: 'http-body', affected: [id === 'durability' ? 'rule:DUR-001' : 'rule:AUTH-003'] })

describe('evidence refresh', () => {
  test('requires a scoped immutable baseline for every canonical refreshable source', async () => {
    const registry = JSON.parse(await readFile(join(import.meta.dir, '../refresh/sources.json'), 'utf8'))
    for (const entry of registry.sources.filter((item: any) => item.refreshable !== false)) {
      expect(['http-body', 'html-text-v1']).toContain(entry.checksumScope ?? registry.policy.defaultChecksumScope)
      expect(entry.checksum).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  test('selects task-relevant sources and leaves unrelated sources on the fast path', async () => {
    calls.length = 0
    const paths = await files([source('auth', '/same', ['auth']), source('storage', '/changed', ['storage'])])
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: false, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.report.selected).toEqual(['auth'])
    expect(calls).toEqual(['/same'])
  })

  test('uses a fresh offline cache without network', async () => {
    calls.length = 0
    const paths = await files([source('auth', '/same', ['auth'], true)], { schemaVersion: 1, sources: { auth: { retrievedAt: '2026-08-04T00:00:00Z', checksum: sha('same') } } })
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: true, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.failClosed).toBe(false)
    expect(calls).toEqual([])
  })

  test('uses ETag conditional refresh and preserves cached checksum on 304', async () => {
    calls.length = 0
    const paths = await files([source('auth', '/cached', ['auth'], true)], { schemaVersion: 1, sources: { auth: { retrievedAt: '2026-08-04T00:00:00Z', checksum: sha('same'), etag: '"cached"' } } })
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: false, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.failClosed).toBe(false)
    expect(result.report.unaffected).toEqual(['auth'])
    expect(JSON.parse(await readFile(paths.cache, 'utf8')).sources.auth.checksum).toBe(sha('same'))
  })

  test('rejects a 304 cache entry that does not match the immutable registry baseline', async () => {
    const paths = await files([source('auth', '/cached', ['auth'], true)], { schemaVersion: 1, sources: { auth: { retrievedAt: '2026-08-04T00:00:00Z', checksum: sha('tampered'), etag: '"cached"' } } })
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: false, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.failClosed).toBe(true)
    expect(result.report.drift[0].baseline).toBe('registry-vs-304-cache')
  })

  test('compares a first online fetch with the immutable registry baseline', async () => {
    const paths = await files([source('auth', '/changed', ['auth'], true)])
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: false, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.failClosed).toBe(true)
    expect(result.report.drift[0].baseline).toBe('registry')
  })

  test('fails closed for stale critical offline evidence', async () => {
    const paths = await files([source('auth', '/same', ['auth'], true)], { schemaVersion: 1, sources: { auth: { retrievedAt: '2026-07-01T00:00:00Z', checksum: sha('same') } } })
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: true, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.failClosed).toBe(true)
    expect(result.report.stale[0].id).toBe('auth')
  })

  test('reports checksum drift with affected mappings', async () => {
    const paths = await files([source('durability', '/changed', ['durability'], true)], { schemaVersion: 1, sources: { durability: { retrievedAt: '2026-08-04T00:00:00Z', checksum: sha('old') } } })
    const result = await refreshEvidence({ ...paths, topics: ['durability'], offline: false, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.report.drift).toHaveLength(1)
    expect(result.failClosed).toBe(true)
    expect(result.report.drift[0].affected).toEqual(['rule:DUR-001'])
    expect(JSON.parse(await readFile(paths.report, 'utf8')).drift).toHaveLength(1)
  })

  test('fetches nothing when no source matches the task', async () => {
    calls.length = 0
    const paths = await files([source('storage', '/changed', ['storage'])])
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: false, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.report.selected).toEqual([])
    expect(calls).toEqual([])
  })

  test('treats malformed cache timestamps as stale and fail-closed', async () => {
    const paths = await files([source('auth', '/same', ['auth'], true)], { schemaVersion: 1, sources: { auth: { retrievedAt: 'not-a-date', checksum: sha('same') } } })
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: true, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.failClosed).toBe(true)
    expect(result.report.stale[0].ageDays).toBeNull()
  })

  test('accept-baselines writes registry, cache, and report together without re-reporting accepted drift', async () => {
    const paths = await files([source('auth', '/changed', ['auth'], true)], { schemaVersion: 1, sources: { auth: { retrievedAt: '2026-08-04T00:00:00Z', checksum: sha('old') } } })
    const result = await refreshEvidence({ ...paths, topics: ['auth'], offline: false, acceptBaselines: true, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    expect(result.failClosed).toBe(false)
    expect(result.report.drift).toHaveLength(0)
    expect(result.report.versionDrift).toHaveLength(0)
    expect(result.report.acceptedBaselines[0].id).toBe('auth')
    const registry = JSON.parse(await readFile(paths.registry, 'utf8'))
    expect(registry.sources[0].checksum).toBe(sha('new'))
    expect(JSON.parse(await readFile(paths.cache, 'utf8')).sources.auth.checksum).toBe(sha('new'))
    expect(JSON.parse(await readFile(paths.report, 'utf8')).acceptedBaselines).toHaveLength(1)
  })

  test('a normal run after acceptance reproduces the accepted baselines with zero drift', async () => {
    const paths = await files([source('auth', '/changed', ['auth'], true)])
    await refreshEvidence({ ...paths, topics: ['auth'], offline: false, acceptBaselines: true, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })
    const verify = await refreshEvidence({ ...paths, topics: ['auth'], offline: false, now: '2026-08-05T01:00:00Z', allowHttpLocalhost: true })
    expect(verify.report.drift).toHaveLength(0)
    expect(verify.failClosed).toBe(false)
  })

  test('refuses output writes through symlinks', async () => {
    const paths = await files([source('auth', '/same', ['auth'])])
    const real = join(temporary, `real-${Math.random()}`)
    const linked = join(temporary, `linked-${Math.random()}`)
    await mkdir(real)
    await Bun.write(join(real, 'seed'), 'seed')
    await symlink(real, linked)
    await expect(refreshEvidence({ ...paths, cache: join(linked, 'cache.json'), topics: ['auth'], offline: true, now: '2026-08-05T00:00:00Z', allowHttpLocalhost: true })).rejects.toThrow('symlink')
  })
})
