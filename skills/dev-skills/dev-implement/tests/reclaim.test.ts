import { describe, expect, test } from 'bun:test'
import { evaluateReclaim } from '../scripts/reclaim.mjs'

const NOW = Date.parse('2026-08-29T12:00:00Z')
const working = (assignees = ['bot']) => ({ state: 'open', labels: [{ name: 'working' }, { name: 'full-plan' }], assignees: assignees.map((login) => ({ login })) })
const ledger = (updated_at: string) => ({ body: '<!-- vsk:v1 type=ledger branch=feat/x -->\n## Ledger', updated_at })

describe('evaluateReclaim: read-verify before releasing a claim', () => {
  test('a working issue whose ledger never got written is releasable', () => {
    const r = evaluateReclaim({ issue: working(), comments: [], now: NOW })
    expect(r.blocks).toEqual([])
    expect(r.plan.removeAssignees).toEqual(['bot'])
    expect(r.plan.ledgerAgeHours).toBeNull()
  })
  test('a working issue silent past the orphan threshold is releasable', () => {
    const r = evaluateReclaim({ issue: working(), comments: [ledger('2026-08-28T12:00:00Z')], orphanHours: 6, now: NOW })
    expect(r.blocks).toEqual([])
    expect(r.plan.ledgerAgeHours).toBe(24)
  })
  test('a fresh ledger refuses release unless forced', () => {
    const fresh = [ledger('2026-08-29T09:00:00Z')] // 3h ago, < 6h
    const refused = evaluateReclaim({ issue: working(), comments: fresh, orphanHours: 6, now: NOW })
    expect(refused.blocks.length).toBe(1)
    expect(refused.blocks[0]).toContain('may be live')
    const forced = evaluateReclaim({ issue: working(), comments: fresh, orphanHours: 6, force: true, now: NOW })
    expect(forced.blocks).toEqual([])
  })
  test('a non-working issue is nothing to reclaim', () => {
    const ready = { state: 'open', labels: [{ name: 'ready' }], assignees: [] }
    expect(evaluateReclaim({ issue: ready, comments: [], now: NOW }).blocks.some((b: string) => b.includes("not 'working'"))).toBe(true)
  })
  test('a closed issue is blocked', () => {
    const closed = { ...working(), state: 'closed' }
    expect(evaluateReclaim({ issue: closed, comments: [], now: NOW }).blocks.some((b: string) => b.includes('closed'))).toBe(true)
  })
})
