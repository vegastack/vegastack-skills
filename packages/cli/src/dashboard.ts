// `vegafactory dashboard` — fetch the dashboard package on first use, then launch its Next.js
// standalone server under Bun on the loopback interface.
//
// The dashboard is a second published package rather than part of this one: its traced server
// tree is tens of megabytes, and every `vegafactory skills add` would pay for it. Fetching it at
// the CLI's own version keeps the two in step without a resolution step that can drift.

import { execFile, spawn } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DASHBOARD_PACKAGE = '@vegastack/vegafactory-dashboard'
export const SERVER_ENTRY = 'dist-standalone/packages/dashboard/server.js'
const DEFAULT_PORT = 7777
const PORT_SPAN = 10
const HEALTH_TIMEOUT_MS = 20_000

export function dashboardSpec(version: string): string {
  return `${DASHBOARD_PACKAGE}@${version}`
}

export interface DashboardPaths {
  root: string
  entry: string
  source: 'override' | 'cache'
}

// One install root per CLI version, so a downgrade finds its own tree rather than a newer one,
// and an upgrade never has to invalidate anything. `--dir` points straight at a built package —
// the repo's own `packages/dashboard` while developing.
export function dashboardPaths(input: { home: string; version: string; override: string | null }): DashboardPaths {
  if (input.override) return { root: input.override, entry: join(input.override, SERVER_ENTRY), source: 'override' }
  const root = join(input.home, '.vegastack', 'dashboard', input.version)
  return { root, entry: join(root, 'node_modules', DASHBOARD_PACKAGE, SERVER_ENTRY), source: 'cache' }
}

export function installArgs(input: { root: string; version: string }): string[] {
  return ['install', '--prefix', input.root, dashboardSpec(input.version), '--no-audit', '--no-fund', '--omit=dev']
}

export interface DashboardPlan {
  action: 'launch' | 'fetch-then-launch' | 'plan' | 'refuse'
  reason: string
}

// An override is never fetched over: `--dir` names a tree the operator is working in, and
// installing a published tarball on top of it would silently replace what they are testing.
export function planDashboard(input: { entryExists: boolean; source: 'override' | 'cache'; dryRun: boolean }): DashboardPlan {
  if (!input.entryExists && input.source === 'override') {
    return {
      action: 'refuse',
      reason: 'the --dir tree has no dist-standalone/packages/dashboard/server.js; run bun run build && bun run assemble in it first',
    }
  }
  if (input.dryRun) {
    return {
      action: 'plan',
      reason: input.entryExists ? 'the server entry is present; a real run would launch it' : `a real run would fetch ${DASHBOARD_PACKAGE} and launch it`,
    }
  }
  if (input.entryExists) return { action: 'launch', reason: 'the server entry is present' }
  return { action: 'fetch-then-launch', reason: `${DASHBOARD_PACKAGE} is not installed for this version yet` }
}

export function portCandidates(start: number, span: number): number[] {
  return Array.from({ length: span }, (_, index) => start + index)
}

