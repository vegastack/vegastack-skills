// The dispatcher: what a tick would do, and then doing it. Everything that decides is a pure
// function over data — a board, a set of reactions, a policy, the state file — so the whole
// decision surface is unit-testable without a network, a clock, or a running loop. The effectful
// half (searching, spawning, logging, handing back) is at the bottom and does no thinking.
//
// Refusals are first-class output, never silence: a repo that is skipped says why, in the JSON and
// in the log, because "nothing happened" and "the ship guard is unwired" look identical otherwise.
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Harness, RepoPolicy, Stage } from './config.ts'

export interface BoardIssue {
  number: number
  title: string
  labels: string[]
  assignees: string[]
  updatedAt: string
}

export interface PlannedRun {
  repo: string
  issue: number
  title: string
  stage: Stage
  commentId: number | null
  reactionId: number | null
}

export interface Refusal {
  repo: string
  issue: number | null
  reason: string
}

export interface TickPlan {
  runs: PlannedRun[]
  refusals: Refusal[]
}

// The state labels are exactly the ones conventions.md defines; an issue wearing two of them is a
// board in a state no skill produced, and guessing which one wins is how a plan run lands on an
// issue somebody is already implementing.
const STATE_LABELS = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator']

// `no:assignee` is in the query and checked again here: search indexes lag, and a stale index is
// exactly how two runs start on one issue.
export function searchQueries(repo: string, since: string | null): { needsPlan: string; ready: string; corrections: string } {
  const scope = `repo:${repo} is:issue is:open`
  return {
    needsPlan: `${scope} label:needs-plan`,
    ready: `${scope} label:ready no:assignee`,
    corrections: since ? `${scope} label:for-operator updated:>=${since}` : `${scope} label:for-operator`,
  }
}

function stateLabelRefusal(repo: string, issue: BoardIssue): Refusal | null {
  const states = issue.labels.filter(label => STATE_LABELS.includes(label))
  if (states.length > 1) {
    return { repo, issue: issue.number, reason: `#${issue.number} carries two state labels (${states.join(', ')}) — the board says nothing a run could act on` }
  }
  if (issue.labels.includes('epic')) {
    return { repo, issue: issue.number, reason: `#${issue.number} is an epic — epics are maps, and only their children ever run` }
  }
  return null
}

export function planLabelRuns(input: { repo: string; needsPlan: BoardIssue[]; ready: BoardIssue[] }): TickPlan {
  const runs: PlannedRun[] = []
  const refusals: Refusal[] = []
  const consider = (issue: BoardIssue, stage: Stage): void => {
    const refusal = stateLabelRefusal(input.repo, issue)
    if (refusal) {
      refusals.push(refusal)
      return
    }
    if (issue.assignees.length > 0) {
      refusals.push({
        repo: input.repo,
        issue: issue.number,
        reason: `#${issue.number} is assigned to ${issue.assignees.join(', ')} — somebody may be mid-claim`,
      })
      return
    }
    runs.push({ repo: input.repo, issue: issue.number, title: issue.title, stage, commentId: null, reactionId: null })
  }
  for (const issue of input.needsPlan) consider(issue, 'plan')
  for (const issue of input.ready) consider(issue, 'implement')
  return { runs, refusals }
}

export interface Rocket {
  issue: number
  commentId: number
  reactionId: number
  login: string
}

export interface HandledRun {
  repo: string
  issue: number
  commentId: number | null
  reactionId: number | null
}

export interface DispatchState {
  lastTick: Record<string, string>
  handled: HandledRun[]
}

function handledKey(run: HandledRun): string {
  return `${run.repo}#${run.issue}#${run.commentId ?? '-'}#${run.reactionId ?? '-'}`
}

