#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, cp, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { spawnSync } from 'node:child_process'

type Agent = 'codex' | 'claude'
type Mode = 'project' | 'global'
type Command = 'add' | 'verify' | 'doctor' | 'remove' | 'version' | 'help'
interface Options {
  command: Command
  skill: string
  agent?: Agent | 'both'
  mode?: Mode
  dir?: string
  dryRun: boolean
  force: boolean
  nonInteractive: boolean
}
interface Integrity { schemaVersion: number; skill: string; files: Record<string, string> }
interface Operation { agent: Agent; destination: string; stage: string; backup?: string; existed: boolean }
interface InstallJournal { schemaVersion: 1; status: 'prepared' | 'committed'; operations: Operation[] }

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillName = 'vegastack-arch-guardian'
const surfaces: Record<Agent, string> = { codex: '.agents/skills', claude: '.claude/skills' }
// Single version source: package.json ships in every npm install alongside dist/.
const packageVersion = (JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { version: string }).version

function usage() {
  return `Usage: vegastack-skills <add|verify|doctor|remove> [vegastack-arch-guardian] [options]\n\nOptions:\n  --agent codex|claude|both\n  --project | --global\n  --dir PATH\n  --dry-run\n  --force\n  --non-interactive\n  --version\n`
}

function parse(argv: string[]): Options {
  // A leading flag (e.g. `vegastack-skills --version`) is not a command.
  const command = (argv[0] && !argv[0].startsWith('-') ? argv.shift()! : 'help') as Command
  const options: Options = { command, skill: skillName, dryRun: false, force: false, nonInteractive: false }
  if (argv[0] && !argv[0].startsWith('-')) options.skill = argv.shift()!
  while (argv.length) {
    const flag = argv.shift()!
    if (flag === '--agent') options.agent = argv.shift() as Agent | 'both'
    else if (flag === '--project') options.mode = 'project'
    else if (flag === '--global') options.mode = 'global'
    else if (flag === '--dir') options.dir = argv.shift()
    else if (flag === '--dry-run') options.dryRun = true
    else if (flag === '--force') options.force = true
    else if (flag === '--non-interactive' || flag === '--yes') options.nonInteractive = true
    else if (flag === '--help' || flag === '-h') options.command = 'help'
    else if (flag === '--version' || flag === '-v') options.command = 'version'
    else throw new Error(`Unknown option: ${flag}`)
  }
  if (!['add', 'verify', 'doctor', 'remove', 'version', 'help'].includes(options.command)) throw new Error(`Unknown command: ${options.command}`)
  if (options.skill !== skillName) throw new Error(`Unknown skill: ${options.skill}`)
  if (options.agent && !['codex', 'claude', 'both'].includes(options.agent)) throw new Error(`Invalid --agent: ${options.agent}`)
  if (options.mode === 'global' && options.dir) throw new Error('--dir cannot be combined with --global')
  return options
}

