// What the dispatcher is allowed to do, split the way responsibility is split: machine facts in
// `~/.vegastack/factory.json` (which repos this box watches, how often, how many runs at once) and
// policy in each repo's `.vegastack/dev.md` (whether the repo is opted in at all, who its operators
// are, which harness runs which stage). Nothing here touches the network or the disk except
// `loadFactoryConfig`, so every branch is unit-testable.
//
// Fail closed is the rule, not a mood: a dev.md with no `dispatch:` line is `off`, an unknown value
// is `off`, a stage naming a harness this dispatcher cannot launch is dropped rather than guessed,
// and any unreadable field in factory.json is a named error instead of a default. A dispatcher that
// silently defaults is a dispatcher that starts a dark build nobody asked for.
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

export type Harness = 'claude' | 'codex'
export type Stage = 'plan' | 'implement' | 'corrections'
export type StageName = 'intake' | 'plan' | 'implement' | 'review' | 'status' | 'chronicle'

export interface StagePolicy { harness: Harness; model: string; effort: string }
export interface RepoEntry { path: string; repo: string; org: string }
export interface Subagents { spawnDepth: number; concurrent: number }

export interface FactoryConfig {
  repos: RepoEntry[]
  interval: number
  maxRuns: number
  subagents: Subagents
  controlRoom: Record<string, string>
  home: string
  stateFile: string
  logRoot: string
  lockRoot: string
  dispatcherLock: string
}

export interface RepoPolicy {
  dispatch: 'off' | 'local'
  operators: string[]
  stages: Partial<Record<StageName, StagePolicy>>
}

const HARNESSES: readonly string[] = ['claude', 'codex']
const STAGE_NAMES: readonly StageName[] = ['intake', 'plan', 'implement', 'review', 'status', 'chronicle']
const DEFAULTS = { interval: 120, maxRuns: 1, spawnDepth: 1, concurrent: 3 }

function expandHome(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return isAbsolute(path) ? path : resolve(home, path)
}

function positiveInteger(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`factory.json: ${field} must be a positive whole number, got ${JSON.stringify(value)}`)
  }
  return value
}

export function parseFactoryConfig(raw: unknown, home: string): FactoryConfig {
  const document = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const repos = document.repos
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error('factory.json: repos must be a non-empty array of { path, repo, org } — the dispatcher watches nothing until one is listed')
  }
  const entries: RepoEntry[] = repos.map((entry, index) => {
    const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    for (const field of ['path', 'repo', 'org'] as const) {
      if (typeof row[field] !== 'string' || row[field] === '') throw new Error(`factory.json: repos[${index}].${field} is missing`)
    }
    return { path: expandHome(row.path as string, home), repo: row.repo as string, org: row.org as string }
  })

  const subagentsRaw = (document.subagents && typeof document.subagents === 'object' ? document.subagents : {}) as Record<string, unknown>
  // The control-room clone paths live in the same document, written by `vegafactory sync`; the
  // dispatcher reads them and never writes them.
  const controlRoom: Record<string, string> = {}
  const rooms = document.controlRooms
  if (rooms && typeof rooms === 'object' && !Array.isArray(rooms)) {
    for (const [org, entry] of Object.entries(rooms as Record<string, unknown>)) {
      const path = (entry as { path?: unknown } | null)?.path
      if (typeof path === 'string' && path !== '') controlRoom[org] = path
    }
  }

  const root = join(home, '.vegastack', 'factory')
  return {
    repos: entries,
    interval: positiveInteger(document.interval, 'interval', DEFAULTS.interval),
    maxRuns: positiveInteger(document.maxRuns, 'maxRuns', DEFAULTS.maxRuns),
    subagents: {
      spawnDepth: positiveInteger(subagentsRaw.spawnDepth, 'subagents.spawnDepth', DEFAULTS.spawnDepth),
      concurrent: positiveInteger(subagentsRaw.concurrent, 'subagents.concurrent', DEFAULTS.concurrent),
    },
    controlRoom,
    home,
    stateFile: join(root, 'state.json'),
    logRoot: join(root, 'logs'),
    lockRoot: join(root, 'locks'),
    dispatcherLock: join(root, 'dispatcher.lock'),
  }
}

export async function loadFactoryConfig(path: string, home: string): Promise<FactoryConfig> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw new Error(`factory.json: cannot read ${path} — write it before running the dispatcher`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`factory.json: ${path} is not valid JSON — fix it rather than deleting it, the control-room clone paths live there too`)
  }
  return parseFactoryConfig(parsed, home)
}

function stagePolicyFrom(tokens: string[]): StagePolicy | null {
  if (tokens.length !== 3) return null
  const [harness, model, effort] = tokens as [string, string, string]
  if (!HARNESSES.includes(harness)) return null
  return { harness: harness as Harness, model, effort }
}

// Two shapes are read because two shapes exist in the wild: the single `harness-policy:` line a
// dev.md carries (`<stage> <agent> <model> <effort>` separated by `·`) and the per-stage lines a
// group.md or an override block uses. A line that is not exactly a stage policy — `review:
// cross-agent-risky`, say — is left alone rather than half-parsed.
export function parseRepoPolicy(text: string): RepoPolicy {
  const body = typeof text === 'string' ? text : ''
  const dispatchMatch = /^dispatch:\s*([^\s#]+)/m.exec(body)
  const dispatch = dispatchMatch?.[1] === 'local' ? 'local' : 'off'

  const operatorsMatch = /^operators:\s*([^#\n]+)/m.exec(body)
  const operators = (operatorsMatch?.[1] ?? '')
    .split(/[,\s]+/)
    .map(entry => entry.trim())
    .filter(entry => entry !== '')

  const stages: Partial<Record<StageName, StagePolicy>> = {}
  const harnessPolicy = /^harness-policy:\s*([^#\n]+)/m.exec(body)
  if (harnessPolicy) {
    for (const segment of harnessPolicy[1]!.split('·')) {
      const tokens = segment.trim().split(/\s+/)
      const name = tokens.shift()
      if (!name || !STAGE_NAMES.includes(name as StageName)) continue
      const policy = stagePolicyFrom(tokens)
      if (policy) stages[name as StageName] = policy
    }
  }
  for (const name of STAGE_NAMES) {
    const line = new RegExp(`^${name}:\\s*([^#\\n]+)`, 'm').exec(body)
    if (!line) continue
    const policy = stagePolicyFrom(line[1]!.trim().split(/\s+/))
    if (policy) stages[name] = policy
  }
  return { dispatch, operators, stages }
}

// The group default is a floor, not a gate: `dispatch:` is read from the repo alone, because opting
// a repo into dark builds is that repo operator's word and no org default's.
export function mergeRepoPolicy(groupMd: string | null, devMd: string): RepoPolicy {
  const group = parseRepoPolicy(groupMd ?? '')
  const repo = parseRepoPolicy(devMd)
  return {
    dispatch: repo.dispatch,
    operators: repo.operators.length > 0 ? repo.operators : group.operators,
    stages: { ...group.stages, ...repo.stages },
  }
}

export function stagePolicy(policy: RepoPolicy, stage: Stage): StagePolicy {
  const name: StageName = stage === 'corrections' ? 'implement' : stage
  const found = policy.stages[name]
  if (!found) throw new Error(`no harness policy for the ${stage} stage — add a ${name} entry to harness-policy: in dev.md`)
  return found
}
