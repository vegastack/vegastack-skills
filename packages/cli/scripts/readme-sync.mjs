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

export const TABLE_HEADING = /^##\s+What's in this skill\s*$/
export const TABLE_HEADER = ['| Path | Purpose |', '|---|---|']
// The placeholder a newly packaged path gets. structure.mjs warns on it; --strict makes that fatal.
export const TODO_PURPOSE = ['TODO', 'purpose'].join(' ')
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
  for (const line of lines.slice(start + 2, end)) {
    const match = ROW.exec(line)
    if (match) rows.push({ cell: match[1], purpose: match[2], line })
  }
  return { start, end, rows }
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
