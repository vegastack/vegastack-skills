import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { classifyCommand, extractCommand, readPolicy, renderDecision, splitSegments } from '../assets/hooks/ship-guard.mjs'
import { readSyncState, renderContext, sessionMarkerPath, shouldSync, syncTarget, worktreeClaim } from '../assets/hooks/session-start.mjs'
import { HEARTBEAT_REASON, shouldNudge } from '../assets/hooks/stop-heartbeat.mjs'
import { NUDGE_REASON, isDirectional } from '../assets/hooks/decision-nudge.mjs'

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

  test('a wrapper, an env assignment or a git global option cannot walk a guarded command past the guard', () => {
    for (const command of ['git -C /repo push origin main', 'sudo git push --force', 'env FOO=1 gh pr merge 110', 'GIT_DIR=x git tag v1.0.0', 'command npm publish', 'git --no-pager push origin main']) {
      expect(classifyCommand(command, policy).decision, command).toBe('ask')
    }
  })

  test('normalising the prefix does not turn ordinary commands into asks', () => {
    for (const command of ['git -C /repo push origin feat/x', 'env FOO=1 bun run check', 'git -C /repo status']) {
      expect(classifyCommand(command, policy).decision, command).toBe('allow')
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
    // A checkout nested inside another worktree is claimed by the innermost one.
    expect(worktreeClaim('/r/.vegastack/.worktrees/104-epic/.vegastack/.worktrees/110-hooks')).toEqual({ number: 110, slug: 'hooks' })
  })

  test('an empty board says so in one line rather than five empty ones', () => {
    const empty = { repo: 'o/r', board: Object.fromEntries(states.map((s) => [s, []])) }
    expect(renderContext(empty, { cwd: '/repo', states })).toEqual(['vegafactory: nothing on the board needs you.'.replace('vegafactory', 'o/r')])
  })

  test('the session marker lives under the OS temp dir, never in the repo', () => {
    const path = sessionMarkerPath('abc-123', '/tmp')
    expect(path).toBe('/tmp/vsk-session-abc-123')
  })

  test('the sync target comes from the profile knobs, and no knob means no sync', () => {
    const devMd = 'control-room: vegastack/vegafactory-control-room#dev@a1b2c3d\nsync-max-age: 45m\n'
    expect(syncTarget(devMd, '/home/mk')).toEqual({ org: 'vegastack', path: '/home/mk/.vegastack/control-room/vegastack', maxAgeMinutes: 45 })
    expect(syncTarget('## Knobs\nreview: subagent\n', '/home/mk')).toBe(null)
    expect(syncTarget('control-room: none\n', '/home/mk')).toBe(null)
  })

  test('freshness is measured from the last successful fetch, not from a directory mtime', () => {
    const now = Date.parse('2026-09-03T12:00:00Z')
    expect(shouldSync({ lastSyncedAt: '2026-09-03T11:00:00Z', now, maxAgeMinutes: 30 })).toBe(true)
    expect(shouldSync({ lastSyncedAt: '2026-09-03T11:45:00Z', now, maxAgeMinutes: 30 })).toBe(false)
    expect(shouldSync({ lastSyncedAt: null, now, maxAgeMinutes: 30 })).toBe(true)
  })

  test('the state file supplies the org path and its last fetch; a broken one is ignored', () => {
    const text = JSON.stringify({ schemaVersion: 1, controlRooms: { vegastack: { path: '/elsewhere/cr', lastSyncedAt: '2026-09-03T11:00:00Z' } } })
    expect(readSyncState(text, 'vegastack')).toEqual({ lastSyncedAt: '2026-09-03T11:00:00Z', path: '/elsewhere/cr' })
    expect(readSyncState(text, 'acme')).toBe(null)
    expect(readSyncState('{ not json', 'vegastack')).toBe(null)
    expect(readSyncState(null, 'vegastack')).toBe(null)
  })

  test('a hook failure never blocks the session: every helper is total', () => {
    expect(syncTarget('', '/home/mk')).toBe(null)
    expect(shouldSync({ lastSyncedAt: 'not-a-date', now: Date.now(), maxAgeMinutes: 30 })).toBe(true)
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

describe('decision nudge', () => {
  test('matches the directional vocabulary the shell recipe matched', () => {
    for (const message of ['We decided to use Postgres instead of SQLite.', 'Chose changesets', 'from now on we standardise on Bun', 'switched to rebase merges', 'this is our convention now']) {
      expect(isDirectional(message)).toBe(true)
    }
  })

  test('stays quiet on an ordinary sign-off', () => {
    for (const message of ['Fixed the failing test and pushed.', 'All twelve tests pass.', '']) {
      expect(isDirectional(message)).toBe(false)
    }
  })

  test('the reason still names the Decisions test and asks for one dated line', () => {
    expect(NUDGE_REASON).toContain('the Decisions test in .vegastack/dev.md')
    expect(NUDGE_REASON).toContain('one dated register line')
  })

  test('nudges once per session and stays silent on the second stop', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vsk-nudge-'))
    const script = join(import.meta.dir, '..', 'assets/hooks/decision-nudge.mjs')
    const payload = '{"session_id":"s1","stop_hook_active":false,"last_assistant_message":"We decided to use Postgres instead of SQLite."}'
    const env = { ...process.env, TMPDIR: dir }
    const first = Bun.spawnSync(['node', script, '--harness', 'claude'], { stdin: new TextEncoder().encode(payload), env })
    expect(first.stdout.toString()).toContain('"decision":"block"')
    const second = Bun.spawnSync(['node', script, '--harness', 'claude'], { stdin: new TextEncoder().encode(payload), env })
    expect(second.stdout.toString().trim()).toBe('')
  })
})

describe('this repo runs the hooks package it ships', () => {
  const repoRoot = resolve(import.meta.dir, '../../../..')
  const hooks = ['ship-guard.mjs', 'session-start.mjs', 'stop-heartbeat.mjs', 'decision-nudge.mjs']

  test('every installed hook copy is byte-identical to its asset', () => {
    for (const file of hooks) {
      const asset = readFileSync(join(repoRoot, 'skills/dev/dev-setup/assets/hooks', file), 'utf8')
      const installed = readFileSync(join(repoRoot, '.vegastack/hooks', file), 'utf8')
      expect(installed).toBe(asset)
    }
  })

  test('the committed Codex wiring names all four hooks on their events', () => {
    const wiring = JSON.parse(readFileSync(join(repoRoot, '.codex/hooks.json'), 'utf8'))
    expect(wiring.hooks.PreToolUse[0].hooks[0].command).toContain('ship-guard.mjs --harness codex')
    expect(wiring.hooks.SessionStart[0].hooks[0].command).toContain('session-start.mjs --harness codex')
    expect(wiring.hooks.Stop[0].hooks.map((h: { command: string }) => h.command).join(' ')).toContain('stop-heartbeat.mjs')
    expect(wiring.hooks.Stop[0].hooks.map((h: { command: string }) => h.command).join(' ')).toContain('decision-nudge.mjs')
  })

  test("the guard asks on this repo's real shipping commands and allows its ordinary ones", () => {
    const script = join(repoRoot, '.vegastack/hooks/ship-guard.mjs')
    const devMd = join(repoRoot, '.vegastack/dev.md')
    for (const command of ['gh pr merge 110 --rebase', 'git push origin main', 'git tag v0.19.0', 'git push origin v0.19.0', 'git push --force']) {
      expect(Bun.spawnSync(['node', script, '--check', '--command', command, '--dev-md', devMd, '--json']).exitCode).toBe(2)
    }
    for (const command of ['bun run check', 'bun run build', 'git push origin feat/104-factory-runtime']) {
      expect(Bun.spawnSync(['node', script, '--check', '--command', command, '--dev-md', devMd, '--json']).exitCode).toBe(0)
    }
  })
})
