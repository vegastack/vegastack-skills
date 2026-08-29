import { describe, expect, test } from 'bun:test'
import { ageDays, ledgerMovedAt, parseMarker, pendingDecisions, stripLinks, taskProgress } from '../scripts/status.mjs'

const NOW = Date.parse('2026-08-29T12:00:00Z')
const planComment = (body: string) => ({ body: `<!-- vsk:v1 type=plan rev=1 -->\n${body}`, updated_at: '2026-08-29T10:00:00Z' })

describe('status helpers', () => {
  test('ageDays floors whole days', () => {
    expect(ageDays('2026-08-26T11:00:00Z', NOW)).toBe(3)
    expect(ageDays('2026-08-29T01:00:00Z', NOW)).toBe(0)
  })
  test('taskProgress counts checkboxes in the plan comment only', () => {
    const comments = [
      { body: 'no marker here - [ ] not a task', updated_at: '' },
      planComment('- [x] **Task 1: a**\n- [x] **Task 2: b**\n- [ ] **Task 3: c**'),
    ]
    expect(taskProgress(comments)).toEqual([2, 3])
    expect(taskProgress([{ body: 'nothing', updated_at: '' }])).toBeNull()
    expect(taskProgress([planComment('no checkboxes at all')])).toBeNull()
  })
  test('ledgerMovedAt returns the last ledger comment time, null when absent', () => {
    const comments = [
      { body: '<!-- vsk:v1 type=ledger branch=x -->\n## Ledger', updated_at: '2026-08-27T09:00:00Z' },
      { body: '<!-- vsk:v1 type=evidence rev=1 branch=x sha=abc1234 -->', updated_at: '2026-08-28T09:00:00Z' },
    ]
    expect(ledgerMovedAt(comments)).toBe('2026-08-27T09:00:00Z')
    expect(ledgerMovedAt([])).toBeNull()
  })
  test('pendingDecisions: unrecorded decision comments and evidence Decision lines, recorded ones excluded', () => {
    const register = '- 28-08-2026 operator (mk) — keep D1 for the search index\n'
    const comments = [
      { body: '<!-- vsk:v1 type=decision -->\nkeep D1 for the search index', updated_at: '' },
      { body: '<!-- vsk:v1 type=decision -->\nexports stay client-side until >10k rows is real', updated_at: '' },
      { body: '<!-- vsk:v1 type=evidence rev=1 branch=x sha=abc1234 -->\n**Decision:** retire the legacy webhook path\n**Not done / limits:** none', updated_at: '' },
      { body: '<!-- vsk:v1 type=evidence rev=1 branch=y sha=abc1235 -->\n**Decision:** none for the register\n', updated_at: '' },
    ]
    const pending = pendingDecisions(comments, register)
    expect(pending).toEqual(['exports stay client-side until >10k rows is real', 'retire the legacy webhook path'])
  })
  test('stripLinks unwraps markdown links for terminal display', () => {
    // The chronicle title shape: the issue link sits inside its own parens.
    expect(stripLinks('Widgets got frobbed ([#7](https://github.com/o/r/issues/7))')).toBe('Widgets got frobbed (#7)')
    expect(stripLinks('retire the [legacy webhook path](https://example.com/doc) for good')).toBe('retire the legacy webhook path for good')
    expect(stripLinks('no links here')).toBe('no links here')
    expect(stripLinks(null)).toBe('')
  })
  test('parseMarker matches the shared contract', () => {
    expect(parseMarker('<!-- vsk:v1 type=ledger branch=feat/x -->')?.keys.type).toBe('ledger')
    expect(parseMarker('## Ledger only')).toBeNull()
  })
})

import { checksState, gatherStatus, readKnobs } from '../scripts/status.mjs'
import { join, resolve } from 'node:path'

