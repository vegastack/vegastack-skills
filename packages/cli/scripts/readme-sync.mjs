#!/usr/bin/env node
// Generates each skill README's "What's in this skill" table from the skill's entry in
// packages/cli/packaging.json, so twelve hand-maintained mirrors become one command.
// structure.mjs check imports the same three functions, so the guard and the generator can never
// disagree about what "in sync" means.
//
//   node packages/cli/scripts/readme-sync.mjs [--write] [--json] [--dir PATH]
//
// Dry run by default: prints the diff per README and exits 1 when anything is pending. --write
// rewrites the table region only, atomically (temp file + rename), and refuses a symlinked README.
// A README carrying a row the grammar below cannot classify stops the whole run before any write
// (exit 2), so a hand-written row is never silently deleted.
//
// Table grammar. Rows come from the packaging entry, in packaging order. A first cell is one of:
//   [path](path)                    a packaged file that exists on disk (several links = several paths)
//   `path`                          a packaged file missing on disk, or, with a trailing slash, a directory
//   path (installed copy)           a `path@skill` packaging entry copied in from another skill
// A directory row is kept, collapsed, at the first packaged path under it; a directory covering no
// packaged path is unclassified. `tests/` always closes the table; `evals/` follows when the
// directory exists. Neither is packaged, which is why they are fixed rows and not packaging entries.
//
// Exit codes: 0 in sync or written · 1 dry run with pending changes · 2 refusal or usage error.
import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverSkills } from './lib/skills.mjs'

export const TABLE_HEADING = /^##\s+What's in this skill\s*$/
export const TABLE_HEADER = ['| Path | Purpose |', '|---|---|']
// The placeholder a newly packaged path gets. structure.mjs warns on it; --strict makes that fatal.
export const TODO_PURPOSE = 'TODO purpose'
export const INSTALLED_COPY_PURPOSE = 'The workflow artifact spec, duplicated into every dev-family install'
export const TRAILING_DIRS = [
  ['tests/', 'Bun tests and fixtures (never packaged)'],
  ['evals/', 'Behavioral evals in the agentskills.io format (never packaged)'],
]

const ROW = /^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/
const LINK = /\[[^\]]+\]\(([^)]+)\)/g
const BACKTICKED = /^`([^`]+)`$/
const INSTALLED_COPY = /^(\S+) \(installed copy\)$/

// Locates the table under the heading: the header line, then every contiguous line starting
// with "|". The search stops at the next "## " heading so a table in a later section never counts.
export function parseSkillTable(body) {
  const lines = body.split('\n')
  const heading = lines.findIndex((line) => TABLE_HEADING.test(line))
  if (heading === -1) return null
  let start = -1
  for (let i = heading + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) break
    if (lines[i] === TABLE_HEADER[0]) { start = i; break }
  }
  if (start === -1) return null
  let end = start
  while (end < lines.length && lines[end].startsWith('|')) end += 1
  const rows = []
  const malformed = []
  for (const line of lines.slice(start + 2, end)) {
    const match = ROW.exec(line)
    if (match) rows.push({ cell: match[1], purpose: match[2], line })
    else malformed.push(line)
  }
  return { start, end, rows, malformed }
}

export function classifyCell(cell) {
  const links = [...cell.matchAll(LINK)]
  if (links.length) {
    // Only separators may sit between links; any other text is a row the grammar does not own.
    if (!/^[\s+,&]*$/.test(cell.replace(LINK, ''))) return null
    return { kind: 'files', paths: links.map((match) => match[1]) }
  }
  const backticked = BACKTICKED.exec(cell)
  if (backticked) {
    const inner = backticked[1]
    if (/[{}*?]/.test(inner)) return null
    return inner.endsWith('/') ? { kind: 'dir', dir: inner } : { kind: 'files', paths: [inner] }
  }
  const copy = INSTALLED_COPY.exec(cell)
  if (copy) return { kind: 'files', paths: [copy[1]] }
  return null
}

const isTrailing = (dir) => TRAILING_DIRS.some(([name]) => name === dir)

export function renderTable(entry, rows, io) {
  const paths = entry.map((item) => {
    const at = item.indexOf('@')
    return at === -1 ? { path: item, installed: false } : { path: item.slice(0, at), installed: true }
  })
  const purposeByPath = new Map()
  const purposeByDir = new Map()
  const collapsed = []
  const unclassified = []
  for (const row of rows) {
    const classified = classifyCell(row.cell)
    if (!classified) { unclassified.push(row.cell); continue }
    if (classified.kind === 'files') {
      for (const path of classified.paths) purposeByPath.set(path, row.purpose)
      continue
    }
    purposeByDir.set(classified.dir, row.purpose)
    if (isTrailing(classified.dir)) continue
    if (paths.some(({ path }) => path.startsWith(classified.dir))) collapsed.push(classified.dir)
    else unclassified.push(row.cell)
  }

  const lines = [...TABLE_HEADER]
  const todo = []
  const emitted = new Set()
  for (const { path, installed } of paths) {
    const dir = collapsed.find((candidate) => path.startsWith(candidate))
    if (dir) {
      if (!emitted.has(dir)) {
        emitted.add(dir)
        lines.push(`| \`${dir}\` | ${purposeByDir.get(dir)} |`)
      }
      continue
    }
    const cell = installed ? `${path} (installed copy)` : io.fileExists(path) ? `[${path}](${path})` : `\`${path}\``
    const purpose = purposeByPath.get(path) ?? (installed ? INSTALLED_COPY_PURPOSE : TODO_PURPOSE)
    if (purpose === TODO_PURPOSE) todo.push(path)
    lines.push(`| ${cell} | ${purpose} |`)
  }
  for (const [dir, defaultPurpose] of TRAILING_DIRS) {
    if (dir !== 'tests/' && !io.dirExists(dir.replace(/\/$/, ''))) continue
    lines.push(`| \`${dir}\` | ${purposeByDir.get(dir) ?? defaultPurpose} |`)
  }
  return { lines, unclassified, todo }
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