// A rocket is a start signal from a named human, and nothing else is. Three things have to hold
// before a corrections run exists: the issue is still `for-operator` (the board moved while the
// tick was reading), the reacting login is in the repo's `operators:` list, and this exact reaction
// id has never been handled. The last one is why the state file exists at all — reactions have no
// "seen" bit, so a restart would otherwise re-run every correction ever asked for.
export function planRocketRuns(input: {
  repo: string
  corrections: BoardIssue[]
  rockets: Rocket[]
  operators: string[]
  state: DispatchState
}): TickPlan {
  const runs: PlannedRun[] = []
  const refusals: Refusal[] = []
  const handled = new Set(input.state.handled.map(handledKey))
  const byIssue = new Map(input.corrections.map(issue => [issue.number, issue]))
  const newestByIssue = new Map<number, Rocket>()

  for (const rocket of input.rockets) {
    if (handled.has(handledKey({ repo: input.repo, issue: rocket.issue, commentId: rocket.commentId, reactionId: rocket.reactionId }))) continue
    const issue = byIssue.get(rocket.issue)
    if (!issue) {
      refusals.push({ repo: input.repo, issue: rocket.issue, reason: `#${rocket.issue} is no longer for-operator — the reaction is left for the next tick to re-read` })
      continue
    }
    if (input.operators.length === 0) {
      refusals.push({ repo: input.repo, issue: rocket.issue, reason: `#${rocket.issue} has a rocket but the profile lists no operators: — nobody is trusted to start a run` })
      continue
    }
    if (!input.operators.includes(rocket.login)) {
      refusals.push({ repo: input.repo, issue: rocket.issue, reason: `the rocket on #${rocket.issue} is from ${rocket.login}, who is not in operators: — only a listed operator starts a run` })
      continue
    }
    const current = newestByIssue.get(rocket.issue)
    // One run per issue: the newest reacted comment wins, because that is the correction the
    // operator wrote last and it is the one the run is told to read from.
    if (!current || rocket.commentId > current.commentId) newestByIssue.set(rocket.issue, rocket)
  }

  for (const rocket of newestByIssue.values()) {
    const issue = byIssue.get(rocket.issue)!
    runs.push({ repo: input.repo, issue: issue.number, title: issue.title, stage: 'corrections', commentId: rocket.commentId, reactionId: rocket.reactionId })
  }
  return { runs, refusals }
}

export function recordHandled(state: DispatchState, run: PlannedRun): DispatchState {
  const entry: HandledRun = { repo: run.repo, issue: run.issue, commentId: run.commentId, reactionId: run.reactionId }
  if (state.handled.some(existing => handledKey(existing) === handledKey(entry))) return state
  return { lastTick: { ...state.lastTick }, handled: [...state.handled, entry] }
}

export function withLastTick(state: DispatchState, repo: string, at: string): DispatchState {
  return { lastTick: { ...state.lastTick, [repo]: at }, handled: state.handled }
}

// A state file that cannot be read is an empty state on purpose: the worst it costs is one repeated
// corrections run, while throwing would stop a service whose whole job is to keep ticking. The
// write is the opposite — temp file plus rename, and a symlinked target is refused, because that
// path is attacker-controlled the moment somebody else can write the home directory.
export async function readState(path: string): Promise<DispatchState> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return { lastTick: {}, handled: [] }
  }
  const document = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>
  const lastTick: Record<string, string> = {}
  if (document.lastTick && typeof document.lastTick === 'object') {
    for (const [repo, at] of Object.entries(document.lastTick as Record<string, unknown>)) {
      if (typeof at === 'string') lastTick[repo] = at
    }
  }
  const handled: HandledRun[] = []
  if (Array.isArray(document.handled)) {
    for (const entry of document.handled) {
      const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
      if (typeof row.repo === 'string' && typeof row.issue === 'number') {
        handled.push({
          repo: row.repo,
          issue: row.issue,
          commentId: typeof row.commentId === 'number' ? row.commentId : null,
          reactionId: typeof row.reactionId === 'number' ? row.reactionId : null,
        })
      }
    }
  }
  return { lastTick, handled }
}

