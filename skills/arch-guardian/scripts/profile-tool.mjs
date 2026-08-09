#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir, rename } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pathExists, readJsonYaml } from './lib.mjs'

const capabilityNames = ['web', 'flutter', 'agents', 'jobs', 'sandbox', 'connectors', 'knowledge', 'models', 'enterprise-identity', 'realtime', 'notifications']
const observedListCap = 25
// Observation patterns are heuristic evidence, never proof. `secrets` is observed as advisory
// evidence but is not a declarable capability — secret custody guidance activates whenever
// production secrets exist.
const patterns = {
  web: /(?:next|@opennextjs\/cloudflare)/i,
  flutter: /(?:pubspec\.yaml|package:flutter)/i,
  agents: /(?:\beve\b|@workflow\/world|AgentRun)/i,
  jobs: /(?:pg-boss|PgBoss)/i,
  sandbox: /(?:@cloudflare\/sandbox|SandboxProvider|enableInternet)/i,
  connectors: /(?:\bMCP\b|webhook|connector)/i,
  knowledge: /(?:pgvector|embedding|\bknowledge\b)/i,
  models: /(?:ai-gateway|generateText|streamText|BYOK)/i,
  'enterprise-identity': /(?:\bSCIM\b|\bSSO\b|saml)/i,
  realtime: /(?:EventSource|text\/event-stream|WebSocket)/i,
  notifications: /(?:firebase_messaging|APNs|notification)/i,
  secrets: /(?:OPENBAO|VAULT_ADDR|CLIENT_SECRET|DATABASE_URL)/i
}
const ignored = new Set(['node_modules', '.git', '.turbo', 'dist', 'build', '.next', '.agents', '.claude', 'coverage', 'vendor', 'out', '.output', '.vercel', '.wrangler'])