// Set difference in both directions, not a positional diff: table rows are keyed by path, so
// "what left and what arrived" is the whole story and never mislabels a reorder.
export function lineDiff(before, after) {
  const removed = before.filter((line) => !after.includes(line)).map((line) => `- ${line}`)
  const added = after.filter((line) => !before.includes(line)).map((line) => `+ ${line}`)
  return [...removed, ...added]
}

// The disk view renderTable needs for one skill; structure.mjs uses the same one so the check
// and the generator see identical files.
export function skillIo(skillDir) {
  return {
    fileExists: (rel) => existsSync(join(skillDir, rel)),
    dirExists: (rel) => existsSync(join(skillDir, rel)),
  }
}

export function syncSkillReadme({ skillDir, entry, write }) {
  const readme = join(skillDir, 'README.md')
  let stat
  try {
    stat = lstatSync(readme)
  } catch {
    throw new Error(`${readme} is missing`)
  }
  // lstat does not follow symlinks: a symlinked README would be replaced by the rename below
  // with a regular file at a path the operator did not mean, so refuse before reading.
  if (stat.isSymbolicLink()) throw new Error(`${readme} is a symlink — refusing to rewrite through it`)
  const body = readFileSync(readme, 'utf8')
  const table = parseSkillTable(body)
  if (!table) throw new Error(`${readme} has no "## What's in this skill" table — add the heading and header, then run again`)
  const { lines, unclassified, todo } = renderTable(entry, table.rows, skillIo(skillDir))
  // A pipe line the row regex rejects (a hand edit missing its trailing pipe, say) would
  // otherwise vanish in the splice; it is unclassified, and unclassified stops the write.
  for (const line of table.malformed) unclassified.push(`malformed row: ${line}`)
  const before = body.split('\n')
  const current = before.slice(table.start, table.end)
  const spliced = [...before.slice(0, table.start), ...lines, ...before.slice(table.end)].join('\n')
  const changed = spliced !== body
  let wrote = false
  if (write && changed && !unclassified.length) {
    const staging = `${readme}.readme-sync-tmp`
    writeFileSync(staging, spliced)
    renameSync(staging, readme)
    wrote = true
  }
  return { readme, changed, wrote, unclassified, todo, diff: lineDiff(current, lines) }
}

// Plans every skill before writing any: a refusal anywhere means nothing is written anywhere,
// so a half-synced tree is impossible.
export function syncRepo({ repoRoot, write }) {
  const root = resolve(repoRoot)
  const packaged = JSON.parse(readFileSync(join(root, 'packages/cli/packaging.json'), 'utf8'))
  const skills = discoverSkills(join(root, 'skills'))
  const plan = (writeNow) => {
    const results = []
    const errors = []
    for (const name of Object.keys(packaged).sort()) {
      const skill = skills.get(name)
      if (!skill) { errors.push({ name, message: `packaging.json names "${name}", which is not an authored skill` }); continue }
      if (!Array.isArray(packaged[name])) { errors.push({ name, message: `packaging.json entry for "${name}" is not an array` }); continue }
      try {
        results.push({ name, ...syncSkillReadme({ skillDir: skill.path, entry: packaged[name], write: writeNow }) })
      } catch (error) {
        errors.push({ name, message: String(error.message ?? error) })
      }
    }
    return { skills: results, errors }
  }
  const dry = plan(false)
  const clean = dry.errors.length === 0 && dry.skills.every((skill) => skill.unclassified.length === 0)
  return write && clean ? plan(true) : dry
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArguments(argv) {
  const options = { write: false, json: false, dir: undefined }
  const rest = [...argv]
  while (rest.length) {
    const flag = rest.shift()
    if (flag === '--write') options.write = true
    else if (flag === '--json') options.json = true
    else if (flag === '--dir') {
      const value = rest.shift()
      if (value === undefined || value.startsWith('-')) throw new Error('--dir requires a value')
      options.dir = value
    }
    else throw new Error(`Unknown option: ${flag}\nUsage: readme-sync.mjs [--write] [--json] [--dir PATH]`)
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
  const repoRoot = options.dir ? resolve(options.dir) : resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  let result
  try {
    result = syncRepo({ repoRoot, write: options.write })
  } catch (error) {
    result = { skills: [], errors: [{ name: '(repo)', message: String(error.message ?? error) }] }
  }
  const { skills, errors } = result
  const ok = errors.length === 0 && skills.every((skill) => skill.unclassified.length === 0)
  if (options.json) {
    console.log(JSON.stringify({ guard: 'readme-sync', ok, write: options.write, skills, errors }, null, 2))
  } else {
    for (const skill of skills) {
      const state = skill.wrote ? 'written' : skill.changed ? 'pending' : 'in sync'
      console.log(`readme-sync: ${skill.name} ${state}`)
      for (const cell of skill.unclassified) console.error(`  unclassified: ${cell}`)
      if (skill.changed) for (const line of skill.diff) console.log(`  ${line}`)
    }
    for (const error of errors) console.error(`error: ${error.name}: ${error.message}`)
  }
  process.exit(!ok ? 2 : (!options.write && skills.some((skill) => skill.changed)) ? 1 : 0)
}
