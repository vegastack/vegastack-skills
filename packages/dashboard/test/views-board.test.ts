import { expect, test } from 'bun:test'
import { buildBoardView } from '../src/lib/views/board'
import { buildDispatcherView } from '../src/lib/views/dispatcher'
import { contextFixture } from './helpers/context'

const now = Date.parse('2026-09-03T12:00:00.000Z')
const issue = (n: number, label: string) => ({ number: n, title: `#${n}`, labels: [label], assignees: [], updatedAt: '2026-09-03T10:00:00Z', url: `https://x/${n}` })
const report = {
  dispatcher: { running: true, pid: 4242, lastTick: '2026-09-03T11:59:00.000Z', interval: 120 },
  repos: [{ repo: 'vegastack/vegafactory', dispatch: 'local', board: { needsPlan: 1, ready: 2, working: 0, forOperator: 3 }, worktrees: [{ path: '/w/122', branch: 'feat/122', issue: 122, state: 'clean' }], runs: [] }],
}
const live = { ok: true as const, data: report }

test('columns follow the five workflow states; worktrees and health come from status', async () => {
  const context = await contextFixture({ month: 'SEP-2026' })
  const view = buildBoardView({
    context, now, issues: { ok: true, data: [issue(122, 'needs-plan'), issue(121, 'ready')] },
    pulls: { ok: true, data: [] }, status: live,
  })
  expect(view.columns.map((c) => c.label)).toEqual(['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator'])
  expect(view.columns[1]!.issues.map((i) => i.number)).toEqual([122])
  expect(view.worktrees).toHaveLength(1)
  expect(view.freshness.offline).toBe(false)
  expect(view.reasons).toEqual([])
  expect(buildDispatcherView({ context, now, status: live })).toMatchObject({ running: true, pid: 4242, interval: 120 })
})

test('a failed live source sets offline, names the reason, and keeps the page usable', async () => {
  const context = await contextFixture({ month: 'SEP-2026' })
  const down = { ok: false as const, reason: 'GitHub returned HTTP 503 for vegastack/vegafactory' }
  const view = buildBoardView({ context, now, issues: down, pulls: down, status: live })
  expect(view.freshness.offline).toBe(true)
  expect(view.reasons).toHaveLength(2)
  expect(view.columns.every((c) => c.issues.length === 0)).toBe(true)
  expect(view.worktrees).toHaveLength(1)
  const blind = buildDispatcherView({ context, now, status: { ok: false, reason: 'no vegafactory binary was passed to the dashboard' } })
  expect(blind).toMatchObject({ running: false, reasons: ['no vegafactory binary was passed to the dashboard'] })
  expect(blind.freshness.offline).toBe(true)
})
