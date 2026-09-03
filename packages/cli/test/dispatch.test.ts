import { describe, expect, test } from 'bun:test'
import { planLabelRuns, searchQueries, type BoardIssue } from '../src/dispatch.ts'

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
