#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, cp, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'

type Agent = 'codex' | 'claude' | 'hermes'
type AgentChoice = Agent | 'both' | 'all'
type Mode = 'project' | 'global'
type Command = 'add' | 'verify' | 'doctor' | 'remove' | 'list' | 'version' | 'help'
interface Options {
  command: Command
  skill?: string
  agent?: AgentChoice
  mode?: Mode
  dir?: string
  dryRun: boolean
  force: boolean
  nonInteractive: boolean
}
interface SkillIntegrity { files: Record<string, string> }
interface Integrity { schemaVersion: number; skills: Record<string, SkillIntegrity> }
interface Operation { skill: string; agent: Agent; destination: string; stage: string; backup?: string; existed: boolean }
interface InstallJournal { schemaVersion: 2; status: 'prepared' | 'committed'; operations: Operation[] }

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(packageRoot, 'skill')
// Hermes has no project-level skill discovery (single global dir); see docs.
const surfaces: Record<Agent, string> = { codex: '.agents/skills', claude: '.claude/skills', hermes: '.hermes/skills' }
const projectAgents: Agent[] = ['codex', 'claude']
// Single version source: package.json ships in every npm install alongside dist/.
const packageVersion = (JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { version: string }).version

function usage() {
  return `Usage: vegastack-skills <add|verify|remove> <skill> [options]
       vegastack-skills <list|doctor> [options]

Options:
  --agent codex|claude|hermes|both|all   (both = codex+claude; hermes is global-only)
  --project | --global
  --dir PATH
  --dry-run
  --force
  --non-interactive
  --version

Run "vegastack-skills list" to see the bundled skills.
`
}

async function bundledSkills(): Promise<string[]> {
  const entries = await readdir(bundleRoot, { withFileTypes: true })
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
}

function parse(argv: string[]): Options {
  // A leading flag (e.g. `vegastack-skills --version`) is not a command.
  const command = (argv[0] && !argv[0].startsWith('-') ? argv.shift()! : 'help') as Command
  const options: Options = { command, dryRun: false, force: false, nonInteractive: false }
  if (argv[0] && !argv[0].startsWith('-')) options.skill = argv.shift()!
  while (argv.length) {
    const flag = argv.shift()!
    if (flag === '--agent') options.agent = argv.shift() as AgentChoice
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
  if (!['add', 'verify', 'doctor', 'remove', 'list', 'version', 'help'].includes(options.command)) throw new Error(`Unknown command: ${options.command}`)
  if (options.agent && !['codex', 'claude', 'hermes', 'both', 'all'].includes(options.agent)) throw new Error(`Invalid --agent: ${options.agent}`)
  if (options.mode === 'global' && options.dir) throw new Error('--dir cannot be combined with --global')
  return options
}

async function requireSkill(options: Options): Promise<string> {
  const skills = await bundledSkills()
  if (!options.skill) throw new Error(`Specify a skill: ${skills.join(', ')}`)
  if (!skills.includes(options.skill)) throw new Error(`Unknown skill: ${options.skill}. Bundled skills: ${skills.join(', ')}`)
  return options.skill
}

// skills.sh-style flow: detect which agents the user actually has and install to them without
// asking. Only when nothing is detectable does an interactive numbered picker appear; --agent
// always overrides, and --non-interactive keeps the old defaults.
const agentLabels: Record<Agent, string> = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' }

async function detectAgents(): Promise<Agent[]> {
  const detected: Agent[] = []
  // Order matches install output; detection = the agent's home config dir exists.
  if (await exists(join(homedir(), '.claude'))) detected.push('claude')
  if (await exists(join(homedir(), '.codex')) || await exists(join(homedir(), '.agents'))) detected.push('codex')
  if (await exists(join(homedir(), '.hermes'))) detected.push('hermes')
  return detected
}

async function prompt(options: Options): Promise<{ agent: AgentChoice; mode: Mode }> {
  const mode: Mode = options.mode ?? 'project'
  if (options.agent) return { agent: options.agent, mode }
  if (options.nonInteractive || !process.stdin.isTTY) return { agent: 'both', mode }

  const detected = (await detectAgents()).filter(agent => mode === 'global' || agent !== 'hermes')
  if (detected.length) {
    console.log(`Detected: ${detected.map(agent => agentLabels[agent]).join(', ')} (override with --agent)`)
    if (detected.length === 1) return { agent: detected[0]!, mode }
    return { agent: detected.includes('hermes') ? 'all' : 'both', mode }
  }

  // Nothing detected: one numbered question with a sensible default.
  console.log('Where should this skill be installed?')
  console.log('  1) Claude Code  (.claude/skills)')
  console.log('  2) Codex        (.agents/skills)')
  console.log('  3) Both  (recommended)')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('Select 1-3 [3]: ')).trim()
  rl.close()
  const agent = ({ '1': 'claude', '2': 'codex', '3': 'both', '': 'both' } as Record<string, AgentChoice>)[answer]
  if (!agent) throw new Error(`Invalid selection: ${answer} (expected 1, 2, or 3)`)
  return { agent, mode }
}