export async function writeState(path: string, state: DispatchState): Promise<void> {
  await refuseSymlink(path)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify({ lastTick: state.lastTick, handled: state.handled }, null, 2)}\n`)
  await rename(temp, path)
}

export async function refuseSymlink(path: string): Promise<void> {
  try {
    const stats = await lstat(path)
    if (stats.isSymbolicLink()) throw new Error(`refusing to write ${path}: it is a symlink`)
  } catch (error) {
    if ((error as Error).message.startsWith('refusing to write')) throw error
  }
}

export interface GuardState {
  shipGuard: { wired: boolean; detail: string }
  lock: { held: boolean; pid: number | null }
  activeRuns: number
}

// The four things that must all be true before a repo may start anything. Each returns its own
// refusal so the operator reads a reason and not a silence; a non-empty result means nothing
// launches for that repo this tick.
export function evaluateGuards(input: { repo: string; policy: RepoPolicy; guards: GuardState; maxRuns: number }): Refusal[] {
  const refusals: Refusal[] = []
  const at = (reason: string): Refusal => ({ repo: input.repo, issue: null, reason })
  if (input.policy.dispatch !== 'local') {
    refusals.push(at(`${input.repo} has dispatch: off — a repo runs dark builds only once its operator opts in`))
  }
  if (!input.guards.shipGuard.wired) {
    refusals.push(at(`${input.repo} has no wired ship guard: ${input.guards.shipGuard.detail} — dark builds run under bypass, and the guard is what bounds them`))
  }
  if (input.guards.lock.held) {
    refusals.push(at(`${input.repo} is locked by pid ${input.guards.lock.pid ?? 'unknown'} — another run holds it`))
  }
  if (input.guards.activeRuns >= input.maxRuns) {
    refusals.push(at(`${input.repo} is at maxRuns ${input.maxRuns} with ${input.guards.activeRuns} in flight`))
  }
  return refusals
}

// Wired means two files agree: the guard script exists, and this harness's hook config actually
// calls it. Either one missing or unreadable is unwired — the whole point of the check is that a
// repo whose guard state cannot be established never starts an unattended run.
export async function shipGuardWired(repoPath: string, harness: Harness): Promise<{ wired: boolean; detail: string }> {
  const guardPath = join(repoPath, '.vegastack', 'hooks', 'ship-guard.mjs')
  try {
    await readFile(guardPath, 'utf8')
  } catch {
    return { wired: false, detail: `no ${join('.vegastack', 'hooks', 'ship-guard.mjs')} in ${repoPath}` }
  }
  const wiringPath = harness === 'claude'
    ? join(repoPath, '.claude', 'settings.json')
    : join(repoPath, '.codex', 'hooks.json')
  const relative = harness === 'claude' ? '.claude/settings.json' : '.codex/hooks.json'
  let text: string
  try {
    text = await readFile(wiringPath, 'utf8')
  } catch {
    return { wired: false, detail: `${relative} is missing — the guard script is there but nothing calls it` }
  }
  try {
    JSON.parse(text)
  } catch {
    return { wired: false, detail: `${relative} is not valid JSON — the wiring cannot be read, so it counts as unwired` }
  }
  if (!text.includes('ship-guard.mjs')) {
    return { wired: false, detail: `${relative} does not call ship-guard.mjs` }
  }
  return { wired: true, detail: `.vegastack/hooks/ship-guard.mjs wired for ${harness} in ${relative}` }
}

// Guards first, then the board, then the reactions, then the budget. Truncation is loud: every run
// the budget drops is named, because a silently dropped correction looks to the operator exactly
// like a dispatcher that ignored them.
export function planTick(input: {
  repo: string
  policy: RepoPolicy
  board: { needsPlan: BoardIssue[]; ready: BoardIssue[]; corrections: BoardIssue[] }
  rockets: Rocket[]
  state: DispatchState
  guards: GuardState
  maxRuns: number
}): TickPlan {
  const guardRefusals = evaluateGuards({ repo: input.repo, policy: input.policy, guards: input.guards, maxRuns: input.maxRuns })
  if (guardRefusals.length > 0) return { runs: [], refusals: guardRefusals }

  const labels = planLabelRuns({ repo: input.repo, needsPlan: input.board.needsPlan, ready: input.board.ready })
  const rockets = planRocketRuns({
    repo: input.repo,
    corrections: input.board.corrections,
    rockets: input.rockets,
    operators: input.policy.operators,
    state: input.state,
  })
  const candidates = [...labels.runs, ...rockets.runs]
  const budget = Math.max(0, input.maxRuns - input.guards.activeRuns)
  const runs = candidates.slice(0, budget)
  const dropped = candidates.slice(budget).map(run => ({
    repo: input.repo,
    issue: run.issue,
    reason: `#${run.issue} (${run.stage}) waits for the next tick — maxRuns ${input.maxRuns} is already committed`,
  }))
  return { runs, refusals: [...labels.refusals, ...rockets.refusals, ...dropped] }
}
