// The dispatcher: what a tick would do, and then doing it. Everything that decides is a pure
// function over data — a board, a set of reactions, a policy, the state file — so the whole
// decision surface is unit-testable without a network, a clock, or a running loop. The effectful
// half (searching, spawning, logging, handing back) is at the bottom and does no thinking.
//
// Refusals are first-class output, never silence: a repo that is skipped says why, in the JSON and
// in the log, because "nothing happened" and "the ship guard is unwired" look identical otherwise.
import { spawn } from 'node:child_process'
import { appendFile, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FactoryConfig, Harness, RepoPolicy, Stage } from './config.ts'
import type { LaunchPlan } from './launch.ts'
import { ghText } from './gh.ts'

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

// One log file per run, named so `ls` sorts by issue then time and two runs of the same issue never
// collide.
export function logPath(config: FactoryConfig, repo: string, issue: number, at: Date): string {
  const [org, name] = repo.split('/')
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  return join(config.logRoot, org ?? repo, name ?? repo, `${issue}-${stamp}.jsonl`)
}

// Pattern-based, and deliberately broad: this text goes into a public issue comment, so a shape
// that merely looks like a credential is redacted rather than reasoned about.
const SECRET_PATTERNS: RegExp[] = [
  /\bghp_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bgho_[A-Za-z0-9]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bnpm_[A-Za-z0-9]{16,}/g,
  /(Authorization:\s*\S+\s*)\S+/gi,
  /((?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GITHUB_TOKEN|GH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*[=:]\s*)\S+/g,
]

export function redact(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (...args) => {
      const groups = args.slice(1, -2)
      return typeof groups[0] === 'string' ? `${groups[0]}[redacted]` : '[redacted]'
    })
  }
  return out
}

export function tailLines(text: string, count: number): string {
  return text.split('\n').slice(-count).join('\n')
}

export function failureComment(input: {
  issue: number
  stage: Stage
  exitCode: number | null
  timedOut: boolean
  log: string
  worktree: string
  at: string
}): string {
  const how = input.timedOut ? 'timed out' : `failed with exit ${input.exitCode ?? 'unknown'}`
  return [
    '<!-- vsk:v1 type=handback -->',
    '## Hand-back',
    '',
    `The headless ${input.stage} run ${how} at ${input.at}. Nothing was handed back as finished, and no label beyond this one was moved.`,
    '',
    `The worktree is left in place at \`${input.worktree}\` — whatever the run had done is still there, and the ledger comment is the last checkpoint it reached.`,
    '',
    'Last 40 log lines (secrets redacted by pattern):',
    '',
    '```',
    redact(tailLines(input.log, 40)),
    '```',
  ].join('\n')
}

export interface RunOutcome {
  exitCode: number | null
  timedOut: boolean
  logFile: string
  pushed: boolean
  handedBack: boolean
}

export interface ExecuteDeps {
  now: () => Date
  gh: (args: string[], options?: { cwd?: string; input?: string }) => Promise<string>
  git: (args: string[], cwd: string) => Promise<{ ok: boolean; message: string }>
  timeoutMs: number
}

function defaultGit(args: string[], cwd: string): Promise<{ ok: boolean; message: string }> {
  return new Promise(resolve => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let message = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { message += chunk })
    child.stderr.on('data', (chunk: string) => { message += chunk })
    child.on('error', error => resolve({ ok: false, message: (error as Error).message }))
    child.on('close', code => resolve({ ok: code === 0, message: message.trim() }))
  })
}

// The effectful half, and the only place in this file that spawns a harness. Both pipes are
// streamed to the log as they arrive rather than buffered, so a dispatcher that dies still leaves a
// readable record of how far the run got, and a run that prints megabytes cannot exhaust memory.
//
// A run that fails is not retried and is never left looking finished: the branch is pushed anyway
// (an evidence sha only resolves once the commit is on the remote), a hand-back comment carrying
// the redacted tail is posted, the issue goes back to `needs-operator` assigned to its operator,
// and the worktree is left exactly as the run left it.
export async function executeRun(
  run: PlannedRun,
  plan: LaunchPlan,
  config: FactoryConfig,
  options: { operator: string | null },
  deps?: Partial<ExecuteDeps>,
): Promise<RunOutcome> {
  const now = deps?.now ?? (() => new Date())
  const gh = deps?.gh ?? ((args: string[], ghOptions?: { cwd?: string; input?: string }) => ghText(args, ghOptions))
  const git = deps?.git ?? defaultGit
  const timeoutMs = deps?.timeoutMs ?? 6 * 60 * 60 * 1000
  const startedAt = now()
  const file = logPath(config, run.repo, run.issue, startedAt)
  await mkdir(dirname(file), { recursive: true })
  await refuseSymlink(file)
  const lines: string[] = []
  const record = (row: Record<string, unknown>): void => { lines.push(JSON.stringify(row)) }
  const flush = async (): Promise<void> => {
    if (lines.length === 0) return
    await appendFile(file, `${lines.join('\n')}\n`)
    lines.length = 0
  }
  record({ at: startedAt.toISOString(), event: 'start', repo: run.repo, issue: run.issue, stage: run.stage, command: plan.command, args: plan.args, cwd: plan.cwd })
  await flush()

  let tail = ''
  const outcome = await new Promise<{ exitCode: number | null; timedOut: boolean }>(resolve => {
    const child = spawn(plan.command, plan.args, { cwd: plan.cwd, env: { ...process.env, ...plan.env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
    for (const stream of ['stdout', 'stderr'] as const) {
      child[stream].setEncoding('utf8')
      child[stream].on('data', (chunk: string) => {
        tail = `${tail}${chunk}`.split('\n').slice(-200).join('\n')
        record({ at: new Date().toISOString(), stream, text: chunk })
        void flush()
      })
    }
    child.on('error', error => {
      clearTimeout(timer)
      record({ at: new Date().toISOString(), stream: 'stderr', text: `could not start ${plan.command}: ${(error as Error).message}` })
      resolve({ exitCode: null, timedOut })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ exitCode: code, timedOut })
    })
  })

  const push = await git(['push', '-u', 'origin', 'HEAD'], plan.cwd)
  if (!push.ok) record({ at: new Date().toISOString(), event: 'push-failed', message: redact(push.message) })

  let handedBack = false
  const failed = outcome.timedOut || outcome.exitCode !== 0
  if (failed) {
    const body = failureComment({
      issue: run.issue,
      stage: run.stage,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      log: tail,
      worktree: plan.cwd,
      at: new Date().toISOString(),
    })
    try {
      await gh(['issue', 'comment', String(run.issue), '--repo', run.repo, '--body-file', '-'], { input: body })
      const edit = ['issue', 'edit', String(run.issue), '--repo', run.repo, '--add-label', 'needs-operator', '--remove-label', 'working']
      if (options.operator) edit.push('--add-assignee', options.operator)
      await gh(edit)
      handedBack = true
    } catch (error) {
      // A hand-back that cannot be posted must not take the dispatcher down with it; the log is
      // then the only record, and `vegafactory status` surfaces the run as failed either way.
      record({ at: new Date().toISOString(), event: 'handback-failed', message: redact((error as Error).message) })
    }
  }
  record({ at: new Date().toISOString(), event: 'exit', exitCode: outcome.exitCode, timedOut: outcome.timedOut, pushed: push.ok, handedBack })
  await flush()
  return { exitCode: outcome.exitCode, timedOut: outcome.timedOut, logFile: file, pushed: push.ok, handedBack }
}
