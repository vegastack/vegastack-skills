import { beforeEach, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { classifyCommand, extractCommand, parseCommand, policyPath, readPolicyFile, renderDecision, repoFromRemote, splitSegments } from '../assets/hooks/ship-guard.mjs'
import { readSyncState, renderContext, sessionMarkerPath, shouldSync, syncTarget, worktreeClaim } from '../assets/hooks/session-start.mjs'
import { HEARTBEAT_REASON, shouldNudge } from '../assets/hooks/stop-heartbeat.mjs'
import { NUDGE_REASON, isDirectional } from '../assets/hooks/decision-nudge.mjs'

// The compiled policy the guard reads. dev.md is never handed to the guard: the compiler
// (scripts/ship-policy.mjs) writes this shape to ~/.vegastack/guard/<owner>__<repo>.json.
const POLICY = {
  schemaVersion: 1,
  repo: 'acme/app',
  defaultBranch: 'main',
  gates: 3,
  environments: [
    { target: 'preview', policy: 'auto', pattern: 'wrangler deploy --env preview' },
    { target: 'staging', policy: 'auto', pattern: 'wrangler deploy --env staging' },
    { target: 'production', policy: 'ask', pattern: 'wrangler deploy --env production' },
  ],
  shipAsk: ['bun run docs:publish'],
}
const policy = readPolicyFile(JSON.stringify(POLICY), 'acme/app')
const decide = (command: string, p: unknown = policy) => classifyCommand(command, p)

describe('ship-guard policy file', () => {
  test('a well-formed policy for this repo is read whole', () => {
    expect(policy.missing).toBeUndefined()
    expect(policy.defaultBranch).toBe('main')
    expect(policy.gates).toBe(3)
    expect(policy.environments.map((e: { target: string }) => e.target)).toEqual(['preview', 'staging', 'production'])
    expect(policy.shipAsk).toEqual(['bun run docs:publish'])
  })

  test('a missing, malformed, mis-versioned or other-repo policy fails closed: guarded commands ask and name the sync command', () => {
    const broken = [
      readPolicyFile(null, 'acme/app'),
      readPolicyFile('{ not json', 'acme/app'),
      readPolicyFile(JSON.stringify({ ...POLICY, schemaVersion: 2 }), 'acme/app'),
      readPolicyFile(JSON.stringify({ ...POLICY, repo: 'acme/other' }), 'acme/app'),
      readPolicyFile(JSON.stringify(POLICY), null),
    ]
    for (const bad of broken) {
      expect(bad.missing).toBeTruthy()
      for (const command of ['gh pr merge 12', 'git push origin main', 'git push origin feat/x', 'wrangler deploy --env preview', 'npm publish', 'git tag v1']) {
        const result = decide(command, bad)
        expect(result.decision, command).toBe('ask')
        expect(result.rule, command).toBe('no-policy')
        expect(result.reason, command).toContain('vegafactory guard sync')
      }
      expect(decide('bun run check', bad).decision).toBe('allow')
      expect(decide('git status', bad).decision).toBe('allow')
    }
  })

  test('the policy path is outside every worktree and keyed by the origin remote', () => {
    expect(repoFromRemote('git@github.com:acme/app.git')).toBe('acme/app')
    expect(repoFromRemote('https://github.com/acme/app.git')).toBe('acme/app')
    expect(repoFromRemote('https://github.com/acme/app')).toBe('acme/app')
    expect(repoFromRemote('ssh://git@github.com/acme/app.git')).toBe('acme/app')
    expect(repoFromRemote('')).toBe(null)
    expect(repoFromRemote('not a url')).toBe(null)
    expect(policyPath('/home/mk', 'acme/app')).toBe('/home/mk/.vegastack/guard/acme__app.json')
    expect(policyPath('/home/mk', 'acme/we ird')).toBe('/home/mk/.vegastack/guard/acme__we-ird.json')
  })

  test('touching the policy store is itself an always-ask, however the path is spelled', () => {
    for (const command of [
      'echo x > ~/.vegastack/guard/acme__app.json',
      'rm -rf ~/.vegastack/guard',
      'sed -i s/ask/auto/ "$HOME/.vegastack/guard/acme__app.json"',
      "tee /Users/mk/.vegastack/guard/acme__app.json <<< '{}'",
      'mv /tmp/p.json ~/.vegastack/gu""ard/acme__app.json',
      'vim ~/.vegastack/guard/acme__app.json',
    ]) {
      const result = decide(command)
      expect(result.decision, command).toBe('ask')
      expect(result.rule, command).toBe('always-ask')
    }
  })
})

describe('ship-guard command parsing', () => {
  test('splits on every operator, including a single & and a newline', () => {
    expect(splitSegments('echo hi && gh pr merge 12 --squash')).toEqual(['echo hi', 'gh pr merge 12 --squash'])
    expect(splitSegments('bun run check; git tag v1.0.0')).toEqual(['bun run check', 'git tag v1.0.0'])
    expect(splitSegments('echo x & gh pr merge 12')).toEqual(['echo x', 'gh pr merge 12'])
    expect(splitSegments('a | b || c\nd')).toEqual(['a', 'b', 'c', 'd'])
  })

  test('quotes, escapes and substitutions are read as a shell would read them', () => {
    expect(parseCommand('git push origin "main"')[0].words).toEqual(['git', 'push', 'origin', 'main'])
    expect(parseCommand("git push origin 'main'")[0].words).toEqual(['git', 'push', 'origin', 'main'])
    expect(parseCommand('git push origin ma\\in')[0].words).toEqual(['git', 'push', 'origin', 'main'])
    expect(parseCommand('echo $(npm publish)').map((s: { words: string[] }) => s.words)).toEqual([['echo'], ['npm', 'publish']])
    expect(parseCommand('echo `npm publish`').map((s: { words: string[] }) => s.words)).toEqual([['echo'], ['npm', 'publish']])
    expect(parseCommand('(git push origin main)')[0].words).toEqual(['git', 'push', 'origin', 'main'])
    expect(parseCommand('{ git push origin main; }')[0].words).toEqual(['git', 'push', 'origin', 'main'])
  })

  test('a redirection target stays visible as text but never becomes an argument', () => {
    const segment = parseCommand('git push origin feat/x > out.log 2>&1')[0]
    expect(segment.words).toEqual(['git', 'push', 'origin', 'feat/x'])
    expect(segment.redirects).toEqual(['out.log'])
  })
})

describe('ship-guard decisions', () => {
  test('allows a command in no guarded family', () => {
    for (const command of ['bun run check', 'git push origin feat/110-hooks', 'git push -u origin feat/x', 'git push origin HEAD:feat/x', 'git push origin feat/x:feat/x', 'git push --force-with-lease origin feat/x', 'git status', 'git -C /repo push origin feat/x', 'env FOO=1 bun run check', 'git commit -m "deploy notes"']) {
      expect(decide(command).decision, command).toBe('allow')
    }
  })

  test('allows an auto environment and asks on an ask environment, longest pattern winning, and says which line allowed it', () => {
    expect(decide('wrangler deploy --env preview')).toEqual({ decision: 'allow', reason: null, rule: 'environment:preview' })
    expect(decide('wrangler deploy --env staging').decision).toBe('allow')
    expect(decide('wrangler deploy --env production').decision).toBe('ask')
    expect(decide('echo start && wrangler deploy --env preview').rule).toBe('environment:preview')
  })

  test('asks on the default-branch operations under gates 3', () => {
    for (const command of ['gh pr merge 12 --squash', 'git push origin main', 'git tag v0.19.0', 'npm publish', 'bun run docs:publish']) {
      expect(decide(command).decision, command).toBe('ask')
    }
  })

  test('every spelling of a push to the default branch asks', () => {
    for (const command of [
      'git push origin main:main', 'git push origin HEAD:main', 'git push origin refs/heads/main', 'git push origin HEAD:refs/heads/main',
      'git push --set-upstream origin main:main', 'git push origin "main"', "git push origin 'main'",
      'git push origin feature main', 'git push -o ci.skip origin main', 'git push origin feat/x:main', 'git push --all origin', 'git push --mirror origin',
    ]) {
      const result = decide(command)
      expect(result.decision, command).toBe('ask')
      expect(result.rule, command).toBe('default-branch')
    }
  })

  test('a push whose destination the guard cannot read asks rather than guessing', () => {
    for (const command of ['git push', 'git push origin', 'git push origin HEAD', 'git push origin @']) {
      expect(decide(command).decision, command).toBe('ask')
      expect(decide(command).rule, command).toBe('unclassified-in-family')
    }
  })

  test('pushing tags is a release, deleting a remote branch is a deletion — both ask', () => {
    for (const command of ['git push origin refs/tags/v1.2.3', 'git push --tags origin', 'git push origin :refs/heads/main', 'git push origin :feat/x', 'git push --delete origin feat/x', 'git push -d origin feat/x']) {
      expect(decide(command).decision, command).toBe('ask')
    }
  })

  test('asks on the always-ask list whatever the knobs say, with the flag in any position', () => {
    for (const command of [
      'git push --force', 'git push origin feat/x --force', 'git push origin feat/x -f', 'git push -fu origin feat/x', 'git push origin +feat/x', 'git push origin +main',
      'git reset --hard HEAD~1', 'git reset -q --hard', 'git branch -D feat/x', 'git branch --force -D feat/x', 'git branch -d feat/x', 'git branch --delete feat/x',
      'git worktree remove --force .vegastack/.worktrees/110-hooks', 'git worktree remove .vegastack/.worktrees/x --force', 'git worktree remove -f x',
      'git commit --no-verify -m x', 'git commit -m x --no-verify',
    ]) {
      const result = decide(command)
      expect(result.decision, command).toBe('ask')
      expect(result.rule, command).toBe('always-ask')
    }
  })

  test('a wrapper, a path, an escape, quoting or a nested shell cannot walk a guarded command past the guard', () => {
    for (const command of [
      'sudo git push --force', 'sudo -u root git push origin main', 'env FOO=1 gh pr merge 110', 'env -i gh pr merge 12', 'GIT_DIR=x git tag v1.0.0',
      'command npm publish', 'nice -n 5 git push origin main', 'time gh pr merge 12', 'timeout 30 git push origin main', 'xargs -I{} git push origin main',
      '/usr/bin/git push origin main', '\\gh pr merge 1', '"git" push origin main', 'git -C /repo push origin main', 'git --no-pager push origin main',
      'git -c alias.ship=push ship origin main', 'gh -R o/r pr merge 12', 'gh --repo o/r pr merge 12',
      'sh -c "npm publish"', 'bash -lc "gh pr merge 12"', 'bash -c "git push origin main"', 'zsh -c \'git tag v1\'', 'sh -c "echo hi; npm publish"',
      'echo $(npm publish)', 'echo `gh pr merge 1`', '(git push origin main)', 'echo x & gh pr merge 12', 'echo x & npm publish',
      'bash -lc "wrangler deploy --env production"',
    ]) {
      expect(decide(command).decision, command).toBe('ask')
    }
  })

  test('text handed to another interpreter is probed for the guarded verbs and asks on a hit', () => {
    for (const command of [
      'node -e "require(\'child_process\').spawnSync(\'sh\', [\'-c\', \'gh pr merge 12\'])"',
      'python3 -c "import os; os.system(\'git push origin main\')"',
      'ssh box "npm publish"',
    ]) {
      const result = decide(command)
      expect(result.decision, command).toBe('ask')
      expect(result.rule, command).toBe('unclassified-in-family')
    }
    expect(decide('node -e "console.log(1)"').decision).toBe('allow')
  })

  test('a merge through the API asks like a merge through the CLI', () => {
    expect(decide('gh api --method PUT repos/o/r/pulls/12/merge').decision).toBe('ask')
    expect(decide('gh api -X PUT /repos/o/r/pulls/12/merge').decision).toBe('ask')
    expect(decide('gh release create v1.0.0').decision).toBe('ask')
    expect(decide('gh api repos/o/r/pulls/12').decision).toBe('allow')
  })

  test('an unknown git alias with push-shaped arguments asks rather than trusting the alias', () => {
    expect(decide('git ship origin main').decision).toBe('ask')
  })

  test('asks on a deploy or publish command that matches no policy line — fail closed', () => {
    for (const command of ['flyctl deploy --app acme', 'bun run deploy:production', 'gh release create v2']) {
      const result = decide(command)
      expect(result.decision, command).toBe('ask')
      expect(result.rule, command).toBe('unclassified-in-family')
    }
  })

  test('under gates 1 the merge and the default-branch push are one ask, not two', () => {
    const gates1 = readPolicyFile(JSON.stringify({ ...POLICY, gates: 1 }), 'acme/app')
    expect(decide('gh pr merge 12', gates1).rule).toBe('default-branch-ship')
    expect(decide('git push origin main', gates1).rule).toBe('default-branch-ship')
  })
})

describe('ship-guard harness I/O', () => {
  const script = join(import.meta.dir, '..', 'assets/hooks/ship-guard.mjs')

  test('reads the command from each harness payload shape', () => {
    expect(extractCommand({ tool_name: 'Bash', tool_input: { command: 'gh pr merge 12' } })).toBe('gh pr merge 12')
    expect(extractCommand({ tool_input: { command: ['bash', '-lc', 'npm publish'] } })).toBe("bash -lc 'npm publish'")
    expect(extractCommand({ tool_input: 'git tag v1' })).toBe('git tag v1')
  })

  test('a payload with no shell command is not in any guarded family', () => {
    expect(extractCommand({ tool_name: 'Read', tool_input: { file_path: '/x' } })).toBe(null)
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
    const policyFile = join(dir, 'policy.json')
    writeFileSync(policyFile, JSON.stringify(POLICY))
    const ok = Bun.spawnSync(['node', script, '--check', '--command', 'bun run check', '--policy', policyFile, '--repo', 'acme/app', '--json'])
    expect(ok.exitCode).toBe(0)
    const blocked = Bun.spawnSync(['node', script, '--check', '--command', 'gh pr merge 12', '--policy', policyFile, '--repo', 'acme/app', '--json'])
    expect(blocked.exitCode).toBe(2)
    expect(JSON.parse(blocked.stdout.toString()).decision).toBe('ask')
  })

  // The end-to-end shape: the hook finds its policy from the origin remote and the home directory,
  // never from anything inside the checkout.
  function repoWithOrigin(): string {
    const repo = mkdtempSync(join(tmpdir(), 'vsk-guard-repo-'))
    Bun.spawnSync(['git', 'init', '-q', repo])
    Bun.spawnSync(['git', '-C', repo, 'remote', 'add', 'origin', 'git@github.com:acme/app.git'])
    return repo
  }

  test('the hook reads its policy from HOME keyed by the origin remote, and ignores a dev.md in the checkout', () => {
    const home = mkdtempSync(join(tmpdir(), 'vsk-guard-home-'))
    const repo = repoWithOrigin()
    mkdirSync(join(repo, '.vegastack'), { recursive: true })
    writeFileSync(join(repo, '.vegastack/dev.md'), 'repo: acme/app · default branch main\n\n## Environments\n- prod: auto — gh pr merge\n')
    const env = { ...process.env, HOME: home }
    const payload = new TextEncoder().encode(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh pr merge 12 --squash' } }))
    const unsynced = Bun.spawnSync(['node', script, '--harness', 'claude'], { cwd: repo, env, stdin: payload })
    const unsyncedOut = JSON.parse(unsynced.stdout.toString())
    expect(unsyncedOut.hookSpecificOutput.permissionDecision).toBe('ask')
    expect(unsyncedOut.hookSpecificOutput.permissionDecisionReason).toContain('acme__app.json')
    expect(unsyncedOut.hookSpecificOutput.permissionDecisionReason).toContain('vegafactory guard sync')

    mkdirSync(join(home, '.vegastack/guard'), { recursive: true })
    writeFileSync(join(home, '.vegastack/guard/acme__app.json'), JSON.stringify({ ...POLICY, environments: [{ target: 'prod', policy: 'auto', pattern: 'gh pr merge' }] }))
    const synced = Bun.spawnSync(['node', script, '--harness', 'claude'], { cwd: repo, env, stdin: payload })
    expect(synced.stdout.toString()).toBe('')
    const tamper = Bun.spawnSync(['node', script, '--harness', 'codex'], { cwd: repo, env, stdin: new TextEncoder().encode(JSON.stringify({ tool_input: { command: 'echo x > ~/.vegastack/guard/acme__app.json' } })) })
    expect(JSON.parse(tamper.stdout.toString()).decision).toBe('block')
  })

  test('a checkout with no origin remote has no policy and fails closed', () => {
    const home = mkdtempSync(join(tmpdir(), 'vsk-guard-home-'))
    const repo = mkdtempSync(join(tmpdir(), 'vsk-guard-repo-'))
    Bun.spawnSync(['git', 'init', '-q', repo])
    const run = Bun.spawnSync(['node', script, '--harness', 'codex'], { cwd: repo, env: { ...process.env, HOME: home }, stdin: new TextEncoder().encode(JSON.stringify({ tool_input: { command: 'git push origin feat/x' } })) })
    const out = JSON.parse(run.stdout.toString())
    expect(out.decision).toBe('block')
    expect(out.reason).toContain('origin')
  })

  test('unparseable stdin resolves to ask, never allow', () => {
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

  test("the guard, fed this repo's compiled dev.md, asks on its real shipping commands and allows its ordinary ones", () => {
    const script = join(repoRoot, '.vegastack/hooks/ship-guard.mjs')
    const compiler = join(repoRoot, 'skills/dev/dev-setup/scripts/ship-policy.mjs')
    const policyFile = join(mkdtempSync(join(tmpdir(), 'vsk-guard-policy-')), 'policy.json')
    const compiled = Bun.spawnSync(['node', compiler, '--dev-md', join(repoRoot, '.vegastack/dev.md'), '--repo', 'vegastack/vegafactory', '--policy', policyFile, '--write', '--json'])
    expect(compiled.exitCode, compiled.stdout.toString()).toBe(0)
    const check = (command: string) => Bun.spawnSync(['node', script, '--check', '--command', command, '--policy', policyFile, '--repo', 'vegastack/vegafactory', '--json'])
    for (const command of ['gh pr merge 110 --rebase', 'git push origin main', 'git tag v0.19.0', 'git push origin v0.19.0', 'git push --force', 'wrangler deploy --env production', 'bun run --cwd packages/broker deploy:production']) {
      expect(check(command).exitCode, command).toBe(2)
    }
    for (const command of ['bun run check', 'bun run build', 'git push origin feat/104-factory-runtime', 'wrangler deploy --env preview', 'bun run --cwd packages/broker deploy:preview']) {
      expect(check(command).exitCode, command).toBe(0)
    }
  })
})

// --- statistics capture hooks ------------------------------------------------------------

describe('statistics capture hooks', () => {
  const hooks = join(import.meta.dir, '../assets/hooks')
  let stub: string
  let calls: string

  beforeEach(() => {
    stub = mkdtempSync(join(tmpdir(), 'vsk-hook-bin-'))
    calls = join(stub, 'calls.txt')
    const shim = join(stub, 'vegafactory')
    writeFileSync(shim, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${calls}\ncat >> ${calls}\nprintf '\\n' >> ${calls}\n`)
    chmodSync(shim, 0o755)
  })

  const run = (hook: string, stdin: string, env: Record<string, string> = {}) => {
    const result = Bun.spawnSync(['node', join(hooks, hook)], {
      env: { PATH: `${stub}:${process.env.PATH ?? ''}`, TMPDIR: stub, VSK_VEGAFACTORY: join(stub, 'vegafactory'), ...env },
      stdin: new TextEncoder().encode(stdin),
    })
    return { code: result.exitCode, calls: existsSync(calls) ? readFileSync(calls, 'utf8') : '' }
  }

  // The push is spawned detached so a session never waits on the network; the test waits for it.
  const settle = async (needle: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const text = existsSync(calls) ? readFileSync(calls, 'utf8') : ''
      if (text.includes(needle)) return text
      await Bun.sleep(20)
    }
    return existsSync(calls) ? readFileSync(calls, 'utf8') : ''
  }

  test('session-end.mjs picks its source from the harness and forwards the payload', () => {
    const claude = run('session-end.mjs', '{"session_id":"s1"}', { CLAUDE_PROJECT_DIR: '/repo' })
    expect(claude.code).toBe(0)
    expect(claude.calls).toContain('stats record --source claude-session-end')
    expect(claude.calls).toContain('"session_id":"s1"')
    const codex = run('session-end.mjs', '{"session_id":"s2"}')
    expect(codex.calls).toContain('stats record --source codex-session-end')
  })

  test('session-end.mjs pushes at most once per five minutes per machine', async () => {
    run('session-end.mjs', '{"session_id":"s1"}')
    const first = (await settle('stats push')).split('stats push').length - 1
    run('session-end.mjs', '{"session_id":"s2"}')
    const second = (await settle('stats push')).split('stats push').length - 1
    expect(first).toBe(1)
    expect(second).toBe(1)
  })

  test('skill-activated.mjs distinguishes a model call from a typed command', () => {
    const model = run('skill-activated.mjs', '{"session_id":"s","tool_name":"Skill","tool_input":{"skill":"dev-plan"}}')
    expect(model.calls).toContain('stats record --source claude-post-tool')
    const typed = run('skill-activated.mjs', '{"session_id":"s","command_name":"dev-plan"}')
    expect(typed.calls).toContain('stats record --source claude-prompt-expansion')
  })

  test('an unrecognised skill payload forwards nothing rather than guessing', () => {
    const other = run('skill-activated.mjs', '{"session_id":"s","tool_name":"Bash"}')
    expect(other.code).toBe(0)
    expect(other.calls).toBe('')
  })

  test('prompt-skill-mention.mjs forwards the Codex prompt payload', () => {
    const { code, calls: text } = run('prompt-skill-mention.mjs', '{"session_id":"s","prompt":"use $dev-review"}')
    expect(code).toBe(0)
    expect(text).toContain('stats record --source codex-prompt')
  })

  test('every hook exits 0 when vegafactory is not on PATH', () => {
    for (const hook of ['session-end.mjs', 'skill-activated.mjs', 'prompt-skill-mention.mjs']) {
      const result = Bun.spawnSync(['node', join(hooks, hook)], {
        env: { PATH: process.env.PATH ?? '', TMPDIR: stub, VSK_VEGAFACTORY: join(stub, 'nothing-here') },
        stdin: new TextEncoder().encode('{"session_id":"s","tool_name":"Skill","tool_input":{"skill":"x"}}'),
      })
      expect(result.exitCode, hook).toBe(0)
    }
  })
})
