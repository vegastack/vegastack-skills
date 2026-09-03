import { describe, expect, test } from 'bun:test'
import { branchName, classifyWorktree, parseWorktreeList, slugify, worktreeName, worktreePath } from '../scripts/worktree.mjs'

const base = { dirExists: true, branchExists: true, locked: false, issueState: 'open' as const, mergedIntoDefault: false }

describe('naming', () => {
  test('slug is lowercase, dash-joined and capped', () => {
    expect(slugify('One feature, ONE worktree!')).toBe('one-feature-one-worktree')
    expect(slugify('x'.repeat(80)).length).toBe(40)
  })
  test('an issue number leads the directory and the branch', () => {
    expect(worktreeName(106, 'one-worktree')).toBe('106-one-worktree')
    expect(worktreePath('/r', worktreeName(106, 'one-worktree'))).toBe('/r/.vegastack/.worktrees/106-one-worktree')
    expect(branchName('feat', 106, 'one-worktree')).toBe('feat/106-one-worktree')
    expect(branchName('chore', null, 'release-0-19-0')).toBe('chore/release-0-19-0')
    expect(worktreeName(null, 'release-0-19-0')).toBe('release-0-19-0')
  })
})

describe('parseWorktreeList', () => {
  test('reads path, branch, lock and detached HEAD from porcelain', () => {
    const out = [
      'worktree /r', 'HEAD aaaa111', 'branch refs/heads/main', '',
      'worktree /r/.vegastack/.worktrees/106-x', 'HEAD bbbb222', 'branch refs/heads/feat/106-x', 'locked', '',
      'worktree /r/.vegastack/.worktrees/gone', 'HEAD cccc333', 'detached', 'prunable gitdir file points to non-existent location', '',
    ].join('\n')
    const entries = parseWorktreeList(out)
    expect(entries.map((e) => e.branch)).toEqual(['main', 'feat/106-x', null])
    expect(entries[1].locked).toBe(true)
    expect(entries[2].prunable).toBe(true)
    expect(entries[2].detached).toBe(true)
  })
})

describe('classifyWorktree', () => {
  test('each lifecycle state, in precedence order', () => {
    expect(classifyWorktree({ ...base, branchExists: false })).toBe('orphan-dir')
    expect(classifyWorktree({ ...base, dirExists: false })).toBe('branch-only')
    expect(classifyWorktree({ ...base, locked: true, mergedIntoDefault: true })).toBe('active')
    expect(classifyWorktree({ ...base, mergedIntoDefault: true, issueState: 'closed' })).toBe('merged')
    expect(classifyWorktree({ ...base, issueState: 'closed' })).toBe('abandoned')
    expect(classifyWorktree(base)).toBe('parked')
  })
})
