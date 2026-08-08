#!/usr/bin/env node
// Scaffold a new skill tree at skills/<name>/ from skillify's templates.
//
//   node scripts/scaffold-skill.mjs <skill-name> --dir <repo-root> [--write] [--json]
//
// Dry-run by default: prints the plan (files that would be created plus the
// remaining manual wiring steps) and creates nothing. --write stages the tree
// in a temporary sibling inside skills/ and renames it into place, refusing
// existing directories and symlinks. Exit codes: 0 ok, 1 refusal or failure,
// 2 usage error.
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const templatesRoot = resolve(here, '..', 'assets', 'templates')

// Template file -> output path inside skills/<name>/ (null = tests/<name>.test.ts).
export const templateFiles = [
  ['SKILL.md.template', 'SKILL.md'],
  ['README.md.template', 'README.md'],
  ['sources.json.template', 'refresh/sources.json'],
  ['REFRESH.md.template', 'refresh/REFRESH.md'],
  ['openai.yaml.template', 'agents/openai.yaml'],
  ['skill.test.ts.template', null],
]

// Full grammar shared by the repo validator and every target harness: starts
// with a lowercase letter, then lowercase letters/digits/hyphens, no
// consecutive hyphens, no trailing hyphen, at most 64 characters.
export function validateName(name) {
  if (typeof name !== 'string' || name.length === 0) return 'skill name is required'
  if (name.length > 64) return `name is ${name.length} characters; the maximum is 64`
  if (!/^[a-z]/.test(name)) return 'name must start with a lowercase letter'
  if (!/^[a-z0-9-]+$/.test(name)) return 'name may contain only lowercase letters, digits, and hyphens'
  if (name.includes('--')) return 'name must not contain consecutive hyphens'
  if (name.endsWith('-')) return 'name must not end with a hyphen'
  return null
}

export function wiringSteps(name) {
  return [
    `Add skills/${name}/ packaged files to the allowlist in packages/cli/scripts/sync-skill.mjs (the build fails loudly on unlisted files)`,
    `Add a ${name} row to the Skills table in the root README.md`,
    `Add a CHANGELOG entry (changeset) introducing ${name}`,
  ]
}

async function entryAt(path) {
  try {
    return await lstat(path)
  } catch {
    return null
  }
}

export async function scaffoldSkill({ name, dir, write = false, now = new Date() }) {
  const nameError = validateName(name)
  if (nameError) throw new Error(`Invalid skill name ${JSON.stringify(name ?? null)}: ${nameError}`)
  if (!dir) throw new Error('--dir <repo-root> is required')
  const repoRoot = resolve(dir)
  const skillsRoot = join(repoRoot, 'skills')
  const skillsEntry = await entryAt(skillsRoot)
  // lstat does not follow symlinks, so a symlinked skills/ fails isDirectory().
  if (!skillsEntry || !skillsEntry.isDirectory()) {
    throw new Error(`${skillsRoot} is not a real directory - point --dir at the vegastack-skills repo root`)
  }
  const target = join(skillsRoot, name)
  if (await entryAt(target)) throw new Error(`Refusing to scaffold: ${target} already exists`)

  const outputs = templateFiles.map(([source, output]) => [source, output ?? `tests/${name}.test.ts`])
  const plan = { name, target, files: outputs.map(([, output]) => output), wiring: wiringSteps(name), wrote: false }
  if (!write) return plan

  const date = now.toISOString().slice(0, 10)
  const staging = await mkdtemp(join(skillsRoot, `.${name}.scaffold-`))
  try {
    for (const [source, output] of outputs) {
      const body = await readFile(join(templatesRoot, source), 'utf8')
      const rendered = body.replaceAll('{{name}}', name).replaceAll('{{date}}', date)
      const destination = join(staging, output)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, rendered)
    }
    if (await entryAt(target)) throw new Error(`Refusing to scaffold: ${target} already exists`)
    await rename(staging, target)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
  return { ...plan, wrote: true }
}

function parseArguments(argv) {
  const options = { name: undefined, dir: undefined, write: false, json: false }
  const rest = [...argv]
  while (rest.length) {
    const flag = rest.shift()
    if (flag === '--dir') {
      const value = rest.shift()
      if (value === undefined || value.startsWith('-')) throw new Error('--dir requires a value')
      options.dir = value
    } else if (flag === '--write') options.write = true
    else if (flag === '--json') options.json = true
    else if (flag.startsWith('-')) throw new Error(`Unknown option: ${flag}`)
    else if (options.name === undefined) options.name = flag
    else throw new Error(`Unexpected argument: ${flag}`)
  }
  if (!options.name || !options.dir) {
    throw new Error('Usage: node scripts/scaffold-skill.mjs <skill-name> --dir <repo-root> [--write] [--json]')
  }
  return options
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(String(error.message ?? error))
    process.exit(2)
  }
  try {
    const result = await scaffoldSkill(options)
    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(result.wrote ? `Created ${result.target}` : `Dry run - pass --write to create ${result.target}`)
      for (const file of result.files) console.log(`  ${file}`)
      console.log('Remaining manual wiring:')
      for (const step of result.wiring) console.log(`  - ${step}`)
    }
  } catch (error) {
    console.error(String(error.message ?? error))
    process.exit(1)
  }
}