async function inspectableFiles(root) {
  const output = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink during inspection: ${path}`)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) output.push(path)
    }
  }
  await walk(root)
  return output.sort()
}

function baseDraft() {
  return {
    schemaVersion: 4,
    foundationVersion: '0.4.0',
    project: { name: 'REQUIRED-CONFIRMED-PROJECT-NAME', kind: 'REQUIRED-CONFIRMED-KIND', tier: 'REQUIRED-CONFIRMED-TIER', tenancy: 'REQUIRED-CONFIRMED-TENANCY' },
    hosting: 'REQUIRED-CONFIRMED-HOSTING',
    capabilities: [],
    notes: []
  }
}

// Only literally exact versions are recorded as facts; ranges ("^1.2.3") are not laundered into
// exact pins — they stay observational.
function exact(value) {
  const normalized = String(value ?? '').trim().replace(/^v/, '')
  return /^\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized) ? normalized : null
}

async function inspect(root) {
  const before = new Map()
  const allBefore = await inspectableFiles(root)
  for (const path of allBefore) before.set(path, (await lstat(path)).mtimeMs)
  const files = allBefore
  const packageVersions = {}
  for (const path of files.filter(path => basename(path) === 'package.json')) {
    try {
      const pkg = JSON.parse(await readFile(path, 'utf8'))
      for (const [name, value] of Object.entries({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })) if (exact(value)) packageVersions[name] = exact(value)
    } catch { /* malformed manifests remain observational unknowns */ }
  }
  const observed = Object.fromEntries(Object.keys(patterns).map(name => [name, []]))
  for (const path of files.filter(path => !/[\\/]\.vegastack[\\/]/.test(path) && (['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.toml', '.sql', '.dart'].includes(extname(path)) || basename(path) === 'pubspec.yaml'))) {
    const rel = relative(root, path).split(sep).join('/')
    let body = ''
    try { body = await readFile(path, 'utf8') } catch { continue }
    for (const [name, pattern] of Object.entries(patterns)) if (pattern.test(`${rel}\n${body}`)) observed[name].push(rel)
  }
  const profile = baseDraft()
  profile.capabilities = capabilityNames.filter(name => observed[name].length)
  const artifacts = ['.vegastack/architecture.json']
  if (['connectors', 'sandbox', 'agents'].some(name => observed[name].length)) artifacts.push('docs/architecture/threat-model.md')
  const after = await inspectableFiles(root)
  let changed = after.length !== before.size
  for (const path of after) if (!before.has(path) || before.get(path) !== (await lstat(path)).mtimeMs) changed = true
  if (changed) throw new Error('inspection mutation guard detected a changed file inventory')
  return { mode: 'brownfield-observed', mutated: false, observed, packageVersions, profileDraft: profile, relevantArtifacts: artifacts, caveats: ['Detection is heuristic and does not prove absence, placement, compliance, runtime behavior, or project intent. Every REQUIRED field must be confirmed before use.'] }
}

// Compact context-friendly view for interactive agent use; --json prints the full result.
function summarizeInspection(result) {
  const capabilities = {}
  for (const [name, paths] of Object.entries(result.observed)) if (paths.length) capabilities[name] = { count: paths.length, sample: paths.slice(0, 5) }
  return { mode: result.mode, mutated: result.mutated, observedCapabilities: capabilities, packageVersionCount: Object.keys(result.packageVersions).length, relevantArtifacts: result.relevantArtifacts, caveats: result.caveats, hint: 'run with --json for the full draft profile and evidence lists' }
}

function capObserved(result) {
  const observed = {}
  for (const [name, paths] of Object.entries(result.observed)) {
    observed[name] = paths.length > observedListCap ? [...paths.slice(0, observedListCap)] : paths
    if (paths.length > observedListCap) observed[`${name}TruncatedCount`] = paths.length - observedListCap
  }
  return { ...result, observed }
}

function fromAnswers(answers) {
  if (answers.schemaVersion === 4) return answers
  const profile = baseDraft()
  for (const key of ['project', 'hosting', 'capabilities', 'notes', 'foundationVersion']) if (answers[key] !== undefined) profile[key] = answers[key]
  return profile
}

// Deterministic v3 -> v4 migration: exceptions are dropped (the advisor records deliberate
// deviations in notes/ADR documents, never as suppression machinery), capability detail collapses
// to the enabled list, and versions return to lockfiles.
const v3CapabilityMap = { webControlPlane: 'web', flutter: 'flutter', agents: 'agents', jobs: 'jobs', sandbox: 'sandbox', connectors: 'connectors', knowledge: 'knowledge', modelRouting: 'models', enterpriseIdentity: 'enterprise-identity', realtime: 'realtime', notifications: 'notifications' }
const v3KindMap = { 'saas-product': 'saas', 'internal-product': 'internal-tool', 'public-product': 'saas', 'platform-service': 'api', 'shared-package': 'package' }

function migrateV3(old) {
  if (old.schemaVersion !== 3) throw new Error('migrate requires a schemaVersion 3 profile; older versions need a fresh v4 profile from answers')
  const profile = baseDraft()
  profile.project = {
    name: old.project?.name ?? 'REQUIRED-CONFIRMED-PROJECT-NAME',
    kind: v3KindMap[old.project?.kind] ?? 'REQUIRED-CONFIRMED-KIND',
    tier: 'REQUIRED-CONFIRMED-TIER',
    tenancy: old.project?.tenancy ?? 'REQUIRED-CONFIRMED-TENANCY'
  }
  profile.hosting = old.environments?.production?.hosting ?? 'REQUIRED-CONFIRMED-HOSTING'
  profile.capabilities = Object.entries(old.capabilities ?? {}).filter(([, value]) => value?.status === 'enabled').map(([name]) => v3CapabilityMap[name]).filter(Boolean)
  profile.notes = (old.exceptions ?? []).map(exception => `migrated deviation (was exception ${exception.id} on ${exception.ruleId}): ${exception.decision ?? exception.rationale ?? 'see original ADR'}`)
  return { profile, guidance: ['Confirm the tier deliberately — it decides which concerns apply, not which tools.', 'v3 exceptions were converted to notes; the advisor has no suppression machinery.', 'Versions now come from lockfiles at advice time.', 'No source file or old profile was changed.'] }
}

async function assertNoSymlink(path) {
  const absolute = resolve(path)
  const root = resolve(absolute, sep)
  let current = root
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing symlink path component: ${current}`) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  }
}