async function prompt(options: Options): Promise<Required<Pick<Options, 'agent' | 'mode'>>> {
  if (options.agent && options.mode) return { agent: options.agent, mode: options.mode }
  if (options.nonInteractive || !process.stdin.isTTY) {
    return { agent: options.agent ?? 'both', mode: options.mode ?? 'project' }
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const agentAnswer = options.agent ?? await rl.question('Install for codex, claude, or both? [both] ')
  const modeAnswer = options.mode ?? await rl.question('Install project-local or user-global? [project] ')
  rl.close()
  const agent = (agentAnswer || 'both') as Agent | 'both'
  const mode = (modeAnswer === 'global' ? 'global' : 'project') as Mode
  if (!['codex', 'claude', 'both'].includes(agent)) throw new Error(`Invalid agent choice: ${agent}`)
  return { agent, mode }
}

async function exists(path: string) {
  try { await lstat(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function assertNoSymlink(path: string, allowMissingTail = true) {
  const absolute = resolve(path)
  const parsedRoot = resolve(absolute, sep)
  const parts = relative(parsedRoot, absolute).split(sep).filter(Boolean)
  let current = parsedRoot
  for (const part of parts) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error(`Refusing symlink path component: ${current}`)
    } catch (error) {
      if (allowMissingTail && (error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}

async function syncDirectory(path: string) {
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

async function durableJson(path: string, value: unknown) {
  await assertNoSymlink(dirname(path))
  await mkdir(dirname(path), { recursive: true })
  await assertNoSymlink(dirname(path), false)
  if (await exists(path)) await assertNoSymlink(path, false)
  const temporary = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx')
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync() } finally { await handle.close() }
  await rename(temporary, path)
  await syncDirectory(dirname(path))
}

async function recoverInstall(base: string) {
  const journalPath = join(base, '.vegastack', '.skills-install-transaction.json')
  if (!await exists(journalPath)) return
  await assertNoSymlink(journalPath, false)
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as InstallJournal
  if (journal.schemaVersion !== 1 || !['prepared', 'committed'].includes(journal.status) || !Array.isArray(journal.operations)) throw new Error(`Invalid installer recovery journal: ${journalPath}`)
  const seenAgents = new Set<Agent>()
  for (const operation of journal.operations) {
    if (!['codex', 'claude'].includes(operation.agent) || seenAgents.has(operation.agent)) throw new Error(`Untrusted installer recovery journal: invalid agent`)
    seenAgents.add(operation.agent)
    const expectedDestination = join(base, surfaces[operation.agent], skillName)
    if (resolve(operation.destination) !== expectedDestination || typeof operation.existed !== 'boolean') throw new Error(`Untrusted installer recovery journal: destination outside installer roots`)
    const expectedParent = dirname(expectedDestination)
    const validateTemporary = (path: string | undefined, kind: 'stage' | 'backup') => {
      if (!path) return kind === 'backup' && !operation.existed
      return dirname(resolve(path)) === expectedParent && basename(path).startsWith(`.${skillName}.${kind}-`)
    }
    if (!validateTemporary(operation.stage, 'stage') || !validateTemporary(operation.backup, 'backup')) throw new Error(`Untrusted installer recovery journal: invalid transaction path`)
  }
  for (const operation of [...journal.operations].reverse()) {
    for (const path of [operation.destination, operation.stage, operation.backup].filter(Boolean) as string[]) await assertNoSymlink(path)
    if (journal.status === 'prepared') {
      if (operation.backup && await exists(operation.backup)) {
        if (await exists(operation.destination)) await rm(operation.destination, { recursive: true, force: true })
        await rename(operation.backup, operation.destination)
      } else if (!operation.existed && await exists(operation.destination)) await rm(operation.destination, { recursive: true, force: true })
    } else if (operation.backup && await exists(operation.backup)) await rm(operation.backup, { recursive: true, force: true })
    if (await exists(operation.stage)) await rm(operation.stage, { recursive: true, force: true })
  }
  await rm(journalPath, { force: true })
  await syncDirectory(dirname(journalPath))
}

async function withInstallLock<T>(base: string, callback: () => Promise<T>): Promise<T> {
  const directory = join(base, '.vegastack')
  const lockPath = join(directory, '.skills-install.lock')
  await assertNoSymlink(directory)
  await mkdir(directory, { recursive: true })
  await assertNoSymlink(directory, false)
  let handle
  try {
    handle = await open(lockPath, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    await assertNoSymlink(lockPath, false)
    let active = true
    try {
      const owner = JSON.parse(await readFile(lockPath, 'utf8'))
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) active = false
      else try { process.kill(owner.pid, 0) } catch { active = false }
    } catch { active = false }
    if (active) throw new Error(`Another VegaStack skill installation is active: ${lockPath}`)
    await rm(lockPath, { force: true })
    return withInstallLock(base, callback)
  }
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, pid: process.pid, startedAt: new Date().toISOString() })}\n`)
    await handle.sync()
    return await callback()
  } finally {
    await handle.close()
    await rm(lockPath, { force: true })
    await syncDirectory(directory)
  }
}

async function listFiles(root: string) {
  const output: string[] = []
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in skill tree: ${path}`)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) output.push(path)
    }
  }
  await walk(root)
  return output.sort()
}

