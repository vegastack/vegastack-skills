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

import { childPrompt, claudeWorkflowCall, codexChildLaunch } from '../scripts/children.mjs'

describe('launch shapes', () => {
  const run = planParallelRun({ ...base, groups })
  test('the Claude path is one Workflow call by name, children in plan order', () => {
    const call = claudeWorkflowCall(run, { concurrency: 2 })
    expect(call.name).toBe('implement-children')
    expect(call.args.parentBranch).toBe('feat/104-factory-runtime')
    expect(call.args.parentHead).toBe('abc1234')
    expect(call.args.concurrency).toBe(2)
    expect(call.args.children.map((c: { issue: number }) => c.issue)).toEqual([131, 132])
    expect(call.args.children[0].files).toEqual(['packages/cli/src/dispatch.ts'])
    expect(call.args.children[0].prompt).toContain('create your branch feat/131-dispatch-parent-launches from abc1234')
  })
  test('the Codex path is one codex exec per child, pinned to that child worktree', () => {
    const launch = codexChildLaunch(run.children[0], { codex: 'codex', model: 'gpt-5.6', effort: 'high', parentIssue: 104, parentBranch: 'feat/104-factory-runtime' })
    expect(launch.command).toBe('codex')
    expect(launch.args).toEqual([
      'exec', '-C', '/r/.vegastack/.worktrees/131-dispatch-parent-launches',
      '--sandbox', 'workspace-write', '-a', 'never', '--dangerously-bypass-hook-trust',
      '-c', 'model=gpt-5.6', '-c', 'model_reasoning_effort=high', '--json', launch.prompt,
    ])
  })
  test('the prompt names the declared file set and the stop rule', () => {
    const prompt = childPrompt(run.children[1], { parentIssue: 104, parentBranch: 'feat/104-factory-runtime' })
    expect(prompt).toContain('#132')
    expect(prompt).toContain('README.md')
    expect(prompt).toContain('outside that set')
  })
})

import { evaluateJoin, mergeArgs, scopeViolations } from '../scripts/children.mjs'

describe('the join', () => {
  const run = planParallelRun({ ...base, groups })
  test('scope is exact paths plus declared directories', () => {
    expect(scopeViolations(['packages/cli/src/dispatch.ts'], ['packages/cli/src/dispatch.ts'])).toEqual([])
    expect(scopeViolations(['packages/cli/src/index.ts'], ['packages/cli/src/dispatch.ts'])).toEqual(['packages/cli/src/index.ts'])
    expect(scopeViolations(['packages/cli/src/a.ts'], ['packages/cli/'])).toEqual([])
  })
  test('clean children merge in plan order; a wanderer blocks and a failure warns', () => {
    const outcome = evaluateJoin({
      children: run.children,
      results: { 131: { status: 'done', head: 'aaaaaaa' }, 132: { status: 'failed', message: 'tests red' } },
      changed: { 131: ['packages/cli/src/dispatch.ts'], 132: [] },
    })
    expect(outcome.merge.map((m) => m.issue)).toEqual([131])
    expect(outcome.warns.some((w) => w.includes('#132') && w.includes('left in place'))).toBe(true)
    expect(outcome.blocks).toEqual([])
    expect(outcome.ledger[0]).toBe('- Parallel: 2 children — join order #131, #132')
  })
  test('a child outside its declared set is not merged and blocks the join', () => {
    const outcome = evaluateJoin({
      children: run.children,
      results: { 131: { status: 'done', head: 'aaaaaaa' }, 132: { status: 'done', head: 'bbbbbbb' } },
      changed: { 131: ['packages/cli/src/dispatch.ts'], 132: ['README.md', 'packages/cli/src/dispatch.ts'] },
    })
    expect(outcome.merge.map((m) => m.issue)).toEqual([131])
    expect(outcome.blocks.some((b) => b.includes('#132') && b.includes('outside its declared set'))).toBe(true)
  })
  test('a merge is fast-forward only', () => {
    expect(mergeArgs(run.children[0])).toEqual(['merge', '--ff-only', 'feat/131-dispatch-parent-launches'])
  })
})

import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('the children.mjs command line', () => {
  const script = join(import.meta.dir, '../scripts/children.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'vsk-children-'))
  const report = join(dir, 'groups.json')
  writeFileSync(report, JSON.stringify({ guard: 'plan-lint', ok: true, groups }))

  test('plan is dry-run, prints the run plan, and exits 0', () => {
    const r = Bun.spawnSync(['node', script, 'plan', '--parent', '104', '--groups', report, '--json'])
    expect(r.exitCode).toBe(0)
    const out = JSON.parse(r.stdout.toString())
    expect(out.guard).toBe('children')
    expect(out.plan.mode).toBe('parallel')
    expect(out.plan.children.map((c: { issue: number }) => c.issue)).toEqual([131, 132])
    expect(out.wrote).toBe(false)
  })
  test('a missing groups report blocks with a reason and exits 2', () => {
    const r = Bun.spawnSync(['node', script, 'plan', '--parent', '104', '--groups', join(dir, 'absent.json'), '--json'])
    expect(r.exitCode).toBe(2)
    expect(JSON.parse(r.stdout.toString()).blocks.join(' ')).toContain('groups report')
  })
  test('a symlinked groups report is refused', () => {
    const link = join(dir, 'linked.json')
    symlinkSync(report, link)
    const r = Bun.spawnSync(['node', script, 'plan', '--parent', '104', '--groups', link, '--json'])
    expect(r.exitCode).toBe(2)
    expect(JSON.parse(r.stdout.toString()).blocks.join(' ')).toContain('symlink')
  })
  test('an unknown verb prints the usage line and exits 2', () => {
    const r = Bun.spawnSync(['node', script, 'sprint', '--json'])
    expect(r.exitCode).toBe(2)
    expect(r.stdout.toString()).toContain('usage: children.mjs')
  })
})

describe('one wanderer never strands its siblings', () => {
  test('the clean child is still in the merge list when another child left its set', () => {
    const run = planParallelRun({ ...base, groups })
    const outcome = evaluateJoin({
      children: run.children,
      results: { 131: { status: 'done', head: 'aaaaaaa' }, 132: { status: 'done', head: 'bbbbbbb' } },
      changed: { 131: ['packages/cli/src/dispatch.ts'], 132: ['packages/cli/src/dispatch.ts'] },
    })
    expect(outcome.merge.map((m) => m.issue)).toEqual([131])
    expect(outcome.stop.map((s) => s.issue)).toEqual([132])
    expect(outcome.ledger).toContain('- Join: #131 merged aaaaaaa')
  })
  test('a failed child is a warn and the other still merges', () => {
    const run = planParallelRun({ ...base, groups })
    const outcome = evaluateJoin({
      children: run.children,
      results: { 131: { status: 'failed', message: 'tests red' }, 132: { status: 'done', head: 'bbbbbbb' } },
      changed: { 131: [], 132: ['README.md'] },
    })
    expect(outcome.merge.map((m) => m.issue)).toEqual([132])
    expect(outcome.blocks).toEqual([])
  })
})