export function healthUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/health`
}

export interface ServerLaunchInput {
  controlRoom: string
  cacheFile: string
  org: string
  repos: string[]
  stateFile: string
  viewer: string | null
  token: string | null
  bin: string
  port: number
}

// The whole contract the server reads, and nothing else. A null value is omitted rather than set
// empty, so the server's own "is this variable present" test stays true to what the CLI knew.
// HOSTNAME pins the listener to the loopback interface: the token in this environment must not
// be reachable from the network.
export function launchEnv({ env }: { env: ServerLaunchInput }): Record<string, string> {
  const out: Record<string, string> = {
    HOSTNAME: '127.0.0.1',
    PORT: String(env.port),
    VEGAFACTORY_CONTROL_ROOM: env.controlRoom,
    VEGAFACTORY_CACHE: env.cacheFile,
    VEGAFACTORY_ORG: env.org,
    VEGAFACTORY_STATE: env.stateFile,
    VEGAFACTORY_BIN: env.bin,
  }
  if (env.repos.length > 0) out.VEGAFACTORY_REPOS = env.repos.join(',')
  if (env.viewer) out.VEGAFACTORY_VIEWER = env.viewer
  if (env.token) out.VEGAFACTORY_GH_TOKEN = env.token
  return out
}

const run = (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    execFile(command, args, { ...options, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (error as { code?: unknown }).code : 0
      resolve({ code: typeof code === 'number' ? code : error ? 1 : 0, stdout, stderr })
    })
  })

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

// A symlink anywhere on the install path is refused rather than followed: the install root is a
// directory this tool owns and writes into, and following a link there would let anything on the
// machine redirect an `npm install --prefix` into a tree the operator did not choose.
async function symlinked(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink()
  } catch {
    return false
  }
}

async function health(port: number, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl(port), { cache: 'no-store' })
      if (response.ok) return true
    } catch {
      // the server has not bound its port yet; the loop is the wait
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

export interface DashboardOptions {
  rest: string[]
  home?: string
  version: string
}

interface Flags {
  port: number
  open: boolean
  dir: string | null
  dryRun: boolean
  json: boolean
  help: boolean
}

export function parseDashboardFlags(rest: string[]): Flags {
  const flags: Flags = { port: DEFAULT_PORT, open: false, dir: null, dryRun: false, json: false, help: false }
  const argv = [...rest]
  while (argv.length) {
    const flag = argv.shift()!
    if (flag === '--port') {
      const value = argv.shift()
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port requires a port number between 1 and 65535')
      flags.port = port
    }
    else if (flag === '--open') flags.open = true
    else if (flag === '--dir') {
      const value = argv.shift()
      if (value === undefined || value === '' || value.startsWith('-')) throw new Error('--dir requires a value')
      flags.dir = value
    }
    else if (flag === '--dry-run') flags.dryRun = true
    else if (flag === '--json') flags.json = true
    else if (flag === 'help' || flag === '--help' || flag === '-h') flags.help = true
    else throw new Error(`Unknown option: ${flag}`)
  }
  return flags
}

export function dashboardUsage(): string {
  return `Usage: vegafactory dashboard [--port N] [--open] [--dir PATH] [--dry-run] [--json]

Starts the local read-only dashboard over the control room's statistics and the live board.
The package is fetched on first use into ~/.vegastack/dashboard/<version>/ and the server
binds 127.0.0.1 only. The derived cache lives at ~/.vegastack/cache/stats.db and deleting
it is always safe.

  --port N     first port to try (default ${DEFAULT_PORT}; the next ${PORT_SPAN - 1} are tried in turn)
  --open       open the URL in the browser once the server answers
  --dir PATH   launch an already-built package tree instead of the fetched one
  --dry-run    print what a real run would do, and change nothing
  --json       machine-readable result

Exit 0 the server answers, or the dry-run plan printed · 1 the server exited or never
answered · 2 a usage error or a refusal.`
}

// Collects the environment from this machine: the control room this org recorded, the viewer and
// token from `gh`, and the path to this very binary for the status bridge. Everything optional
// degrades to null — a dashboard with no `gh` still renders every cached view.
async function collect(home: string): Promise<{
  controlRoom: string
  org: string
  stateFile: string
  repos: string[]
  viewer: string | null
  token: string | null
} | { error: string }> {
  const { factoryConfigPath, readFactoryConfig } = await import('./control-room.ts')
  const stateFile = factoryConfigPath(home)
  let config
  try {
    const text = await readFile(stateFile, 'utf8').catch(() => null)
    config = readFactoryConfig(text)
  } catch (error) {
    return { error: (error as Error).message }
  }
  const entries = Object.entries(config.controlRooms)
  const first = entries[0]
  if (!first) return { error: `no control room is recorded in ${stateFile} — run \`vegafactory sync\` first` }

  const settingsRepos = Array.isArray((config.settings as Record<string, unknown>).repos)
    ? ((config.settings as Record<string, unknown>).repos as unknown[]).filter((repo): repo is string => typeof repo === 'string')
    : []

  const { ghText } = await import('./gh.ts')
  const quiet = async (args: string[]): Promise<string | null> => {
    try {
      return (await ghText(args)).trim() || null
    } catch {
      return null
    }
  }

  return {
    controlRoom: first[1].path,
    org: first[0],
    stateFile,
    repos: settingsRepos,
    viewer: await quiet(['api', 'user', '-q', '.login']),
    token: await quiet(['auth', 'token']),
  }
}

