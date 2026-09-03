import { describe, expect, test } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyCell, parseSkillTable, renderTable, syncRepo, TABLE_HEADER, TODO_PURPOSE, INSTALLED_COPY_PURPOSE } from '../scripts/readme-sync.mjs'

const io = (files: string[], dirs: string[] = []) => ({
  fileExists: (p: string) => files.includes(p),
  dirExists: (d: string) => dirs.includes(d),
})
const body = (rows: string[]) => ['# x', '', "## What's in this skill", '', ...TABLE_HEADER, ...rows, '', '## Behavior', ''].join('\n')
const row = (cell: string, purpose: string) => `| ${cell} | ${purpose} |`

describe('parseSkillTable', () => {
  test('finds the region and splits cells from purposes', () => {
    const table = parseSkillTable(body([row('[SKILL.md](SKILL.md)', 'entry'), row('`tests/`', 'tests')]))!
    expect(table.start).toBe(4)
    expect(table.end).toBe(8)
    expect(table.rows.map(r => [r.cell, r.purpose])).toEqual([['[SKILL.md](SKILL.md)', 'entry'], ['`tests/`', 'tests']])
  })
  test('returns null when the heading or the header is absent', () => {
    expect(parseSkillTable('# x\n\n## Shape\n\n| Piece | Purpose |\n|---|---|\n')).toBeNull()
    expect(parseSkillTable("# x\n\n## What's in this skill\n\nprose only\n")).toBeNull()
  })
})

describe('classifyCell', () => {
  test('links, backticks, installed copies, directories, and junk', () => {
    expect(classifyCell('[SKILL.md](SKILL.md)')).toEqual({ kind: 'files', paths: ['SKILL.md'] })
    expect(classifyCell('[refresh/REFRESH.md](refresh/REFRESH.md) + [refresh/sources.json](refresh/sources.json)')).toEqual({ kind: 'files', paths: ['refresh/REFRESH.md', 'refresh/sources.json'] })
    expect(classifyCell('`scripts/x.mjs`')).toEqual({ kind: 'files', paths: ['scripts/x.mjs'] })
    expect(classifyCell('references/conventions.md (installed copy)')).toEqual({ kind: 'files', paths: ['references/conventions.md'] })
    expect(classifyCell('`assets/templates/`')).toEqual({ kind: 'dir', dir: 'assets/templates/' })
    expect(classifyCell('`references/{web,data}.md`')).toBeNull()
    expect(classifyCell('SKILL.md')).toBeNull()
  })
})