async function atomicWrite(path, body, force) {
  await assertNoSymlink(dirname(path))
  await mkdir(dirname(path), { recursive: true })
  await assertNoSymlink(dirname(path))
  if (await pathExists(path)) {
    await assertNoSymlink(path)
    const current = await readFile(path, 'utf8')
    if (current === body) return 'unchanged'
    if (!force) throw new Error(`Refusing differing file without --force: ${path}`)
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx')
  try { await handle.writeFile(body); await handle.sync() } finally { await handle.close() }
  await rename(temporary, path)
  return 'written'
}

function flagValue(argv, flag) {
  const value = argv.shift()
  if (value === undefined || value.startsWith('-')) throw new Error(`${flag} requires a value`)
  return value
}

function parse(argv) {
  const command = argv.shift() ?? 'help'
  const input = argv[0] && !argv[0].startsWith('-') ? argv.shift() : undefined
  const options = { command, input, dir: process.cwd(), write: false, force: false, json: false, output: undefined }
  while (argv.length) {
    const flag = argv.shift()
    if (flag === '--dir') options.dir = resolve(flagValue(argv, flag))
    else if (flag === '--write') options.write = true
    else if (flag === '--force') options.force = true
    else if (flag === '--json') options.json = true
    else if (flag === '--output') options.output = flagValue(argv, flag)
    else throw new Error(`Unknown option: ${flag}`)
  }
  return options
}

// Output paths are confined to --dir: repository-relative, no .. segments, no symlink components.
function confinedOutput(dir, output) {
  if (isAbsolute(output) || output.split(/[\\/]/).includes('..')) throw new Error(`--output must be a repository-relative path inside --dir without ..: ${output}`)
  const target = resolve(dir, output)
  if (relative(resolve(dir), target).startsWith('..')) throw new Error(`--output escapes --dir: ${output}`)
  if (!output || target === resolve(dir)) throw new Error(`--output must name a file inside --dir, not the directory itself: ${JSON.stringify(output)}`)
  return target
}

async function main() {
  const options = parse(process.argv.slice(2))
  if (options.command === 'help') return console.log('Usage: profile-tool.mjs inspect [DIR] [--json] | scaffold ANSWERS.json --dir DIR [--write] [--force] [--output PATH] | migrate PROFILE --dir DIR [--write] [--force] [--output PATH]\n\ninspect prints a compact summary by default; --json prints the full draft and evidence.\nscaffold answers format: see assets/answers-example.json next to this skill.\nmigrate converts a v3 profile to a v4 draft (exceptions become notes).\nWrites are atomic, refuse symlinks, stay inside --dir, and require --force to replace differing content.')
  if (options.command === 'inspect') {
    const root = resolve(options.input ?? options.dir)
    const result = await inspect(root)
    return console.log(JSON.stringify(options.json ? capObserved(result) : summarizeInspection(result), null, 2))
  }
  if (!['scaffold', 'migrate'].includes(options.command) || !options.input) throw new Error('A supported command and input file are required')
  const source = resolve(options.input)
  const parsed = await readJsonYaml(source)
  const result = options.command === 'migrate' ? migrateV3(parsed) : { profile: fromAnswers(parsed), guidance: ['Generated only from supplied answers; confirm draft facts before relying on them.'] }
  const body = `${JSON.stringify(result.profile, null, 2)}\n`
  const defaultOutput = options.command === 'migrate' ? '.vegastack/architecture.v4-draft.json' : '.vegastack/architecture.json'
  const output = confinedOutput(options.dir, options.output ?? defaultOutput)
  const payload = { mode: options.write ? 'authorized-write' : 'dry-run', output, profile: result.profile, guidance: result.guidance }
  if (!options.write) return console.log(JSON.stringify(payload, null, 2))
  payload.result = await atomicWrite(output, body, options.force)
  console.log(JSON.stringify(payload, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(error => { console.error(`error: ${error.message}`); process.exitCode = 1 })

export { inspect, migrateV3, fromAnswers, atomicWrite }