export async function runDashboard(options: DashboardOptions): Promise<number> {
  let flags: Flags
  try {
    flags = parseDashboardFlags(options.rest)
  } catch (error) {
    console.error(`error: ${(error as Error).message}`)
    return 2
  }
  if (flags.help) {
    console.log(dashboardUsage())
    return 0
  }

  const home = options.home ?? homedir()
  const paths = dashboardPaths({ home, version: options.version, override: flags.dir })
  if (await symlinked(paths.root)) {
    console.error(`error: ${paths.root} is a symlink; the dashboard refuses to install or launch through one`)
    return 2
  }

  const plan = planDashboard({ entryExists: await exists(paths.entry), source: paths.source, dryRun: flags.dryRun })
  if (plan.action === 'refuse') {
    console.error(`error: ${plan.reason}`)
    return 2
  }

  const environment = await collect(home)
  if ('error' in environment) {
    console.error(`error: ${environment.error}`)
    return 2
  }

  const cacheFile = join(home, '.vegastack', 'cache', 'stats.db')
  if (plan.action === 'plan') {
    const document = {
      command: 'dashboard', ok: true, url: healthUrl(flags.port).replace('/api/health', ''),
      dir: paths.root, entry: paths.entry, fetched: false, pid: null, plan: plan.reason,
    }
    console.log(flags.json ? JSON.stringify(document, null, 2) : `${plan.reason}\n  install root: ${paths.root}\n  entry: ${paths.entry}\n  cache: ${cacheFile}`)
    return 0
  }

  let fetched = false
  if (plan.action === 'fetch-then-launch') {
    if (!flags.json) console.log(`fetching ${dashboardSpec(options.version)} into ${paths.root} …`)
    const result = await run('npm', installArgs({ root: paths.root, version: options.version }))
    if (result.code !== 0) {
      console.error(`error: could not fetch ${dashboardSpec(options.version)} — ${result.stderr.trim() || 'npm exited non-zero'}`)
      return 1
    }
    fetched = true
    if (!(await exists(paths.entry))) {
      console.error(`error: ${dashboardSpec(options.version)} installed but has no ${SERVER_ENTRY}`)
      return 1
    }
  }

  const env = launchEnv({
    env: {
      controlRoom: environment.controlRoom,
      cacheFile,
      org: environment.org,
      repos: environment.repos,
      stateFile: environment.stateFile,
      viewer: environment.viewer,
      token: environment.token,
      bin: process.argv[1] ?? 'vegafactory',
      port: flags.port,
    },
  })

  const child = spawn('bun', [paths.entry], {
    env: { ...process.env, ...env, VEGAFACTORY_VERSION: options.version },
    stdio: flags.json ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  })

  const answered = await health(flags.port, Date.now() + HEALTH_TIMEOUT_MS)
  if (!answered) {
    child.kill()
    console.error(`error: the dashboard server did not answer ${healthUrl(flags.port)} within ${HEALTH_TIMEOUT_MS / 1000}s`)
    return 1
  }

  const url = `http://127.0.0.1:${flags.port}`
  if (flags.json) {
    console.log(JSON.stringify({ command: 'dashboard', ok: true, url, dir: paths.root, entry: paths.entry, fetched, pid: child.pid ?? null }, null, 2))
  } else {
    console.log(`dashboard: ${url}  (ctrl-c to stop)`)
  }
  if (flags.open) await run(process.platform === 'darwin' ? 'open' : 'xdg-open', [url])

  return new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code === 0 || code === null ? 0 : 1))
  })
}