describe('renderTable', () => {
  const entry = ['SKILL.md', 'references/conventions.md@dev-setup', 'scripts/a.mjs']
  const disk = io(['SKILL.md', 'scripts/a.mjs'])
  test('packaging order, links for files on disk, installed-copy default purpose, fixed tests row', () => {
    const { lines, todo, unclassified } = renderTable(entry, [], disk)
    expect(lines).toEqual([...TABLE_HEADER,
      `| [SKILL.md](SKILL.md) | ${TODO_PURPOSE} |`,
      `| references/conventions.md (installed copy) | ${INSTALLED_COPY_PURPOSE} |`,
      `| [scripts/a.mjs](scripts/a.mjs) | ${TODO_PURPOSE} |`,
      '| `tests/` | Bun tests and fixtures (never packaged) |'])
    expect(todo).toEqual(['SKILL.md', 'scripts/a.mjs'])
    expect(unclassified).toEqual([])
  })
  test('preserves purpose by path regardless of the old order, drops removed paths', () => {
    const rows = parseSkillTable(body([row('[scripts/a.mjs](scripts/a.mjs)', 'the guard'), row('[gone.md](gone.md)', 'old'), row('[SKILL.md](SKILL.md)', 'entry'), row('`tests/`', 'custom tests')]))!.rows
    const { lines, todo } = renderTable(entry, rows, disk)
    expect(lines[2]).toBe('| [SKILL.md](SKILL.md) | entry |')
    expect(lines[4]).toBe('| [scripts/a.mjs](scripts/a.mjs) | the guard |')
    expect(lines[5]).toBe('| `tests/` | custom tests |')
    expect(lines.join('\n')).not.toContain('gone.md')
    expect(todo).toEqual([])
  })
  test('is idempotent: rendering its own output changes nothing', () => {
    const first = renderTable(entry, [], disk).lines
    const again = renderTable(entry, parseSkillTable(body(first.slice(2)))!.rows, disk).lines
    expect(again).toEqual(first)
  })
  test('a multi-link row splits into one row per path sharing the purpose', () => {
    const rows = parseSkillTable(body([row('[refresh/REFRESH.md](refresh/REFRESH.md) + [refresh/sources.json](refresh/sources.json)', 'waiver')]))!.rows
    const { lines } = renderTable(['refresh/REFRESH.md', 'refresh/sources.json'], rows, io(['refresh/REFRESH.md', 'refresh/sources.json']))
    expect(lines.slice(2, 4)).toEqual(['| [refresh/REFRESH.md](refresh/REFRESH.md) | waiver |', '| [refresh/sources.json](refresh/sources.json) | waiver |'])
  })
  test('a directory row collapses the packaged paths under it, once, at the first one', () => {
    const rows = parseSkillTable(body([row('[SKILL.md](SKILL.md)', 'e'), row('`assets/templates/`', 'seven templates')]))!.rows
    const { lines, unclassified } = renderTable(['SKILL.md', 'assets/templates/a.md', 'assets/templates/b.md', 'scripts/x.mjs'], rows, io(['SKILL.md', 'assets/templates/a.md', 'assets/templates/b.md', 'scripts/x.mjs']))
    expect(lines.slice(2)).toEqual(['| [SKILL.md](SKILL.md) | e |', '| `assets/templates/` | seven templates |', `| [scripts/x.mjs](scripts/x.mjs) | ${TODO_PURPOSE} |`, '| `tests/` | Bun tests and fixtures (never packaged) |'])
    expect(unclassified).toEqual([])
  })
  test('a directory row covering nothing, or a glob, is unclassified', () => {
    const rows = parseSkillTable(body([row('`references/`', 'none'), row('`references/{web,data}.md`', 'glob')]))!.rows
    expect(renderTable(['SKILL.md'], rows, disk).unclassified).toEqual(['`references/`', '`references/{web,data}.md`'])
  })
  test('a missing file renders in backticks; evals/ appears only when the directory exists', () => {
    expect(renderTable(['SKILL.md'], [], io([])).lines[2]).toBe(`| \`SKILL.md\` | ${TODO_PURPOSE} |`)
    const withEvals = renderTable(['SKILL.md'], [], io(['SKILL.md'], ['evals'])).lines
    expect(withEvals.at(-1)).toBe('| `evals/` | Behavioral evals in the agentskills.io format (never packaged) |')
    expect(renderTable(['SKILL.md'], [], disk).lines.join('\n')).not.toContain('evals/')
  })
})

const SCRIPT = join(import.meta.dir, '../scripts/readme-sync.mjs')
const run = (...args: string[]) => Bun.spawnSync(['node', SCRIPT, ...args])
const README = ['# one', '', "## What's in this skill", '', '| Path | Purpose |', '|---|---|', '| [SKILL.md](SKILL.md) | entry |', '| `tests/` | Bun tests and fixtures (never packaged) |', '', '## Behavior', ''].join('\n')

function repo(entry: string[] = ['SKILL.md', 'scripts/a.mjs'], readme = README) {
  const root = mkdtempSync(join(tmpdir(), 'readme-sync-'))
  const dir = join(root, 'skills/one')
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'packages/cli'), { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: one\ndescription: d\n---\n')
  writeFileSync(join(dir, 'scripts/a.mjs'), '// a\n')
  writeFileSync(join(dir, 'README.md'), readme)
  writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ one: entry }))
  return { root, dir }
}
const clean = (root: string) => rmSync(root, { recursive: true, force: true })

