import { describe, expect, test } from 'bun:test'
import { classifyCommand, readPolicy, splitSegments } from '../assets/hooks/ship-guard.mjs'

const DEV_MD = [
  'repo: vegastack/vegafactory · default branch main',
  '',
  '## Knobs',
  'gates: 3                    # 3 = approve/PR/merge',
  '',
  '## Ship — what happens after merge, in order',
  '- auto: bunx changeset version && bun install',
  '- ask: merge the release PR',
  '',
  '## Environments',
  '- preview: auto — wrangler deploy --env preview',
  '- staging: auto — wrangler deploy --env staging',
  '- production: ask — wrangler deploy --env production',
  '- npm registry via tag-triggered trusted publishing',
].join('\n')

describe('ship-guard policy', () => {
  const policy = readPolicy(DEV_MD)

  test('reads the default branch, the gates knob and only the grammar-shaped Environments lines', () => {
    expect(policy.defaultBranch).toBe('main')
    expect(policy.gates).toBe(3)
    expect(policy.environments.map((e) => e.target)).toEqual(['preview', 'staging', 'production'])
    expect(policy.environments[0]).toEqual({ target: 'preview', policy: 'auto', pattern: 'wrangler deploy --env preview' })
  })

  test('splits compound commands so a guarded segment cannot hide behind a benign one', () => {
    expect(splitSegments('echo hi && gh pr merge 12 --squash')).toEqual(['echo hi', 'gh pr merge 12 --squash'])
    expect(splitSegments('bun run check; git tag v1.0.0')).toEqual(['bun run check', 'git tag v1.0.0'])
  })

  test('allows a command in no guarded family', () => {
    expect(classifyCommand('bun run check', policy).decision).toBe('allow')
    expect(classifyCommand('git push origin feat/110-hooks', policy).decision).toBe('allow')
  })

  test('allows an auto environment and asks on an ask environment, longest pattern winning', () => {
    expect(classifyCommand('wrangler deploy --env preview', policy).decision).toBe('allow')
    expect(classifyCommand('wrangler deploy --env staging', policy).decision).toBe('allow')
    expect(classifyCommand('wrangler deploy --env production', policy).decision).toBe('ask')
  })

  test('asks on the default-branch operations under gates 3', () => {
    for (const command of ['gh pr merge 12 --squash', 'git push origin main', 'git tag v0.19.0', 'npm publish']) {
      expect(classifyCommand(command, policy).decision).toBe('ask')
    }
  })

  test('asks on the always-ask list whatever the knobs say', () => {
    for (const command of ['git push --force', 'git reset --hard HEAD~1', 'git branch -D feat/x', 'git worktree remove --force .vegastack/.worktrees/110-hooks', 'git commit --no-verify -m x']) {
      expect(classifyCommand(command, policy).decision).toBe('ask')
    }
  })

  test('asks on a deploy or publish command that matches no policy line — fail closed', () => {
    const result = classifyCommand('flyctl deploy --app acme', policy)
    expect(result.decision).toBe('ask')
    expect(result.rule).toBe('unclassified-in-family')
  })

  test('asks when dev.md is missing or unreadable', () => {
    expect(classifyCommand('gh pr merge 12', readPolicy('')).decision).toBe('ask')
  })

  test('under gates 1 the merge and the default-branch push are one ask, not two', () => {
    const gates1 = readPolicy(DEV_MD.replace('gates: 3', 'gates: 1'))
    expect(classifyCommand('gh pr merge 12', gates1).rule).toBe('default-branch-ship')
    expect(classifyCommand('git push origin main', gates1).rule).toBe('default-branch-ship')
  })
})
