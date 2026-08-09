#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { listFiles, readJsonYaml, resolveProfile } from './lib.mjs'
import { validateJsonSchema } from './schema-validate.mjs'

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const architectureRoot = join(skillRoot, 'references', 'architecture')
const schemaPath = join(skillRoot, 'assets', 'architecture-profile.schema.json')

export async function canonicalRuleIds() {
  const ids = new Set()
  const duplicates = new Set()
  for (const path of await listFiles(architectureRoot, file => file.endsWith('.md'))) {
    const body = await readFile(path, 'utf8')
    for (const match of body.matchAll(/\*\*([A-Z]+-[0-9]{3}) —/g)) {
      if (ids.has(match[1])) duplicates.add(match[1])
      ids.add(match[1])
    }
  }
  if (duplicates.size) throw new Error(`Duplicate canonical rule IDs: ${[...duplicates].join(', ')}`)
  return ids
}

// Collect every REQUIRED-* placeholder still present so a draft cannot be mistaken for
// confirmed facts.
function unconfirmedValues(value, path = '') {
  if (typeof value === 'string') return value.startsWith('REQUIRED-') ? [path || '(root)'] : []
  if (Array.isArray(value)) return value.flatMap((item, index) => unconfirmedValues(item, `${path}[${index}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => unconfirmedValues(item, path ? `${path}.${key}` : key))
  return []
}

export async function validateProfile(path) {
  let profile
  try { profile = await readJsonYaml(path) } catch (error) {
    return { profile: null, errors: [error.message] }
  }
  if (profile.schemaVersion === 2 || profile.schemaVersion === 3) {
    return { profile, errors: [`schemaVersion ${profile.schemaVersion} is obsolete; run profile-tool.mjs migrate <profile> for a deterministic read-only v4 draft, then confirm project facts (v2 needs a fresh v4 profile from answers)`] }
  }
  const errors = []
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  for (const message of validateJsonSchema(schema, profile)) errors.push(message)
  for (const location of unconfirmedValues(profile)) errors.push(`${location}: replace the REQUIRED placeholder with a confirmed fact`)
  return { profile, errors }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argument = process.argv.slice(2).find(value => !value.startsWith('-'))
  let path = argument ? resolve(argument) : null
  if (!path) {
    const discovered = await resolveProfile(process.cwd())
    if (!discovered) { console.error('error: no .vegastack/architecture.json (or legacy .yaml) profile found; pass a path explicitly'); process.exit(2) }
    if (discovered.legacy) console.error(`deprecation: ${discovered.relative} uses the legacy .yaml name for a JSON document; rename to .vegastack/architecture.json`)
    path = discovered.path
  }
  const json = process.argv.includes('--json')
  const result = await validateProfile(path)
  if (json) console.log(JSON.stringify({ path, valid: result.errors.length === 0, errors: result.errors }, null, 2))
  else if (result.errors.length) for (const error of result.errors) console.error(`invalid profile: ${error}`)
  else console.log(`validate-profile: valid ${path}`)
  if (result.errors.length) process.exitCode = 1
}
