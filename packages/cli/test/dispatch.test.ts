import { describe, expect, test } from 'bun:test'
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  evaluateGuards, planLabelRuns, planRocketRuns, planTick, readState, recordHandled,
  searchQueries, shipGuardWired, writeState,
  type BoardIssue, type DispatchState, type GuardState, type Rocket,
} from '../src/dispatch.ts'
import { parseRepoPolicy } from '../src/config.ts'

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

const wired: GuardState = { shipGuard: { wired: true, detail: '.vegastack/hooks/ship-guard.mjs wired for claude' }, lock: { held: false, pid: null }, activeRuns: 0 }
const local = parseRepoPolicy('dispatch: local\noperators: mk\nplan: claude fable-5-1 high\nimplement: claude fable-5-1 high\n')
const board = {
  needsPlan: [{ number: 7, title: 'feat: a', labels: ['needs-plan'], assignees: [], updatedAt: '2026-09-03T10:00:00Z' }],
  ready: [{ number: 8, title: 'feat: b', labels: ['ready'], assignees: [], updatedAt: '2026-09-03T10:00:00Z' }],
  corrections: [],
}

describe('evaluateGuards', () => {
  test('an unwired ship guard refuses the whole repo with the reason', () => {
    const refusals = evaluateGuards({ repo: 'acme/app', policy: local, guards: { ...wired, shipGuard: { wired: false, detail: 'no .vegastack/hooks/ship-guard.mjs' } }, maxRuns: 1 })
    expect(refusals[0]!.reason).toContain('ship guard')
    expect(refusals[0]!.reason).toContain('no .vegastack/hooks/ship-guard.mjs')
  })

  test('dispatch: off refuses even with everything else wired', () => {
    const refusals = evaluateGuards({ repo: 'acme/app', policy: parseRepoPolicy('dispatch: off\n'), guards: wired, maxRuns: 1 })
    expect(refusals[0]!.reason).toContain('dispatch: off')
  })

  test('a held lock refuses and names the pid', () => {
    const refusals = evaluateGuards({ repo: 'acme/app', policy: local, guards: { ...wired, lock: { held: true, pid: 4242 } }, maxRuns: 1 })
    expect(refusals[0]!.reason).toContain('4242')
  })

  test('a repo already at maxRuns refuses without reading the board', () => {
    const refusals = evaluateGuards({ repo: 'acme/app', policy: local, guards: { ...wired, activeRuns: 1 }, maxRuns: 1 })
    expect(refusals[0]!.reason).toContain('maxRuns')
  })

  test('a fully wired opted-in repo with a free lock refuses nothing', () => {
    expect(evaluateGuards({ repo: 'acme/app', policy: local, guards: wired, maxRuns: 1 })).toEqual([])
  })
})

describe('shipGuardWired', () => {
  function repoWith(options: { guard: boolean; settings: string | null; harness: 'claude' | 'codex' }): string {
    const root = mkdtempSync(join(tmpdir(), 'vsk-guard-'))
    mkdirSync(join(root, '.vegastack/hooks'), { recursive: true })
    if (options.guard) writeFileSync(join(root, '.vegastack/hooks/ship-guard.mjs'), '// guard\n')
    const dir = options.harness === 'claude' ? '.claude' : '.codex'
    const file = options.harness === 'claude' ? 'settings.json' : 'hooks.json'
    mkdirSync(join(root, dir), { recursive: true })
    if (options.settings !== null) writeFileSync(join(root, dir, file), options.settings)
    return root
  }

  const claudeSettings = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node .vegastack/hooks/ship-guard.mjs --harness claude' }] }] } })

  test('a guard file wired into the harness config reads as wired', async () => {
    const result = await shipGuardWired(repoWith({ guard: true, settings: claudeSettings, harness: 'claude' }), 'claude')
    expect(result.wired).toBe(true)
  })

  test('a guard file that no harness config references is unwired, and says which file is missing it', async () => {
    const result = await shipGuardWired(repoWith({ guard: true, settings: JSON.stringify({ hooks: {} }), harness: 'claude' }), 'claude')
    expect(result.wired).toBe(false)
    expect(result.detail).toContain('.claude/settings.json')
  })

  test('a missing guard file is unwired whatever the harness config says', async () => {
    const result = await shipGuardWired(repoWith({ guard: false, settings: claudeSettings, harness: 'claude' }), 'claude')
    expect(result.wired).toBe(false)
    expect(result.detail).toContain('ship-guard.mjs')
  })

  test('codex wiring is read from .codex/hooks.json', async () => {
    const settings = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node .vegastack/hooks/ship-guard.mjs --harness codex' }] }] } })
    expect((await shipGuardWired(repoWith({ guard: true, settings, harness: 'codex' }), 'codex')).wired).toBe(true)
  })

  test('an unreadable wiring file is treated as unwired, never as fine', async () => {
    const result = await shipGuardWired(repoWith({ guard: true, settings: '{ not json', harness: 'claude' }), 'claude')
    expect(result.wired).toBe(false)
  })
})

describe('planTick', () => {
  test('maxRuns 1 launches the first run and refuses the rest by name', () => {
    const plan = planTick({ repo: 'acme/app', policy: local, board, rockets: [], state: { lastTick: {}, handled: [] }, guards: wired, maxRuns: 1 })
    expect(plan.runs.map(run => run.issue)).toEqual([7])
    expect(plan.refusals.some(refusal => refusal.reason.includes('maxRuns'))).toBe(true)
  })

  test('a guard refusal means no runs at all, whatever the board says', () => {
    const plan = planTick({ repo: 'acme/app', policy: local, board, rockets: [], state: { lastTick: {}, handled: [] }, guards: { ...wired, shipGuard: { wired: false, detail: 'unwired' } }, maxRuns: 1 })
    expect(plan.runs).toEqual([])
  })

  test('corrections come after the label runs, and the budget counts every stage', () => {
    const rockets: Rocket[] = [{ issue: 12, commentId: 555, reactionId: 999, login: 'mk' }]
    const withCorrections = { ...board, corrections: [forOperator] }
    const plan = planTick({ repo: 'acme/app', policy: local, board: withCorrections, rockets, state: { lastTick: {}, handled: [] }, guards: wired, maxRuns: 3 })
    expect(plan.runs.map(run => run.stage)).toEqual(['plan', 'implement', 'corrections'])
  })
})
