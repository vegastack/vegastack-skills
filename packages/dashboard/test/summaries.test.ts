import { expect, test } from 'bun:test'
import { freshnessFrom } from '../src/lib/freshness'
import { parseSummary } from '../src/lib/stats/summaries'

const now = Date.parse('2026-09-03T12:00:00.000Z')
const state = (iso: string, org = 'vegastack') => JSON.stringify({
  schemaVersion: 1,
  controlRooms: { [org]: { repo: 'vegastack/vegafactory-control-room', path: '/c', branch: 'main', lastSyncedAt: iso, sha: 'abc1234' } },
})

test('a summary is read field by field, and what it lacks is named rather than guessed', () => {
  const summary = parseSummary('vegastack/vegafactory', 'SEP-2026', JSON.stringify({
    stages: [{ stage: 'plan', lead_time_s: 3600, cycle_time_s: 1800 }, { stage: 'implement', lead_time_s: 7200 }],
    rework: { review_rounds: 3, fix_rounds: 1 }, runs: 12,
  }))
  expect(summary.stages).toEqual([
    { stage: 'plan', leadTimeS: 3600, cycleTimeS: 1800 },
    { stage: 'implement', leadTimeS: 7200, cycleTimeS: null },
  ])
  expect(summary.rework.handbacks).toBeNull()
  expect(summary.missing).toContain('rework.handbacks')
  expect(summary.missing).toContain('cost_usd')
  expect(parseSummary('org', 'SEP-2026', '{not json')).toMatchObject({ stages: [], missing: ['document'] })
})

test('freshness reads the org entry sync wrote; a failed live read only sets offline', () => {
  expect(freshnessFrom({ factoryJson: state('2026-09-03T11:30:00.000Z'), org: 'vegastack', now, liveOk: true }))
    .toEqual({ syncedAt: '2026-09-03T11:30:00.000Z', ageMinutes: 30, label: 'synced 30 minutes ago', offline: false })
  expect(freshnessFrom({ factoryJson: null, org: 'vegastack', now, liveOk: true }).label).toBe('never synced')
  expect(freshnessFrom({ factoryJson: state('2026-09-03T11:30:00.000Z', 'other'), org: 'vegastack', now, liveOk: true }).label).toBe('never synced')
  expect(freshnessFrom({ factoryJson: state('2026-09-03T09:00:00.000Z'), org: 'vegastack', now, liveOk: false }))
    .toMatchObject({ offline: true, label: 'synced 3 hours ago' })
})