// Expand an agent choice to concrete agents, enforcing Hermes's global-only discovery.
function resolveAgents(choice: AgentChoice, mode: Mode): Agent[] {
  const wanted: Agent[] = choice === 'both' ? ['codex', 'claude'] : choice === 'all' ? ['codex', 'claude', 'hermes'] : [choice]
  if (mode === 'project' && wanted.includes('hermes')) {
    if (choice === 'hermes') throw new Error('Hermes discovers skills only in the global ~/.hermes/skills directory; use --global (without --dir) with --agent hermes, or --agent all')
    console.log('note: skipping hermes for a project install — Hermes discovers skills globally only; run with --global --agent hermes')
    return wanted.filter(agent => agent !== 'hermes')
  }
  return wanted
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
  if (journal.schemaVersion !== 2 || !['prepared', 'committed'].includes(journal.status) || !Array.isArray(journal.operations)) {
    throw new Error(`Unsupported installer recovery journal (schemaVersion ${(journal as { schemaVersion?: unknown }).schemaVersion ?? 'unknown'}); inspect and remove it manually: ${journalPath}`)
  }
  const skills = new Set(await bundledSkills())
  const seen = new Set<string>()
  for (const operation of journal.operations) {
    if (!['codex', 'claude', 'hermes'].includes(operation.agent) || typeof operation.skill !== 'string' || !skills.has(operation.skill)) throw new Error(`Untrusted installer recovery journal: invalid agent or skill; inspect and remove it manually: ${journalPath}`)
    const key = `${operation.agent}/${operation.skill}`
    if (seen.has(key)) throw new Error('Untrusted installer recovery journal: duplicate operation')
    seen.add(key)
    const expectedDestination = join(base, surfaces[operation.agent], operation.skill)
    if (resolve(operation.destination) !== expectedDestination || typeof operation.existed !== 'boolean') throw new Error('Untrusted installer recovery journal: destination outside installer roots')
    const expectedParent = dirname(expectedDestination)
    const validateTemporary = (path: string | undefined, kind: 'stage' | 'backup') => {
      if (!path) return kind === 'backup' && !operation.existed
      return dirname(resolve(path)) === expectedParent && basename(path).startsWith(`.${operation.skill}.${kind}-`)
    }
    if (!validateTemporary(operation.stage, 'stage') || !validateTemporary(operation.backup, 'backup')) throw new Error('Untrusted installer recovery journal: invalid transaction path')
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

async function loadManifest(): Promise<Integrity> {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'skill-integrity.json'), 'utf8')) as Integrity
  if (manifest.schemaVersion !== 2 || typeof manifest.skills !== 'object') throw new Error('Invalid bundled skill manifest')
  return manifest
}

async function loadSource(skillName: string) {
  const manifest = await loadManifest()
  const skillManifest = manifest.skills[skillName]
  if (!skillManifest) throw new Error(`Bundled manifest has no entry for skill ${skillName}`)
  const source = join(bundleRoot, skillName)
  const skill = await readFile(join(source, 'SKILL.md'), 'utf8')
  if (!skill.startsWith('---\n') || !new RegExp(`^name: ${skillName}$`, 'm').test(skill) || !/^description: .+/m.test(skill)) {
    throw new Error(`Bundled skill ${skillName} fails Agent Skills frontmatter validation`)
  }
  const observed: Record<string, string> = {}
  for (const file of await listFiles(source)) observed[relative(source, file).split(sep).join('/')] = hash(await readFile(file))
  if (JSON.stringify(observed) !== JSON.stringify(skillManifest.files)) throw new Error(`Bundled skill ${skillName} checksum mismatch`)
  return { source, files: skillManifest.files }
}

function baseFor(mode: Mode, directory?: string) {
  return mode === 'global' ? homedir() : resolve(directory ?? process.cwd())
}