const hash = (body: Uint8Array) => createHash('sha256').update(body).digest('hex')

async function loadSource() {
  const source = join(packageRoot, 'skill', skillName)
  const integrityPath = join(packageRoot, 'skill-integrity.json')
  const manifest = JSON.parse(await readFile(integrityPath, 'utf8')) as Integrity
  if (manifest.schemaVersion !== 1 || manifest.skill !== skillName) throw new Error('Invalid bundled skill manifest')
  const skill = await readFile(join(source, 'SKILL.md'), 'utf8')
  if (!skill.startsWith('---\n') || !/^name: vegastack-arch-guardian$/m.test(skill) || !/^description: .+/m.test(skill)) {
    throw new Error('Bundled skill fails Agent Skills frontmatter validation')
  }
  const observed: Record<string, string> = {}
  for (const file of await listFiles(source)) observed[relative(source, file).split(sep).join('/')] = hash(await readFile(file))
  if (JSON.stringify(observed) !== JSON.stringify(manifest.files)) throw new Error('Bundled skill checksum mismatch')
  return { source, manifest }
}

function destinations(agent: Agent | 'both', mode: Mode, directory?: string) {
  const agents: Agent[] = agent === 'both' ? ['codex', 'claude'] : [agent]
  const base = mode === 'global' ? homedir() : resolve(directory ?? process.cwd())
  return agents.map(item => ({ agent: item, destination: join(base, surfaces[item], skillName) }))
}

async function compare(destination: string, manifest: Integrity) {
  if (!await exists(destination)) return { status: 'missing' as const, issues: ['not installed'] }
  await assertNoSymlink(destination, false)
  const issues: string[] = []
  const actualFiles = await listFiles(destination)
  const actualKeys = new Set(actualFiles.map(file => relative(destination, file).split(sep).join('/')).filter(key => key !== '.vegastack-install.json'))
  for (const [key, expected] of Object.entries(manifest.files)) {
    if (!actualKeys.has(key)) issues.push(`missing ${key}`)
    else if (hash(await readFile(join(destination, key))) !== expected) issues.push(`changed ${key}`)
  }
  for (const key of actualKeys) if (!(key in manifest.files)) issues.push(`unexpected ${key}`)
  return { status: issues.length ? 'drifted' as const : 'verified' as const, issues }
}

async function install(options: Options) {
  const choice = await prompt(options)
  const base = choice.mode === 'global' ? homedir() : resolve(options.dir ?? process.cwd())
  if (!options.dryRun) return withInstallLock(base, () => installLocked(options, choice, base))
  return installLocked(options, choice, base, false)
}

