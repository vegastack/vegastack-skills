import { describe, expect, test } from 'bun:test'
import { classifyCell, parseSkillTable, renderTable, TABLE_HEADER, TODO_PURPOSE, INSTALLED_COPY_PURPOSE } from '../scripts/readme-sync.mjs'

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