describe('gatherStatus over the gh stub', () => {
  const skillRoot = resolve(import.meta.dir, '..')
  test('assembles the board, staleness, tasks, decisions, and PR checks from canned gh output', () => {
    process.env.VSK_GH = join(skillRoot, 'tests/fixtures/gh-stub.mjs')
    process.env.GH_STUB_DIR = join(skillRoot, 'tests/fixtures/scenarios/basic')
    try {
      const data = gatherStatus({ staleDays: 3, devMdPath: '/nonexistent-dev.md', now: Date.parse('2026-08-29T12:00:00Z') })
      expect(data.repo).toBe('vegastack/fixture-repo')
      expect(data.board.working[0]).toMatchObject({ number: 7, scope: 'quick-build', risky: true, tasks: [1, 2], stale: true })
      expect(data.board['for-operator'][0].number).toBe(8)
      expect(data.pendingDecisions).toEqual([{ issue: 8, gist: 'retire the [legacy webhook path](https://example.com/webhooks)', gistPlain: 'retire the legacy webhook path' }])
      expect(data.prs[0].checks).toBe('green')
      expect(data.board.ready).toEqual([])
    } finally {
      delete process.env.VSK_GH; delete process.env.GH_STUB_DIR
    }
  })
  test('checksState: StatusContext green, empty rollup is no-checks, failure is pending-or-red', () => {
    expect(checksState([{ state: 'SUCCESS' }])).toBe('green')
    expect(checksState([])).toBe('no-checks')
    expect(checksState(undefined)).toBe('no-checks')
    expect(checksState([{ conclusion: 'FAILURE' }])).toBe('pending-or-red')
  })
  test('empty board: all buckets empty, no PRs, no chronicle', () => {
    process.env.VSK_GH = join(skillRoot, 'tests/fixtures/gh-stub.mjs')
    process.env.GH_STUB_DIR = join(skillRoot, 'tests/fixtures/scenarios/empty')
    try {
      const data = gatherStatus({ devMdPath: '/nonexistent-dev.md', chroniclePath: '/nonexistent-chronicle.md', now: Date.parse('2026-08-29T12:00:00Z') })
      expect(Object.values(data.board).every((b: any[]) => b.length === 0)).toBe(true)
      expect(data.prs).toEqual([])
      expect(data.pendingDecisions).toEqual([])
      expect(data.lastChronicle).toBeNull()
    } finally { delete process.env.VSK_GH; delete process.env.GH_STUB_DIR }
  })
  test('chronicle parse: newest entry date + outcome title', () => {
    process.env.VSK_GH = join(skillRoot, 'tests/fixtures/gh-stub.mjs')
    process.env.GH_STUB_DIR = join(skillRoot, 'tests/fixtures/scenarios/basic')
    try {
      const data = gatherStatus({ devMdPath: '/nonexistent-dev.md', chroniclePath: join(skillRoot, 'tests/fixtures/scenarios/basic/chronicle.md'), now: Date.parse('2026-08-29T12:00:00Z') })
      expect(data.lastChronicle).toEqual({ date: '29-08-2026', title: 'Widgets got frobbed ([#7](https://github.com/vegastack/fixture-repo/issues/7))', titlePlain: 'Widgets got frobbed (#7)' })
    } finally { delete process.env.VSK_GH; delete process.env.GH_STUB_DIR }
  })
  test('CLI fails closed: unreachable gh → exit 2, cannot-verify on stderr', () => {
    const { spawnSync } = require('node:child_process')
    const r = spawnSync('node', [join(skillRoot, 'scripts/status.mjs'), '--json'], {
      env: { ...process.env, VSK_GH: '/nonexistent-vsk-gh' }, encoding: 'utf8',
    })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('cannot verify')
  })
  test('readKnobs: renamed labels and custom register parse; short lists fall back', () => {
    const knobs = readKnobs('labels: waiting planning go doing done hot q s l parent\ndecisions: docs/register.md\n')
    expect(knobs.states).toEqual(['waiting', 'planning', 'go', 'doing', 'done'])
    expect(knobs.risky).toBe('hot')
    expect(knobs.register).toBe('docs/register.md')
    expect(readKnobs('labels: a b c\n').states[0]).toBe('needs-operator')
    expect(readKnobs('').register).toBe('.vegastack/decisions.md')
  })
})