async function compare(destination: string, files: Record<string, string>) {
  if (!await exists(destination)) return { status: 'missing' as const, issues: ['not installed'] }
  await assertNoSymlink(destination, false)
  const issues: string[] = []
  const actualFiles = await listFiles(destination)
  const actualKeys = new Set(actualFiles.map(file => relative(destination, file).split(sep).join('/')).filter(key => key !== '.vegastack-install.json'))
  for (const [key, expected] of Object.entries(files)) {
    if (!actualKeys.has(key)) issues.push(`missing ${key}`)
    else if (hash(await readFile(join(destination, key))) !== expected) issues.push(`changed ${key}`)
  }
  for (const key of actualKeys) if (!(key in files)) issues.push(`unexpected ${key}`)
  return { status: issues.length ? 'drifted' as const : 'verified' as const, issues }
}

async function install(options: Options) {
  const skillName = await requireSkill(options)
  const choice = await prompt(options)
  const base = baseFor(choice.mode, options.dir)
  const agents = resolveAgents(choice.agent, choice.mode)
  if (!agents.length) return
  if (!options.dryRun) return withInstallLock(base, () => installLocked(options, skillName, agents, base))
  return installLocked(options, skillName, agents, base, false)
}

async function installLocked(options: Options, skillName: string, agents: Agent[], base: string, recover = true) {
  if (recover) await recoverInstall(base)
  const { source, files } = await loadSource(skillName)
  const operations: Operation[] = []
  for (const agent of agents) {
    const destination = join(base, surfaces[agent], skillName)
    await assertNoSymlink(destination)
    const parent = dirname(destination)
    await assertNoSymlink(parent)
    const existed = await exists(destination)
    if (existed) {
      const comparison = await compare(destination, files)
      if (comparison.status === 'verified' && !options.force) {
        console.log(`unchanged ${agent}: ${destination}`)
        continue
      }
      if (!options.force) {
        if (options.dryRun) { console.log(`would replace ${agent} (requires --force; installed copy differs): ${destination}`); continue }
        throw new Error(`Refusing differing installation without --force: ${destination}`)
      }
    }
    const suffix = randomUUID()
    operations.push({ skill: skillName, agent, destination, existed, stage: join(parent, `.${skillName}.stage-${suffix}`), backup: existed ? join(parent, `.${skillName}.backup-${suffix}`) : undefined })
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
      await writeFile(join(operation.stage, '.vegastack-install.json'), `${JSON.stringify({ installer: '@vegastack/skills', version: packageVersion, skill: skillName, files }, null, 2)}\n`, { flag: 'wx' })
      const stagedCheck = await compare(operation.stage, files)
      if (stagedCheck.status !== 'verified') throw new Error(`Staged copy failed verification: ${stagedCheck.issues.join(', ')}`)
      staged.push(operation)
    }
    await durableJson(journalPath, { schemaVersion: 2, status: 'prepared', operations } satisfies InstallJournal)
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
    await durableJson(journalPath, { schemaVersion: 2, status: 'committed', operations } satisfies InstallJournal)
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
  const base = baseFor(choice.mode, options.dir)
  const agents = resolveAgents(choice.agent, choice.mode)
  const explicit = Boolean(options.skill)
  const skills = explicit ? [await requireSkill(options)] : await bundledSkills()
  let failed = false
  let found = 0
  for (const skillName of skills) {
    const { files } = await loadSource(skillName)
    for (const agent of agents) {
      const destination = join(base, surfaces[agent], skillName)
      const result = await compare(destination, files)
      if (result.status === 'missing' && !explicit) { console.log(`not installed ${agent} ${skillName}`); continue }
      found += 1
      console.log(`${result.status} ${agent} ${skillName}: ${destination}${result.issues.length ? ` (${result.issues.join(', ')})` : ''}`)
      if (result.status !== 'verified') failed = true
    }
  }
  if (!explicit && found === 0) { console.log('no bundled skills are installed on the selected surfaces'); failed = true }
  if (failed) process.exitCode = 1
}

function semverLess(a: string, b: string): boolean {
  const parse = (value: string) => value.split('-')[0]!.split('.').map(part => Number.parseInt(part, 10) || 0)
  const [aMajor = 0, aMinor = 0, aPatch = 0] = parse(a)
  const [bMajor = 0, bMinor = 0, bPatch = 0] = parse(b)
  if (aMajor !== bMajor) return aMajor < bMajor
  if (aMinor !== bMinor) return aMinor < bMinor
  return aPatch < bPatch
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
  const skillName = await requireSkill(options)
  const choice = await prompt(options)
  const base = baseFor(choice.mode, options.dir)
  const agents = resolveAgents(choice.agent, choice.mode)
  if (!options.dryRun) return withInstallLock(base, () => removeLocked(options, skillName, agents, base))
  return removeLocked(options, skillName, agents, base)
}

