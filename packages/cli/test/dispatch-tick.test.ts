// The tick as a whole, with the network and the harness stubbed: what runTick asks gh for, what it
// launches, and what it writes to the state file. The pure decision functions have their own tests
// in dispatch.test.ts; these cover the seams between them, which is where the review found the
// silent drops.
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchRockets, readState, runTick, writeState, type PlannedRun, type RunOutcome, type TickDeps } from '../src/dispatch.ts'
import { parseFactoryConfig } from '../src/config.ts'

const CLAUDE_WIRING = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node .vegastack/hooks/ship-guard.mjs --harness claude' }] }] } })
const CODEX_WIRING = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node .vegastack/hooks/ship-guard.mjs --harness codex' }] }] } })

interface FixtureOptions {
  repos?: string[]
  devMd?: string
  maxRuns?: number
}

// One home with one or more opted-in repos, each wired for Claude in its main checkout.
function fixture(options: FixtureOptions = {}) {
  const home = mkdtempSync(join(tmpdir(), 'vf-tick-'))
  const names = options.repos ?? ['app']
  const devMd = options.devMd ?? 'dispatch: local\noperators: mk\nplan: claude fable-5-1 high\nimplement: claude fable-5-1 high\n'
  const repos = names.map(name => {
    const path = join(home, name)
    mkdirSync(join(path, '.vegastack/hooks'), { recursive: true })
    mkdirSync(join(path, '.claude'), { recursive: true })
    writeFileSync(join(path, '.vegastack/hooks/ship-guard.mjs'), '// guard\n')
    writeFileSync(join(path, '.claude/settings.json'), CLAUDE_WIRING)
    writeFileSync(join(path, '.vegastack/dev.md'), devMd)
    mkdirSync(join(home, '.vegastack/guard'), { recursive: true })
    writeFileSync(join(home, `.vegastack/guard/acme__${name}.json`), JSON.stringify({ schemaVersion: 1, repo: `acme/${name}`, defaultBranch: 'main', gates: 3, environments: [], shipAsk: [] }))
    return { path, repo: `acme/${name}`, org: 'acme' }
  })
  const config = parseFactoryConfig({ repos, maxRuns: options.maxRuns ?? 1 }, home)
  return { home, config, repos }
}

interface SearchRow { number: number; title: string; labels: string[]; assignees?: string[]; updated_at?: string }

// A gh that answers searches from a table and records every query it was asked.
function ghStub(rows: { needsPlan?: SearchRow[]; ready?: SearchRow[]; forOperator?: SearchRow[] }, extra?: (args: string[]) => string | null) {
  const queries: string[] = []
  const calls: string[][] = []
  const gh = async (args: string[]): Promise<string> => {
    calls.push(args)
    const custom = extra?.(args)
    if (custom !== null && custom !== undefined) return custom
    if (args[0] === 'api' && args.includes('search/issues')) {
      const q = args[args.indexOf('-f') + 1]!.slice(2)
      queries.push(q)
      const pick = q.includes('label:needs-plan') ? rows.needsPlan : q.includes('label:ready') ? rows.ready : rows.forOperator
      const items = (pick ?? []).map(row => ({
        number: row.number, title: row.title,
        labels: row.labels.map(name => ({ name })),
        assignees: (row.assignees ?? []).map(login => ({ login })),
        updated_at: row.updated_at ?? '2026-09-03T09:00:00Z',
      }))
      return JSON.stringify({ items })
    }
    if (args[0] === 'issue' && args.includes('body')) return JSON.stringify({ body: '' })
    return '[]'
  }
  return { gh, queries, calls }
}

