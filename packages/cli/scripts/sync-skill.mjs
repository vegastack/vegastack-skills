import { copyFile, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const skillsRoot = resolve(packageRoot, '../../skills')
const bundleRoot = join(packageRoot, 'skill')

// Explicit per-skill packaging allowlists. Anything authored that is neither listed here nor in
// unpackagedPrefixes fails the build loudly — a forgotten entry must never ship a silently
// incomplete skill. README.md is repo-side only (its relative links target repo paths); tests are
// never packaged.
const unpackagedPrefixes = ['tests/', 'README.md']
const packagedSkills = {
  architect: [
    'SKILL.md',
    'agents/openai.yaml',
    'assets/arch-template.md',
    'assets/adr-template.md',
    ...['principles', 'stack', 'pinned-facts', 'project-profile', 'web', 'data', 'infra', 'ai-agents', 'security', 'mobile', 'advisory'].map(name => `references/${name}.md`),
    'refresh/REFRESH.md',
    'refresh/sources.json',
  ],
  'skill-maintainer': [
    'SKILL.md',
    'agents/openai.yaml',
    'references/standards.md',
    'references/release-ops.md',
    'refresh/REFRESH.md',
    'refresh/sources.json',
  ],
  'skillify': [
    'SKILL.md',
    'agents/openai.yaml',
    'references/authoring.md',
    'references/eval-playbook.md',
    ...['SKILL.md.template', 'README.md.template', 'sources.json.template', 'REFRESH.md.template', 'openai.yaml.template', 'skill.test.ts.template'].map(name => `assets/templates/${name}`),
    'scripts/scaffold-skill.mjs',
    'refresh/REFRESH.md',
    'refresh/sources.json',
  ],
}

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

// Every authored skill must have a packaging allowlist, and vice versa.
const authoredSkills = (await readdir(skillsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
const listedSkills = Object.keys(packagedSkills).sort()
const unlistedSkills = authoredSkills.filter(name => !listedSkills.includes(name))
if (unlistedSkills.length) throw new Error(`Authored skills without a packaging allowlist in sync-skill.mjs: ${unlistedSkills.join(', ')}`)
const missingSkills = listedSkills.filter(name => !authoredSkills.includes(name))
if (missingSkills.length) throw new Error(`Packaging allowlist names skills that do not exist: ${missingSkills.join(', ')}`)

await rm(bundleRoot, { recursive: true, force: true })
const manifest = { schemaVersion: 2, skills: {} }

for (const skillName of listedSkills) {
  const source = join(skillsRoot, skillName)
  const destination = join(bundleRoot, skillName)
  const runtimeFiles = packagedSkills[skillName]

  const authored = (await files(source)).map(path => relative(source, path).split(sep).join('/'))
  const allowlisted = new Set(runtimeFiles)
  const unlisted = authored.filter(key => !allowlisted.has(key) && !unpackagedPrefixes.some(prefix => key.startsWith(prefix)))
  if (unlisted.length) throw new Error(`${skillName}: authored files neither allowlisted for packaging nor deliberately unpackaged: ${unlisted.join(', ')}`)
  const missing = runtimeFiles.filter(key => !authored.includes(key))
  if (missing.length) throw new Error(`${skillName}: allowlisted runtime files missing from the authored skill: ${missing.join(', ')}`)

  for (const key of runtimeFiles) {
    const from = join(source, key)
    if (!(await lstat(from)).isFile()) throw new Error(`${skillName}: runtime allowlist entry is not a regular file: ${key}`)
    const to = join(destination, key)
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
  }

  const skillManifest = { files: {} }
  for (const path of await files(destination)) {
    const key = relative(destination, path).split(sep).join('/')
    skillManifest.files[key] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  if (Object.keys(skillManifest.files).length !== runtimeFiles.length) throw new Error(`${skillName}: packaged inventory differs from the explicit allowlist`)
  manifest.skills[skillName] = skillManifest
  await stat(join(destination, 'SKILL.md'))
}

await writeFile(join(packageRoot, 'skill-integrity.json'), `${JSON.stringify(manifest, null, 2)}\n`)