async function removeLocked(options: Options, skillName: string, agents: Agent[], base: string) {
  let removed = 0
  for (const agent of agents) {
    const destination = join(base, surfaces[agent], skillName)
    if (!await exists(destination)) { console.log(`not installed ${agent}: ${destination}`); continue }
    await assertNoSymlink(destination, false)
    if (!options.force) {
      const { files } = await loadSource(skillName)
      const comparison = await compare(destination, files)
      if (comparison.status === 'drifted') throw new Error(`Installation differs from the bundled skill (possibly locally modified); re-run with --force to remove anyway: ${destination}`)
    }
    if (options.dryRun) { console.log(`would remove ${agent}: ${destination}`); continue }
    await rm(destination, { recursive: true, force: true })
    removed += 1
    console.log(`removed ${agent}: ${destination}`)
  }
  if (!removed && !options.dryRun) process.exitCode = 1
}

async function list() {
  const manifest = await loadManifest()
  for (const skillName of await bundledSkills()) {
    const skill = await readFile(join(bundleRoot, skillName, 'SKILL.md'), 'utf8')
    const description = skill.match(/^description: (.+)$/m)?.[1] ?? ''
    const fileCount = Object.keys(manifest.skills[skillName]?.files ?? {}).length
    console.log(`${skillName} (${fileCount} files)`)
    console.log(`  ${description.length > 160 ? `${description.slice(0, 157)}...` : description}`)
  }
}

async function doctor(options: Options) {
  const base = baseFor(options.mode ?? 'project', options.dir)
  await access(base, fsConstants.R_OK | fsConstants.W_OK)
  await assertNoSymlink(base, false)
  let failed = false
  // The architect skill's per-project profile is plain markdown; the repo, not this file,
  // is the source of truth, so doctor only checks presence and basic shape.
  const profilePath = join(base, '.vegastack', 'arch.md')
  if (options.mode !== 'global') {
    if (await exists(profilePath)) {
      const content = await readFile(profilePath, 'utf8')
      if (content.includes('hosting:')) console.log(`ok architecture profile: ${profilePath}`)
      else {
        console.log(`invalid architecture profile: ${profilePath} (no "hosting:" line; regenerate from the architect skill's template)`)
        failed = true
      }
    } else {
      console.log(`missing architecture profile: ${profilePath} (only needed once the architect skill is used in this project)`)
    }
  }
  console.log(`ok runtime: Node ${process.versions.node}`)
  // The only network call the CLI ever makes: one npm version check so stale installs are visible.
  const latest = await latestPublishedVersion()
  if (latest && semverLess(packageVersion, latest)) console.log(`update available: installed ${packageVersion}, latest ${latest} — run: npx @vegastack/skills@latest add <skill> --force`)
  else if (latest && semverLess(latest, packageVersion)) console.log(`ok installer version: ${packageVersion} (ahead of registry latest ${latest})`)
  else if (latest) console.log(`ok installer version: ${packageVersion} (latest)`)
  else console.log(`skipped installer version check (npmjs.org unreachable); installed ${packageVersion}`)

  let installations = 0
  for (const skillName of await bundledSkills()) {
    const { files } = await loadSource(skillName)
    for (const agent of ['codex', 'claude', 'hermes'] as Agent[]) {
      const destination = join(agent === 'hermes' ? homedir() : base, surfaces[agent], skillName)
      if (!await exists(destination)) continue
      installations += 1
      const result = await compare(destination, files)
      console.log(`${result.status === 'verified' ? 'ok' : 'invalid'} ${agent} ${skillName} installation${result.issues.length ? ` (${result.issues.join(', ')})` : ''}`)
      if (result.status !== 'verified') failed = true
    }
  }
  if (!installations) { console.log('no bundled skills installed on any surface'); failed = true }
  if (failed) process.exitCode = 1
}

async function main() {
  const options = parse(process.argv.slice(2))
  if (options.command === 'help') return console.log(usage())
  if (options.command === 'version') return console.log(packageVersion)
  if (options.command === 'list') return list()
  if (options.command === 'add') return install(options)
  if (options.command === 'verify') return verify(options)
  if (options.command === 'remove') return removeSkill(options)
  return doctor(options)
}

main().catch(error => {
  console.error(`error: ${(error as Error).message}`)
  process.exitCode = 1
})
