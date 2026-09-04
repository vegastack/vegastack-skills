import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseSummary } from '../src/lib/stats/summaries'
import { buildOrgView } from '../src/lib/views/org'
import { buildRepoView } from '../src/lib/views/repo'
import { contextFixture } from './helpers/context'

test('org totals, per-repo rows carrying their group, and a share that never divides by zero', async () => {
  const view = buildOrgView({ context: await contextFixture({ month: 'SEP-2026' }), summary: null })
  expect(view.totals.runs).toBe(2)
  expect(view.repos[0]).toMatchObject({ repo: 'vegastack/vegafactory', group: 'dev' })
  expect(view.humanShare).toBeCloseTo(2, 6)
  const empty = buildOrgView({ context: await contextFixture({ month: 'JAN-2027' }), summary: null })
  expect(empty).toMatchObject({ humanShare: 0 })
  expect(empty.totals.runs).toBe(0)
})

test('lead and cycle time come from the writer\'s summary, cost and rework per issue from the cache', async () => {
  const context = await contextFixture({ month: 'SEP-2026' })
  const bytes = await readFile(join(import.meta.dir, '../../cli/test/fixtures/stats/SEP-2026/vegafactory.summary.json'), 'utf8')
  const summary = parseSummary('repo', 'vegastack/vegafactory', 'SEP-2026', bytes)
  const view = buildRepoView({ context, repo: 'vegastack/vegafactory', summary })
  expect(view.leadTimeH).toEqual({ p50: 48, p90: 48 })
  expect(view.cycleTimeH).toEqual([{ label: 'ready', p50: 12, p90: 12 }, { label: 'working', p50: 24, p90: 24 }])
  expect(view.stages.map((s) => s.stage)).toEqual(['implement'])
  expect(view.stages[0]).toMatchObject({ runs: 2 })
  expect(view.issues.map((i) => i.issue).sort()).toEqual([121, 122])
  expect(view.rework.handbacks).toBe(1)
  expect(view.missing).toEqual([])
  const bare = buildRepoView({ context, repo: 'vegastack/vegafactory', summary: null })
  expect(bare.leadTimeH).toEqual({ p50: null, p90: null })
  expect(bare.cycleTimeH).toEqual([])
  expect(bare.missing).toContain('summary')
})