async function installLocked(options: Options, choice: Required<Pick<Options, 'agent' | 'mode'>>, base: string, recover = true) {
  if (recover) await recoverInstall(base)
  const { source, manifest } = await loadSource()
  const targets = destinations(choice.agent, choice.mode, options.dir)
  const operations: Operation[] = []
  for (const target of targets) {
    await assertNoSymlink(target.destination)
    const parent = dirname(target.destination)
    await assertNoSymlink(parent)
    const existed = await exists(target.destination)
    if (existed) {
      const comparison = await compare(target.destination, manifest)
      if (comparison.status === 'verified' && !options.force) {
        console.log(`unchanged ${target.agent}: ${target.destination}`)
        continue
      }
      if (!options.force) throw new Error(`Refusing differing installation without --force: ${target.destination}`)
    }
    const suffix = randomUUID()
    operations.push({ ...target, existed, stage: join(parent, `.${skillName}.stage-${suffix}`), backup: existed ? join(parent, `.${skillName}.backup-${suffix}`) : undefined })
  }
  if (options.dryRun) {
    for (const operation of operations) console.log(`would install ${operation.agent}: ${operation.destination}`)
    return
  }
  if (!operations.length) return
  const journalPath = join(base, '.vegastack', '.skills-install-transaction.json')
  const staged: Operation[] = []
  const applied: Operation[] = []
  try {
    for (const operation of operations) {
      await mkdir(dirname(operation.destination), { recursive: true })
      await assertNoSymlink(dirname(operation.destination), false)
      await cp(source, operation.stage, { recursive: true, dereference: false, errorOnExist: true })
      await writeFile(join(operation.stage, '.vegastack-install.json'), `${JSON.stringify({ installer: '@vegastack/skills', version: packageVersion, manifest }, null, 2)}\n`, { flag: 'wx' })
      const stagedCheck = await compare(operation.stage, manifest)
      if (stagedCheck.status !== 'verified') throw new Error(`Staged copy failed verification: ${stagedCheck.issues.join(', ')}`)
      staged.push(operation)
    }
    await durableJson(journalPath, { schemaVersion: 1, status: 'prepared', operations } satisfies InstallJournal)
    for (const operation of operations) {
      await assertNoSymlink(dirname(operation.destination), false)
      if (await exists(operation.destination)) await assertNoSymlink(operation.destination, false)
      if (operation.existed && operation.backup) await rename(operation.destination, operation.backup)
      try {
        await rename(operation.stage, operation.destination)
      } catch (error) {
        if (operation.existed && operation.backup && await exists(operation.backup)) await rename(operation.backup, operation.destination)
        throw error
      }
      applied.push(operation)
    }
    await durableJson(journalPath, { schemaVersion: 1, status: 'committed', operations } satisfies InstallJournal)
  } catch (error) {
    if (await exists(journalPath)) await recoverInstall(base)
    else for (const operation of [...applied].reverse()) {
      await rm(operation.destination, { recursive: true, force: true })
      if (operation.backup && await exists(operation.backup)) await rename(operation.backup, operation.destination)
    }
    for (const operation of staged) await rm(operation.stage, { recursive: true, force: true })
    throw error
  }
  for (const operation of applied) if (operation.backup) {
    try { await rm(operation.backup, { recursive: true, force: true }) }
    catch (error) { console.warn(`warning: installed successfully but could not remove backup ${operation.backup}: ${(error as Error).message}`) }
  }
  await rm(journalPath, { force: true })
  await syncDirectory(dirname(journalPath))
  for (const operation of applied) console.log(`installed ${operation.agent}: ${operation.destination}`)
}

async function verify(options: Options) {
  const choice = await prompt(options)
  const { manifest } = await loadSource()
  let failed = false
  for (const target of destinations(choice.agent, choice.mode, options.dir)) {
    const result = await compare(target.destination, manifest)
    console.log(`${result.status} ${target.agent}: ${target.destination}${result.issues.length ? ` (${result.issues.join(', ')})` : ''}`)
    if (result.status !== 'verified') failed = true
  }
  if (failed) process.exitCode = 1
}