describe('readme-sync CLI', () => {
  test('dry run reports the diff, writes nothing, exits 1', () => {
    const { root, dir } = repo()
    const result = run('--dir', root, '--json')
    expect(result.exitCode).toBe(1)
    const parsed = JSON.parse(result.stdout.toString())
    expect(parsed.guard).toBe('readme-sync')
    expect(parsed.skills[0].changed).toBe(true)
    expect(parsed.skills[0].diff).toContain(`+ | [scripts/a.mjs](scripts/a.mjs) | ${TODO_PURPOSE} |`)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(README)
    clean(root)
  })
  test('--write rewrites only the table, then a second --write is a no-op exit 0', () => {
    const { root, dir } = repo()
    expect(run('--dir', root, '--write').exitCode).toBe(0)
    const after = readFileSync(join(dir, 'README.md'), 'utf8')
    expect(after).toContain(`| [scripts/a.mjs](scripts/a.mjs) | ${TODO_PURPOSE} |`)
    expect(after.startsWith('# one\n')).toBe(true)
    expect(after.endsWith('\n## Behavior\n')).toBe(true)
    expect(existsSync(join(dir, 'README.md.readme-sync-tmp'))).toBe(false)
    const second = run('--dir', root, '--write', '--json')
    expect(second.exitCode).toBe(0)
    expect(JSON.parse(second.stdout.toString()).skills[0].changed).toBe(false)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(after)
    clean(root)
  })
  test('an in-sync repo exits 0 in dry run', () => {
    const { root } = repo(['SKILL.md'])
    expect(run('--dir', root).exitCode).toBe(0)
    clean(root)
  })
  test('a symlinked README is refused before any write, exit 2', () => {
    const { root, dir } = repo()
    writeFileSync(join(root, 'real.md'), README)
    rmSync(join(dir, 'README.md'))
    symlinkSync(join(root, 'real.md'), join(dir, 'README.md'))
    const result = run('--dir', root, '--write', '--json')
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.stdout.toString()).errors[0].message).toMatch(/symlink/i)
    expect(readFileSync(join(root, 'real.md'), 'utf8')).toBe(README)
    expect(lstatSync(join(dir, 'README.md')).isSymbolicLink()).toBe(true)
    clean(root)
  })
  test('a README with no table is refused, exit 2', () => {
    const { root } = repo(['SKILL.md'], '# one\n\n## Shape\n\n| Piece | Purpose |\n|---|---|\n| `SKILL.md` | e |\n')
    const result = run('--dir', root, '--json')
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.stdout.toString()).errors[0].message).toMatch(/What's in this skill/)
    clean(root)
  })
  test('an unclassified row stops the whole run and writes nothing, exit 2', () => {
    const { root, dir } = repo(['SKILL.md'], README.replace('| `tests/` |', '| `references/{a,b}.md` | glob |\n| `tests/` |'))
    const before = readFileSync(join(dir, 'README.md'), 'utf8')
    const result = run('--dir', root, '--write', '--json')
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.stdout.toString()).skills[0].unclassified).toEqual(['`references/{a,b}.md`'])
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(before)
    clean(root)
  })
  test('a malformed row (missing its trailing pipe) is unclassified, stops the run, and is not deleted', () => {
    const { root, dir } = repo(['SKILL.md'], README.replace('| `tests/` |', '| [scripts/hand.mjs](scripts/hand.mjs) | hand-written, no trailing pipe\n| `tests/` |'))
    const before = readFileSync(join(dir, 'README.md'), 'utf8')
    const result = run('--dir', root, '--write', '--json')
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.stdout.toString()).skills[0].unclassified[0]).toMatch(/^malformed row: /)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(before)
    clean(root)
  })
  test('usage errors exit 2', () => {
    expect(run('--bogus').exitCode).toBe(2)
  })
  test('syncRepo plans every skill before writing any: one bad skill blocks the good one', () => {
    const { root } = repo()
    const two = join(root, 'skills/two')
    mkdirSync(two, { recursive: true })
    writeFileSync(join(two, 'SKILL.md'), '---\nname: two\ndescription: d\n---\n')
    writeFileSync(join(two, 'README.md'), '# two\n')
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ one: ['SKILL.md', 'scripts/a.mjs'], two: ['SKILL.md'] }))
    const result = syncRepo({ repoRoot: root, write: true })
    expect(result.errors.map((e: { name: string }) => e.name)).toEqual(['two'])
    expect(result.skills.find((s: { name: string }) => s.name === 'one')!.wrote).toBe(false)
    expect(readFileSync(join(root, 'skills/one/README.md'), 'utf8')).toBe(README)
    clean(root)
  })
})

test('the skillify README template is already in sync with the scaffolder default packaging entry', () => {
  // Order mirrors defaultPackagedFiles in skills/repo-tooling/skillify/scripts/scaffold-skill.mjs.
  const entry = ['SKILL.md', 'agents/openai.yaml', 'refresh/REFRESH.md', 'refresh/sources.json']
  const template = readFileSync(join(import.meta.dir, '../../../skills/repo-tooling/skillify/assets/templates/README.md.template'), 'utf8')
  const table = parseSkillTable(template)!
  // The scaffolder writes evals/ (and tests/) beside the packaged files, so the template's disk view has both.
  const { lines, unclassified, todo } = renderTable(entry, table.rows, { fileExists: () => true, dirExists: (rel: string) => rel === 'evals' })
  expect(unclassified).toEqual([])
  expect(todo).toEqual([])
  expect(template.split('\n').slice(table.start, table.end)).toEqual(lines)
})
