import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyCommand, extractCommand, readPolicy, renderDecision, splitSegments } from '../assets/hooks/ship-guard.mjs'
import { renderContext, sessionMarkerPath, shouldSync, worktreeClaim } from '../assets/hooks/session-start.mjs'
import { HEARTBEAT_REASON, shouldNudge } from '../assets/hooks/stop-heartbeat.mjs'

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

describe('ship-guard harness I/O', () => {
  test('reads the command from each harness payload shape', () => {
    expect(extractCommand({ tool_name: 'Bash', tool_input: { command: 'gh pr merge 12' } }, 'claude')).toBe('gh pr merge 12')
    expect(extractCommand({ tool_input: { command: ['bash', '-lc', 'npm publish'] } }, 'codex')).toBe('bash -lc npm publish')
    expect(extractCommand({ tool_input: 'git tag v1' }, 'codex')).toBe('git tag v1')
  })

  test('a payload with no shell command is not in any guarded family', () => {
    expect(extractCommand({ tool_name: 'Read', tool_input: { file_path: '/x' } }, 'claude')).toBe(null)
  })

  test('Claude gets permissionDecision ask, Codex gets a block with the run-it-by-hand reason', () => {
    const asked = { decision: 'ask', reason: "gh pr merge needs the operator's word — run it by hand" }
    const claude = JSON.parse(renderDecision(asked, 'claude'))
    expect(claude.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(claude.hookSpecificOutput.permissionDecision).toBe('ask')
    expect(claude.hookSpecificOutput.permissionDecisionReason).toContain("needs the operator's word")
    const codex = JSON.parse(renderDecision(asked, 'codex'))
    expect(codex).toEqual({ decision: 'block', reason: "gh pr merge needs the operator's word — run it by hand" })
  })

  test('an allow prints nothing on either harness', () => {
    expect(renderDecision({ decision: 'allow', reason: null }, 'claude')).toBe('')
    expect(renderDecision({ decision: 'allow', reason: null }, 'codex')).toBe('')
  })

  test('an unknown or missing harness is a fault the guard refuses to pass', () => {
    const out = JSON.parse(renderDecision({ decision: 'allow', reason: null }, 'unset'))
    expect(out.decision).toBe('block')
    expect(out.reason).toContain('--harness')
  })

  test('--check exits 0 on an allowed command and 2 on one needing the word', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vsk-shipguard-'))
    const devMd = join(dir, 'dev.md')
    writeFileSync(devMd, DEV_MD)
    const script = join(import.meta.dir, '..', 'assets/hooks/ship-guard.mjs')
    const ok = Bun.spawnSync(['node', script, '--check', '--command', 'bun run check', '--dev-md', devMd, '--json'])
    expect(ok.exitCode).toBe(0)
    const blocked = Bun.spawnSync(['node', script, '--check', '--command', 'gh pr merge 12', '--dev-md', devMd, '--json'])
    expect(blocked.exitCode).toBe(2)
    expect(JSON.parse(blocked.stdout.toString()).decision).toBe('ask')
  })

  test('unparseable stdin resolves to ask, never allow', () => {
    const script = join(import.meta.dir, '..', 'assets/hooks/ship-guard.mjs')
    const run = Bun.spawnSync(['node', script, '--harness', 'claude'], { stdin: new TextEncoder().encode('not json') })
    expect(run.exitCode).toBe(0)
    expect(JSON.parse(run.stdout.toString()).hookSpecificOutput.permissionDecision).toBe('ask')
  })
})