async function latestPublishedVersion(): Promise<string | null> {
  try {
    const response = await fetch('https://registry.npmjs.org/@vegastack%2fskills/latest', { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return null
    const version = ((await response.json()) as { version?: unknown }).version
    return typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version) ? version : null
  } catch {
    return null
  }
}

async function removeSkill(options: Options) {
  const choice = await prompt(options)
  let removed = 0
  for (const target of destinations(choice.agent, choice.mode, options.dir)) {
    if (!await exists(target.destination)) { console.log(`not installed ${target.agent}: ${target.destination}`); continue }
    await assertNoSymlink(target.destination, false)
    if (!options.force) {
      const { manifest } = await loadSource()
      const comparison = await compare(target.destination, manifest)
      if (comparison.status === 'drifted') throw new Error(`Installation differs from the bundled skill (possibly locally modified); re-run with --force to remove anyway: ${target.destination}`)
    }
    if (options.dryRun) { console.log(`would remove ${target.agent}: ${target.destination}`); continue }
    await rm(target.destination, { recursive: true, force: true })
    removed += 1
    console.log(`removed ${target.agent}: ${target.destination}`)
  }
  if (!removed && !options.dryRun) process.exitCode = 1
}

async function doctor(options: Options) {
  const base = options.mode === 'global' ? homedir() : resolve(options.dir ?? process.cwd())
  await access(base, fsConstants.R_OK | fsConstants.W_OK)
  await assertNoSymlink(base, false)
  let failed = false
  // Canonical profile name first; legacy .yaml-named JSON still accepted with a notice.
  const profileCandidates = [join(base, '.vegastack', 'architecture.json'), join(base, '.vegastack', 'architecture.yaml')]
  if (options.mode !== 'global') {
    let profile: string | null = null
    for (const candidate of profileCandidates) if (await exists(candidate)) { profile = candidate; break }
    if (profile) {
      if (profile.endsWith('.yaml')) console.log(`notice: ${profile} uses the legacy .yaml name for a JSON document; rename to architecture.json`)
      try {
        const parsed = JSON.parse(await readFile(profile, 'utf8'))
        if (parsed.schemaVersion !== 3 || parsed.profileStatus !== 'confirmed' || !parsed.project?.name || !parsed.environments?.production) throw new Error('required identity fields are absent or profile is not confirmed schema v3')
        console.log(`ok architecture profile: ${profile}`)
      } catch (error) {
        console.log(`invalid architecture profile: ${profile} (${(error as Error).message})`)
        failed = true
      }
    } else {
      console.log(`missing architecture profile: ${profileCandidates[0]}`)
      failed = true
    }
  }
  console.log(`ok runtime: Node ${process.versions.node}`)
  // The only network call the CLI ever makes: one npm version check so stale installs are visible.
  const latest = await latestPublishedVersion()
  if (latest && latest !== packageVersion) console.log(`update available: installed ${packageVersion}, latest ${latest} — run: npx @vegastack/skills@latest add ${skillName} --force`)
  else if (latest) console.log(`ok installer version: ${packageVersion} (latest)`)
  else console.log(`skipped installer version check (npmjs.org unreachable); installed ${packageVersion}`)
  const { manifest } = await loadSource()
  let installations = 0
  let checkScript = ''
  for (const agent of ['codex', 'claude'] as Agent[]) {
    const destination = join(base, surfaces[agent], skillName)
    if (!await exists(destination)) { console.log(`missing ${agent} guardian installation`); continue }
    installations += 1
    const result = await compare(destination, manifest)
    console.log(`${result.status === 'verified' ? 'ok' : 'invalid'} ${agent} guardian installation${result.issues.length ? ` (${result.issues.join(', ')})` : ''}`)
    if (result.status !== 'verified') failed = true
    if (!checkScript) checkScript = join(destination, 'scripts', 'architecture-check.mjs')
  }
  if (!installations) failed = true
  if (options.mode !== 'global' && checkScript && !failed) {
    const result = spawnSync(process.execPath, [checkScript, base, '--json'], { encoding: 'utf8' })
    if (result.status === 0) console.log('ok architecture invariants')
    else { console.log(`invalid architecture invariants: ${result.stdout.trim() || result.stderr.trim()}`); failed = true }
  }
  if (failed) process.exitCode = 1
}

async function main() {
  const options = parse(process.argv.slice(2))
  if (options.command === 'help') return console.log(usage())
  if (options.command === 'version') return console.log(packageVersion)
  if (options.command === 'add') return install(options)
  if (options.command === 'verify') return verify(options)
  if (options.command === 'remove') return removeSkill(options)
  return doctor(options)
}

main().catch(error => {
  console.error(`error: ${(error as Error).message}`)
  process.exitCode = 1
})
