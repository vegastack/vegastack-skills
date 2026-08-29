import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { refreshEvidence } from './refresh-evidence.mjs'
import { createHash } from 'node:crypto'

// A local server holding one byte-identical page — the manual-review deadlock
// scenario: content unchanged since the last human review, review clock overdue.
const BODY = 'hyperdrive supports postgres 14-17\n'
let serveChanged = false
let serveEtag = true
const server = createServer((req, res) => {
  if (serveEtag && req.headers['if-none-match'] === '"vsk-etag"' && !serveChanged) { res.writeHead(304); res.end(); return }
  const headers = { 'content-type': 'text/plain' }
  if (serveEtag) headers.etag = '"vsk-etag"'
  res.writeHead(200, headers)
  res.end(serveChanged ? BODY + 'CHANGED\n' : BODY)
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const port = (server.address() as any).port
afterAll(() => server.close())

function makeRegistry(dir: string) {
  const checksum = createHash('sha256').update(BODY).digest('hex')
  const registry = {
    schemaVersion: 1,
    policy: { defaultChecksumScope: 'http-body' },
    sources: [{
      id: 'TEST-MANUAL',
      service: 'test service',
      kind: 'official-docs',
      stability: 'vendor-docs',
      thresholdDays: 14,
      critical: true,
      urls: { primary: `http://127.0.0.1:${port}/page` },
      versionDetection: { type: 'manual-review' },
      topics: ['t'],
      affected: ['references/x.md'],
      checksum,
      retrievedAt: '2026-08-01T00:00:00.000Z', // 28 days before "now" — overdue
    }],
  }
  const path = join(dir, 'sources.json')
  writeFileSync(path, JSON.stringify(registry, null, 2))
  return path
}

describe('manual-review clock on verified-unchanged content', () => {
  test('overdue + byte-identical + --accept-baselines → clock refreshes, run passes', async () => {
    const dir = mkdtempSync(join(realpathSync(process.env.TMPDIR ?? '/tmp'), 'vsk-refresh-'))
    const registry = makeRegistry(dir)
    const { report, failClosed } = await refreshEvidence({
      registry, cache: join(dir, 'cache.json'), report: join(dir, 'report.json'),
      acceptBaselines: true, allowHttpLocalhost: true, topics: [], now: '2026-08-29T00:00:00Z',
    })
    expect(failClosed).toBe(false)
    expect(report.manualVersionReview[0]?.due).toBe(false)
    const written = JSON.parse(readFileSync(registry, 'utf8'))
    expect(written.sources[0].retrievedAt).toContain('2026-08-29')
  })
  test('304 path: cached-identical manual-review source also refreshes the clock', async () => {
    const dir = mkdtempSync(join(realpathSync(process.env.TMPDIR ?? '/tmp'), 'vsk-refresh-'))
    const registry = makeRegistry(dir)
    const cache = join(dir, 'cache.json')
    // First accepting run warms the cache (200 + etag) and refreshes the clock.
    await refreshEvidence({ registry, cache, report: join(dir, 'r1.json'), acceptBaselines: true, allowHttpLocalhost: true, topics: [], now: '2026-08-29T00:00:00Z' })
    // Second run gets a 304; the clock must advance again.
    const { failClosed } = await refreshEvidence({ registry, cache, report: join(dir, 'r2.json'), acceptBaselines: true, allowHttpLocalhost: true, topics: [], now: '2026-08-30T00:00:00Z' })
    expect(failClosed).toBe(false)
    expect(JSON.parse(readFileSync(registry, 'utf8')).sources[0].retrievedAt).toContain('2026-08-30')
  })
  test('a CHANGED checksum keeps existing behavior: accepted as a new baseline, not a silent clock bump', async () => {
    const dir = mkdtempSync(join(realpathSync(process.env.TMPDIR ?? '/tmp'), 'vsk-refresh-'))
    const registry = makeRegistry(dir)
    serveChanged = true
    try {
      const { report } = await refreshEvidence({ registry, cache: join(dir, 'cache.json'), report: join(dir, 'r.json'), acceptBaselines: true, allowHttpLocalhost: true, topics: [], now: '2026-08-29T00:00:00Z' })
      expect(report.acceptedBaselines[0]?.checksum).toBeDefined()
    } finally { serveChanged = false }
  })
  test('a warm cache never masks registry drift in verify mode (no-etag server, two runs)', async () => {
    const dir = mkdtempSync(join(realpathSync(process.env.TMPDIR ?? '/tmp'), 'vsk-refresh-'))
    const registry = makeRegistry(dir)
    const cache = join(dir, 'cache.json')
    serveChanged = true; serveEtag = false
    try {
      const r1 = await refreshEvidence({ registry, cache, report: join(dir, 'r1.json'), allowHttpLocalhost: true, topics: [], now: '2026-08-29T00:00:00Z' })
      expect(r1.report.drift.length).toBe(1)
      expect(r1.failClosed).toBe(true)
      // Run 2 with the warm (drift-poisoned) cache must STILL report drift.
      const r2 = await refreshEvidence({ registry, cache, report: join(dir, 'r2.json'), allowHttpLocalhost: true, topics: [], now: '2026-08-30T00:00:00Z' })
      expect(r2.report.drift.length).toBe(1)
      expect(r2.report.drift[0].baseline).toBe('registry')
      expect(r2.report.drift[0].cacheDisagrees).toBe(true)
      expect(r2.failClosed).toBe(true)
    } finally { serveChanged = false; serveEtag = true }
  })
  test('unchanged source with a warm cache stays unaffected in verify mode', async () => {
    const dir = mkdtempSync(join(realpathSync(process.env.TMPDIR ?? '/tmp'), 'vsk-refresh-'))
    const registry = makeRegistry(dir)
    const cache = join(dir, 'cache.json')
    serveEtag = false
    try {
      await refreshEvidence({ registry, cache, report: join(dir, 'r1.json'), allowHttpLocalhost: true, topics: [], now: '2026-08-29T00:00:00Z' })
      const r2 = await refreshEvidence({ registry, cache, report: join(dir, 'r2.json'), allowHttpLocalhost: true, topics: [], now: '2026-08-30T00:00:00Z' })
      expect(r2.report.drift).toEqual([])
      expect(r2.report.unaffected).toContain('TEST-MANUAL')
    } finally { serveEtag = true }
  })
  test('read-only verification (no --accept-baselines) still fails closed and mutates nothing', async () => {
    const dir = mkdtempSync(join(realpathSync(process.env.TMPDIR ?? '/tmp'), 'vsk-refresh-'))
    const registry = makeRegistry(dir)
    const before = readFileSync(registry, 'utf8')
    const { failClosed } = await refreshEvidence({
      registry, cache: join(dir, 'cache.json'), report: join(dir, 'report.json'),
      allowHttpLocalhost: true, topics: [], now: '2026-08-29T00:00:00Z',
    })
    expect(failClosed).toBe(true)
    expect(readFileSync(registry, 'utf8')).toBe(before)
  })
})