describe('session-start context', () => {
  const status = {
    repo: 'vegastack/vegafactory',
    board: {
      'needs-operator': [{ number: 91, title: 'plan approval', ageDays: 2 }, { number: 88, title: 'brief question', ageDays: 4 }],
      'needs-plan': [],
      ready: [{ number: 110, title: 'hooks package', ageDays: 0 }],
      working: [{ number: 106, title: 'worktrees', ageDays: 1, possiblyOrphaned: true }],
      'for-operator': [{ number: 104, title: 'epic', ageDays: 1 }],
    },
  }
  const states = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator']

  test('renders at most five lines and leads with what needs the operator', () => {
    const lines = renderContext(status, { cwd: '/repo', states })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThanOrEqual(5)
    expect(lines[0]).toContain('3 need you')
    expect(lines.join('\n')).toContain('#91')
    expect(lines.join('\n')).toContain('possibly orphaned')
  })

  test('names the worktree claim when the session is inside one', () => {
    const lines = renderContext(status, { cwd: '/repo/.vegastack/.worktrees/106-worktrees/skills', states })
    expect(lines.length).toBeLessThanOrEqual(5)
    expect(lines.join('\n')).toContain('this checkout is worktree 106-worktrees, state working')
  })

  test('recognises a worktree path and refuses everything else', () => {
    expect(worktreeClaim('/r/.vegastack/.worktrees/110-hooks-package')).toEqual({ number: 110, slug: 'hooks-package' })
    expect(worktreeClaim('/r/.vegastack/.worktrees/110-hooks-package/skills/x')).toEqual({ number: 110, slug: 'hooks-package' })
    expect(worktreeClaim('/r/packages/cli')).toBe(null)
    expect(worktreeClaim('/r/.vegastack/.worktrees/scratch')).toBe(null)
  })

  test('an empty board says so in one line rather than five empty ones', () => {
    const empty = { repo: 'o/r', board: Object.fromEntries(states.map((s) => [s, []])) }
    expect(renderContext(empty, { cwd: '/repo', states })).toEqual(['vegafactory: nothing on the board needs you.'.replace('vegafactory', 'o/r')])
  })

  test('the session marker lives under the OS temp dir, never in the repo', () => {
    const path = sessionMarkerPath('abc-123', '/tmp')
    expect(path).toBe('/tmp/vsk-session-abc-123')
  })

  test('the control-room sync fires only for an existing clone past the max age', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vsk-cr-'))
    mkdirSync(join(dir, 'org'))
    const now = Date.now()
    utimesSync(join(dir, 'org'), new Date(now - 45 * 60_000), new Date(now - 45 * 60_000))
    expect(shouldSync(join(dir, 'org'), now, 30)).toBe(true)
    expect(shouldSync(join(dir, 'org'), now, 60)).toBe(false)
    expect(shouldSync(join(dir, 'missing'), now, 30)).toBe(false)
  })
})

describe('stop heartbeat', () => {
  const base = {
    stopHookActive: false,
    worktree: { number: 106, slug: 'worktrees' },
    issueState: 'working',
    ledgerUpdatedAt: '2026-09-03T09:00:00Z',
    sessionStartedAt: '2026-09-03T10:00:00Z',
    alreadyNudged: false,
  }

  test('nudges when the ledger predates the session start', () => {
    expect(shouldNudge(base)).toEqual({ nudge: true, why: 'ledger untouched this session' })
  })

  test('stays silent when the ledger was written during the session', () => {
    expect(shouldNudge({ ...base, ledgerUpdatedAt: '2026-09-03T10:30:00Z' }).nudge).toBe(false)
  })

  test('stays silent outside a worktree, off a working issue, when already nudged, and when re-entered', () => {
    expect(shouldNudge({ ...base, worktree: null }).nudge).toBe(false)
    expect(shouldNudge({ ...base, issueState: 'for-operator' }).nudge).toBe(false)
    expect(shouldNudge({ ...base, alreadyNudged: true }).nudge).toBe(false)
    expect(shouldNudge({ ...base, stopHookActive: true }).nudge).toBe(false)
  })

  test('nudges when the issue is working and no ledger comment exists at all', () => {
    expect(shouldNudge({ ...base, ledgerUpdatedAt: null })).toEqual({ nudge: true, why: 'no ledger comment yet' })
  })

  test('stays silent when the session start is unknown, rather than nudging on every stop', () => {
    expect(shouldNudge({ ...base, sessionStartedAt: null }).nudge).toBe(false)
  })

  test('the reason is a plain checkpoint sentence and never mentions a budget', () => {
    expect(HEARTBEAT_REASON).toBe('checkpoint the ledger before stopping')
    expect(HEARTBEAT_REASON).not.toMatch(/context|budget|token|remaining/i)
  })
})
