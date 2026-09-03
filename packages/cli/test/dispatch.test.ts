import { describe, expect, test } from 'bun:test'
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  planLabelRuns, planRocketRuns, readState, recordHandled, searchQueries, writeState,
  type BoardIssue, type DispatchState, type Rocket,
} from '../src/dispatch.ts'

const issue = (number: number, labels: string[], assignees: string[] = []): BoardIssue =>
  ({ number, title: `feat: thing ${number}`, labels, assignees, updatedAt: '2026-09-03T10:00:00Z' })

describe('searchQueries', () => {
  test('one query per state, scoped to the repo, ready excluding assignees', () => {
    const q = searchQueries('acme/app', '2026-09-03T09:00:00Z')
    expect(q.needsPlan).toBe('repo:acme/app is:issue is:open label:needs-plan')
    expect(q.ready).toBe('repo:acme/app is:issue is:open label:ready no:assignee')
    expect(q.corrections).toBe('repo:acme/app is:issue is:open label:for-operator updated:>=2026-09-03T09:00:00Z')
  })

  test('a first tick with no recorded time asks for every for-operator issue', () => {
    expect(searchQueries('acme/app', null).corrections).toBe('repo:acme/app is:issue is:open label:for-operator')
  })
})

describe('planLabelRuns', () => {
  test('needs-plan becomes a plan run and ready becomes an implement run', () => {
    const plan = planLabelRuns({ repo: 'acme/app', needsPlan: [issue(7, ['needs-plan'])], ready: [issue(8, ['ready'])] })
    expect(plan.runs.map(run => [run.issue, run.stage])).toEqual([[7, 'plan'], [8, 'implement']])
    expect(plan.runs[0]!.commentId).toBeNull()
  })

  test('a ready issue that still carries an assignee is refused, naming the assignee', () => {
    const plan = planLabelRuns({ repo: 'acme/app', needsPlan: [], ready: [issue(9, ['ready'], ['ada'])] })
    expect(plan.runs).toEqual([])
    expect(plan.refusals[0]!.reason).toContain('assigned to ada')
  })

  test('an issue carrying two state labels is refused, never guessed', () => {
    const plan = planLabelRuns({ repo: 'acme/app', needsPlan: [issue(10, ['needs-plan', 'working'])], ready: [] })
    expect(plan.runs).toEqual([])
    expect(plan.refusals[0]!.reason).toContain('two state labels')
  })

  test('an epic never starts a run, whatever state label it carries', () => {
    const plan = planLabelRuns({ repo: 'acme/app', needsPlan: [], ready: [issue(11, ['ready', 'epic'])] })
    expect(plan.runs).toEqual([])
    expect(plan.refusals[0]!.reason).toContain('epic')
  })
})

const empty: DispatchState = { lastTick: {}, handled: [] }
const forOperator: BoardIssue = { number: 12, title: 'feat: thing', labels: ['for-operator'], assignees: ['mk'], updatedAt: '2026-09-03T10:00:00Z' }
const rocket = (login: string): Rocket => ({ issue: 12, commentId: 555, reactionId: 999, login })

describe('planRocketRuns', () => {
  test('a rocket from a listed operator starts one corrections run carrying the reacted comment', () => {
    const plan = planRocketRuns({ repo: 'acme/app', corrections: [forOperator], rockets: [rocket('mk')], operators: ['mk'], state: empty })
    expect(plan.runs).toHaveLength(1)
    expect(plan.runs[0]!.stage).toBe('corrections')
    expect(plan.runs[0]!.commentId).toBe(555)
    expect(plan.runs[0]!.reactionId).toBe(999)
  })

  test('a rocket from someone who is not an operator is refused, naming the login', () => {
    const plan = planRocketRuns({ repo: 'acme/app', corrections: [forOperator], rockets: [rocket('drive-by')], operators: ['mk'], state: empty })
    expect(plan.runs).toEqual([])
    expect(plan.refusals[0]!.reason).toContain('drive-by')
  })

  test('a reaction already in the state file never launches twice', () => {
    const state = recordHandled(empty, { repo: 'acme/app', issue: 12, title: 't', stage: 'corrections', commentId: 555, reactionId: 999 })
    const plan = planRocketRuns({ repo: 'acme/app', corrections: [forOperator], rockets: [rocket('mk')], operators: ['mk'], state })
    expect(plan.runs).toEqual([])
    expect(plan.refusals).toEqual([])
  })

  test('two rockets on different comments of one issue produce one run, the newest comment', () => {
    const rockets: Rocket[] = [rocket('mk'), { issue: 12, commentId: 777, reactionId: 1001, login: 'mk' }]
    const plan = planRocketRuns({ repo: 'acme/app', corrections: [forOperator], rockets, operators: ['mk'], state: empty })
    expect(plan.runs).toHaveLength(1)
    expect(plan.runs[0]!.commentId).toBe(777)
  })

  test('a rocket on an issue that is no longer for-operator is refused, not run', () => {
    const plan = planRocketRuns({ repo: 'acme/app', corrections: [], rockets: [rocket('mk')], operators: ['mk'], state: empty })
    expect(plan.runs).toEqual([])
    expect(plan.refusals[0]!.reason).toContain('for-operator')
  })

  test('no operators listed means no rocket is trusted', () => {
    const plan = planRocketRuns({ repo: 'acme/app', corrections: [forOperator], rockets: [rocket('mk')], operators: [], state: empty })
    expect(plan.runs).toEqual([])
    expect(plan.refusals[0]!.reason).toContain('operators:')
  })
})

describe('readState and writeState', () => {
  test('a round trip keeps the handled runs and the last tick', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'vsk-state-')), 'state.json')
    await writeState(path, { lastTick: { 'acme/app': '2026-09-03T10:00:00Z' }, handled: [{ repo: 'acme/app', issue: 12, commentId: 555, reactionId: 999 }] })
    const back = await readState(path)
    expect(back.lastTick['acme/app']).toBe('2026-09-03T10:00:00Z')
    expect(back.handled[0]!.reactionId).toBe(999)
  })

  test('a missing or unparseable state file is an empty state, never a throw', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vsk-state-'))
    expect(await readState(join(dir, 'absent.json'))).toEqual({ lastTick: {}, handled: [] })
    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{ not json')
    expect(await readState(broken)).toEqual({ lastTick: {}, handled: [] })
  })

  test('a symlinked state path is refused rather than followed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vsk-state-'))
    const real = join(dir, 'real.json')
    writeFileSync(real, '{}')
    const link = join(dir, 'link.json')
    symlinkSync(real, link)
    await expect(writeState(link, empty)).rejects.toThrow(/symlink/)
  })
})
