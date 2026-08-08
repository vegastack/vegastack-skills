import { copyFile, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const source = resolve(packageRoot, '../../skills/vegastack-arch-guardian')
const destination = join(packageRoot, 'skill', 'vegastack-arch-guardian')

const runtimeFiles = [
  'SKILL.md',
  'agents/openai.yaml',
  'assets/adr-template.md',
  'assets/answers-example.json',
  'assets/architecture-profile.schema.json',
  'assets/architecture-profile.json',
  'assets/deployment-review-template.md',
  'assets/service-design-template.md',
  'assets/threat-model-template.md',
  ...['agent-product', 'ai-cost', 'ai-data-boundaries', 'ai-evals', 'connectors-sandbox', 'data-memory', 'delivery-operations', 'durable-execution', 'flutter', 'foundation', 'hosting-reliability', 'identity-tenancy', 'model-lifecycle', 'models-observability', 'realtime-channels', 'security-privacy', 'topology-monorepo', 'web'].map(name => `references/architecture/${name}.md`),
  'references/foundation-compatibility.json',
  'references/control-catalog.json',
  'references/rule-model.json',
  'references/workflows.md',
  'references/profile-governance.md',
  'references/golden-patterns.md',
  'refresh/REFRESH.md',
  'refresh/sources.json',
  ...['architecture-check.mjs', 'lib.mjs', 'profile-tool.mjs', 'refresh-evidence.mjs', 'schema-validate.mjs', 'validate-profile.mjs', 'verify-corpus.mjs'].map(name => `scripts/${name}`),
]

// Paths in the authored tree that are deliberately NOT packaged. README.md is the repo-side
// walkthrough (its relative links target repo paths that do not exist in an installed copy);
// SKILL.md is the installed entry point.
const unpackagedPrefixes = ['tests/', 'README.md']

async function files(root) {
  const output = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Refusing canonical skill symlink: ${path}`)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) output.push(path)
    }
  }
  await walk(root)
  return output.sort()
}

// Reject symlinks anywhere in the canonical skill, and fail loudly on any authored file that is
// neither allowlisted nor deliberately unpackaged — a forgotten allowlist entry must never ship a
// silently incomplete skill.
const authored = (await files(source)).map(path => relative(source, path).split(sep).join('/'))
const allowlisted = new Set(runtimeFiles)
const unlisted = authored.filter(key => !allowlisted.has(key) && !unpackagedPrefixes.some(prefix => key.startsWith(prefix)))
if (unlisted.length) throw new Error(`Authored skill files are neither allowlisted for packaging nor listed as deliberately unpackaged: ${unlisted.join(', ')}`)
const missing = runtimeFiles.filter(key => !authored.includes(key))
if (missing.length) throw new Error(`Allowlisted runtime files are missing from the authored skill: ${missing.join(', ')}`)

await rm(join(packageRoot, 'skill'), { recursive: true, force: true })
for (const key of runtimeFiles) {
  const from = join(source, key)
  if (!(await lstat(from)).isFile()) throw new Error(`Runtime allowlist entry is not a regular file: ${key}`)
  const to = join(destination, key)
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
}

const manifest = { schemaVersion: 1, skill: 'vegastack-arch-guardian', files: {} }
for (const path of await files(destination)) {
  const key = relative(destination, path).split(sep).join('/')
  const body = await readFile(path)
  manifest.files[key] = createHash('sha256').update(body).digest('hex')
}
if (Object.keys(manifest.files).length !== runtimeFiles.length) throw new Error('Packaged runtime file inventory differs from the explicit allowlist')
await writeFile(join(packageRoot, 'skill-integrity.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await stat(join(destination, 'SKILL.md'))
