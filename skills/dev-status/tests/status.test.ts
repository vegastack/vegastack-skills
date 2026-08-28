import { describe, expect, test } from 'bun:test'
import { ageDays, ledgerMovedAt, parseMarker, pendingDecisions, taskProgress } from '../scripts/status.mjs'

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
  test('parseMarker matches the shared contract', () => {
    expect(parseMarker('<!-- vsk:v1 type=ledger branch=feat/x -->')?.keys.type).toBe('ledger')
    expect(parseMarker('## Ledger only')).toBeNull()
  })
})
