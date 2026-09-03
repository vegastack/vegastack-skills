import { describe, expect, test } from 'bun:test'
import { effectiveConcurrency, planParallelRun, readGroupsReport } from '../scripts/children.mjs'

const groups = [
  { id: 'api', members: ['#131'], files: ['packages/cli/src/dispatch.ts'] },
  { id: 'docs', members: ['#132'], files: ['README.md'] },
]
const issues = {
  131: { number: 131, title: 'Dispatch parent launches', type: 'feat' },
  132: { number: 132, title: 'README rows', type: 'docs' },
}
const base = { issues, parentBranch: 'feat/104-factory-runtime', parentHead: 'abc1234', repoRoot: '/r' }

describe('readGroupsReport', () => {
  test('accepts plan-lint --groups output and rejects anything else', () => {
    expect(readGroupsReport({ guard: 'plan-lint', ok: true, groups })).toEqual(groups)
    expect(() => readGroupsReport({ groups: 'api' })).toThrow(/not plan-lint --groups output/)
    expect(() => readGroupsReport({ groups: [{ id: 'api', members: ['#131'], files: [] }] })).toThrow(/declares no files/)
  })
})

describe('planParallelRun', () => {
  test('two groups plan a parallel run, one child per member, in plan order', () => {
    const run = planParallelRun({ ...base, groups })
    expect(run.mode).toBe('parallel')
    expect(run.children.map((c) => c.issue)).toEqual([131, 132])
    expect(run.children[0].branch).toBe('feat/131-dispatch-parent-launches')
    expect(run.children[0].path).toBe('/r/.vegastack/.worktrees/131-dispatch-parent-launches')
    expect(run.children[0].baseSha).toBe('abc1234')
    expect(run.children[1].files).toEqual(['README.md'])
  })
  test('one group is sequential, with the reason the parent puts in its ledger', () => {
    const run = planParallelRun({ ...base, groups: [groups[0]] })
    expect(run.mode).toBe('sequential')
    expect(run.reason).toContain('one independent group')
    expect(run.ledger).toBe('- Parallel: no — ' + run.reason + '; children run in plan order')
  })
  test('a member with no matching child issue is refused', () => {
    expect(() => planParallelRun({ ...base, groups: [{ id: 'api', members: ['#999'], files: ['a.ts'] }] })).toThrow(/#999/)
  })
})

describe('effectiveConcurrency', () => {
  test('the smallest of the configured cap, the machine, and the 16-agent ceiling', () => {
    expect(effectiveConcurrency({ configured: 4, cpus: 10 })).toBe(4)
    expect(effectiveConcurrency({ configured: null, cpus: 10 })).toBe(8)
    expect(effectiveConcurrency({ configured: 32, cpus: 64 })).toBe(16)
    expect(effectiveConcurrency({ configured: null, cpus: 1 })).toBe(1)
  })
})
