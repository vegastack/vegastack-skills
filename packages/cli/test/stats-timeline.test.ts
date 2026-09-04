import { expect, test } from 'bun:test'
import { fetchTimelines, timelineFromApi } from '../src/stats/timeline.ts'

const issue = { created_at: '2026-09-01T00:00:00.000Z' }
const events = [
  { event: 'labeled', label: { name: 'ready' }, created_at: '2026-09-01T00:00:00.000Z' },
  { event: 'commented', created_at: '2026-09-01T06:00:00.000Z' },
  { event: 'unlabeled', label: { name: 'ready' }, created_at: '2026-09-01T12:00:00.000Z' },
  { event: 'labeled', label: { name: 'working' }, created_at: '2026-09-01T12:00:00.000Z' },
  { event: 'closed', created_at: '2026-09-03T00:00:00.000Z' },
  { event: 'renamed', created_at: '2026-09-02T00:00:00.000Z' },
]

test('the API timeline becomes the rollup\'s events: created, labeled, unlabeled, closed, reopened — nothing else', () => {
  expect(timelineFromApi(121, issue, events)).toEqual([
    { issue: 121, event: 'created', label: null, created_at: '2026-09-01T00:00:00.000Z' },
    { issue: 121, event: 'labeled', label: 'ready', created_at: '2026-09-01T00:00:00.000Z' },
    { issue: 121, event: 'unlabeled', label: 'ready', created_at: '2026-09-01T12:00:00.000Z' },
    { issue: 121, event: 'labeled', label: 'working', created_at: '2026-09-01T12:00:00.000Z' },
    { issue: 121, event: 'closed', label: null, created_at: '2026-09-03T00:00:00.000Z' },
  ])
  expect(timelineFromApi(5, {}, 'not a list' as never)).toEqual([])
})

test('fetchTimelines reads each issue once and fails closed as a whole when gh cannot answer', async () => {
  const calls: string[][] = []
  const gh = async (args: string[]): Promise<unknown> => {
    calls.push(args)
    if (args[1]!.endsWith('/timeline')) return events
    return issue
  }
  const result = await fetchTimelines('vegastack/vegafactory', [122, 121, 121], gh)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('unreachable')
  expect(result.events.map((event) => event.issue)).toEqual([121, 121, 121, 121, 121, 122, 122, 122, 122, 122])
  expect(calls.map((args) => args[1])).toEqual([
    'repos/vegastack/vegafactory/issues/121', 'repos/vegastack/vegafactory/issues/121/timeline',
    'repos/vegastack/vegafactory/issues/122', 'repos/vegastack/vegafactory/issues/122/timeline',
  ])
  const refused = await fetchTimelines('vegastack/vegafactory', [121], async () => { throw new Error('HTTP 403: rate limited') })
  expect(refused).toEqual({ ok: false, reason: 'HTTP 403: rate limited' })
})
