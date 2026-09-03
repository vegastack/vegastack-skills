import { expect, test } from 'bun:test'
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

test('lead and cycle time come from the summary, cost and rework from the cache', async () => {
  const context = await contextFixture({ month: 'SEP-2026' })
  const summary = parseSummary('vegastack/vegafactory', 'SEP-2026', JSON.stringify({
    stages: [{ stage: 'implement', lead_time_s: 7200, cycle_time_s: 3600 }],
    rework: { review_rounds: 2, fix_rounds: 1, handbacks: 2 },
  }))
  const view = buildRepoView({ context, repo: 'vegastack/vegafactory', summary })
  expect(view.stages.find((s) => s.stage === 'implement')).toMatchObject({ leadTimeS: 7200, cycleTimeS: 3600, runs: 2 })
  expect(view.issues.map((i) => i.issue).sort()).toEqual([121, 122])
  expect(view.rework.handbacks).toBe(2)
  const bare = buildRepoView({ context, repo: 'vegastack/vegafactory', summary: null })
  expect(bare.stages[0]!.leadTimeS).toBeNull()
  expect(bare.missing).toContain('summary')
})