const ensureWorktree: TickDeps['ensureWorktree'] = async (repoPath, issue, title) => {
  const slug = title.replace(/^[a-z]+:\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const path = join(repoPath, '.vegastack', '.worktrees', `${issue}-${slug}`)
  mkdirSync(join(path, '.vegastack/hooks'), { recursive: true })
  writeFileSync(join(path, '.vegastack/hooks/ship-guard.mjs'), '// guard\n')
  mkdirSync(join(path, '.claude'), { recursive: true })
  writeFileSync(join(path, '.claude/settings.json'), CLAUDE_WIRING)
  return { path, branch: `feat/${issue}-${slug}`, slug, type: 'feat' }
}

const finished = (run: PlannedRun): RunOutcome => ({ exitCode: 0, timedOut: false, logFile: `/logs/${run.issue}.jsonl`, pushed: true, handedBack: false })

describe('the corrections window (F17, F18)', () => {
  // A 🚀 on an existing comment does not move the issue's updated_at, and a comment posted while a
  // run was in flight lands before the next window opens. Neither may be dropped: every
  // for-operator issue is read on every tick, and the handled list is what stops the repeats.
  test('a second tick still asks for every for-operator issue, and finds a bare rocket on an old comment', async () => {
    const { home, config } = fixture()
    await writeState(config.stateFile, { lastTick: { 'acme/app': '2026-09-03T10:00:00Z' }, handled: [] })
    const { gh, queries } = ghStub({ forOperator: [{ number: 12, title: 'feat: thing', labels: ['for-operator'], assignees: ['mk'], updated_at: '2026-09-03T09:00:00Z' }] }, args => {
      if (args[0] === 'api' && args[1] === 'repos/acme/app/issues/12/comments') return JSON.stringify([{ id: 555, reactions: { rocket: 1 } }])
      if (args[0] === 'api' && args[1] === 'repos/acme/app/issues/comments/555/reactions') return JSON.stringify([{ id: 999, content: 'rocket', user: { login: 'mk' } }])
      return null
    })
    const result = await runTick(config, { dryRun: true }, { gh, ensureWorktree, execute: async run => finished(run), parentCandidates: async () => [] })
    expect(queries.some(q => q.includes('updated:'))).toBe(false)
    expect(result.runs.map(run => [run.issue, run.stage])).toEqual([[12, 'corrections']])
    expect(existsSync(home)).toBe(true)
  })

  test('a comment whose rockets are all handled costs no reactions call', async () => {
    const calls: string[][] = []
    const gh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args[1] === 'repos/acme/app/issues/12/comments') return JSON.stringify([{ id: 555, reactions: { rocket: 1 } }, { id: 556, reactions: { rocket: 2 } }])
      if (args[1] === 'repos/acme/app/issues/comments/556/reactions') return JSON.stringify([{ id: 1001, content: 'rocket', user: { login: 'mk' } }, { id: 1002, content: 'rocket', user: { login: 'ada' } }])
      return '[]'
    }
    const corrections = [{ number: 12, title: 'feat: thing', labels: ['for-operator'], assignees: ['mk'], updatedAt: '' }]
    const handled = [{ repo: 'acme/app', issue: 12, commentId: 555, reactionId: 999 }, { repo: 'acme/app', issue: 12, commentId: 556, reactionId: 1001 }]
    const rockets = await fetchRockets(gh, 'acme/app', corrections, handled)
    expect(calls.some(call => call[1] === 'repos/acme/app/issues/comments/555/reactions')).toBe(false)
    expect(rockets.map(rocket => rocket.reactionId)).toEqual([1001, 1002])
  })

  test('lastTick is the time the board was read, not the time the runs finished', async () => {
    const { config } = fixture()
    const { gh } = ghStub({ ready: [{ number: 8, title: 'feat: b', labels: ['ready'] }] })
    let clock = Date.parse('2026-09-03T10:00:00Z')
    const now = () => new Date(clock)
    const execute = async (run: PlannedRun): Promise<RunOutcome> => {
      clock += 40 * 60 * 1000
      return finished(run)
    }
    await runTick(config, { dryRun: false }, { gh, now, ensureWorktree, execute, parentCandidates: async () => [] })
    const state = await readState(config.stateFile)
    expect(state.lastTick['acme/app']).toBe('2026-09-03T10:00:00Z')
  })
})
