import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { codexTrustToml, createWorktree, restoreWorktree } from '../scripts/worktree.mjs'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'vf-wt-'))
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.email', 'a@b.c')
  git(root, 'config', 'user.name', 'a')
  writeFileSync(join(root, 'README.md'), '# r\n')
  writeFileSync(join(root, '.env'), 'SECRET=1\n')
  git(root, 'add', 'README.md')
  git(root, 'commit', '-m', 'init')
  return root
}
const devMd = 'commands: check `true` · setup `sh -c "echo setup-ran > setup.log"`\nworktree-include: .env\n'

describe('createWorktree', () => {
  test('dry run reports the actions and writes nothing', () => {
    const root = repo()
    const r = createWorktree({ repoRoot: root, issue: 106, slug: 'x', type: 'feat', base: 'main', devMd, home: root, write: false })
    expect(r.blocks).toEqual([])
    expect(r.path).toBe(join(root, '.vegastack/.worktrees/106-x'))
    expect(r.branch).toBe('feat/106-x')
    expect(existsSync(r.path)).toBe(false)
  })
  test('--write adds the worktree, copies the include list, and runs setup', () => {
    const root = repo()
    const r = createWorktree({ repoRoot: root, issue: 106, slug: 'x', type: 'feat', base: 'main', devMd, home: root, write: true })
    expect(r.blocks).toEqual([])
    expect(git(r.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('feat/106-x')
    expect(readFileSync(join(r.path, '.env'), 'utf8')).toBe('SECRET=1\n')
    expect(readFileSync(join(r.path, 'setup.log'), 'utf8').trim()).toBe('setup-ran')
    expect(git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')
  })
  test('a child branches from the parent branch inside the parent worktree', () => {
    const root = repo()
    const parent = createWorktree({ repoRoot: root, issue: 104, slug: 'epic', type: 'feat', base: 'main', devMd, home: root, write: true })
    const child = createWorktree({ repoRoot: root, issue: 106, slug: 'x', type: 'feat', base: 'main', parent: parent.branch, devMd, home: root, write: true })
    expect(child.path).toBe(parent.path)
    expect(child.branch).toBe('feat/106-x')
    expect(git(parent.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('feat/106-x')
  })
  test('two issues in one clone get two independent worktrees and main stays put', () => {
    const root = repo()
    const a = createWorktree({ repoRoot: root, issue: 106, slug: 'a', type: 'feat', base: 'main', devMd, home: root, write: true })
    const b = createWorktree({ repoRoot: root, issue: 107, slug: 'b', type: 'feat', base: 'main', devMd, home: root, write: true })
    expect(a.path).not.toBe(b.path)
    expect(git(a.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('feat/106-a')
    expect(git(b.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('feat/107-b')
    expect(git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')
  })
  test('a symlinked .worktrees parent is refused', () => {
    const root = repo()
    const elsewhere = mkdtempSync(join(tmpdir(), 'vf-elsewhere-'))
    mkdirSync(join(root, '.vegastack'))
    symlinkSync(elsewhere, join(root, '.vegastack/.worktrees'))
    const r = createWorktree({ repoRoot: root, issue: 106, slug: 'x', type: 'feat', base: 'main', devMd, home: root, write: true })
    expect(r.blocks[0]).toContain('symlink')
  })
})

describe('restoreWorktree', () => {
  test('a branch whose directory is gone is re-added at its path with the include list', () => {
    const root = repo()
    const created = createWorktree({ repoRoot: root, issue: 106, slug: 'x', type: 'feat', base: 'main', devMd, home: root, write: true })
    git(root, 'worktree', 'remove', '--force', created.path)
    expect(existsSync(created.path)).toBe(false)
    const r = restoreWorktree({ repoRoot: root, issue: 106, slug: 'x', type: 'feat', base: 'main', devMd, home: root, write: true })
    expect(r.blocks).toEqual([])
    expect(git(r.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('feat/106-x')
    expect(readFileSync(join(r.path, '.env'), 'utf8')).toBe('SECRET=1\n')
  })
  test('restoring a branch that does not exist blocks rather than inventing one', () => {
    const root = repo()
    const r = restoreWorktree({ repoRoot: root, issue: 999, slug: 'nope', type: 'feat', base: 'main', devMd, home: root, write: true })
    expect(r.blocks[0]).toContain('no branch')
  })
})

describe('codexTrustToml', () => {
  test('appends the trust entry once and is idempotent', () => {
    const first = codexTrustToml('model = "gpt-5.6"\n', '/r/.vegastack/.worktrees/106-x')
    expect(first.changed).toBe(true)
    expect(first.text).toContain('[projects."/r/.vegastack/.worktrees/106-x"]')
    expect(first.text).toContain('trust_level = "trusted"')
    expect(codexTrustToml(first.text, '/r/.vegastack/.worktrees/106-x').changed).toBe(false)
  })
})
