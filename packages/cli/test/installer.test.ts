import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const packageRoot = resolve(import.meta.dir, '..')
const cli = join(packageRoot, 'dist/index.js')
let temporary = ''

function run(home: string, args: string[]) {
  return Bun.spawnSync(['node', cli, ...args], { cwd: packageRoot, env: { ...process.env, HOME: home } })
}

beforeAll(async () => {
  temporary = await realpath(await mkdtemp(join(tmpdir(), 'vegastack-cli-')))
  const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: packageRoot })
  if (build.exitCode !== 0) throw new Error(build.stderr.toString())
})
afterAll(async () => { await rm(temporary, { recursive: true, force: true }) })

describe('@vegastack/skills installer', () => {
  test('installs Codex-only, Claude-only, and dual project copies', async () => {
    for (const agent of ['codex', 'claude', 'both']) {
      const project = join(temporary, `project-${agent}`)
      await mkdir(project, { recursive: true })
      const result = run(temporary, ['add', 'dev-architect', '--agent', agent, '--project', '--dir', project, '--non-interactive'])
      expect(result.exitCode).toBe(0)
      if (agent !== 'claude') expect(await readFile(join(project, '.agents/skills/dev-architect/SKILL.md'), 'utf8')).toContain('name: dev-architect')
      if (agent !== 'codex') expect(await readFile(join(project, '.claude/skills/dev-architect/SKILL.md'), 'utf8')).toContain('name: dev-architect')
    }
  })

  test('installs globally under the isolated HOME', async () => {
    const home = join(temporary, 'global-home')
    await mkdir(home, { recursive: true })
    const result = run(home, ['add', 'dev-architect', '--agent', 'both', '--global', '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(await readFile(join(home, '.agents/skills/dev-architect/SKILL.md'), 'utf8')).toContain('VegaStack Dev Architect')
    expect(await readFile(join(home, '.claude/skills/dev-architect/SKILL.md'), 'utf8')).toContain('VegaStack Dev Architect')
  })

  test('refuses conflicts, force replaces, and verify detects drift', async () => {
    const project = join(temporary, 'conflict')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const target = join(project, '.agents/skills/dev-architect/SKILL.md')
    await writeFile(target, 'different\n')
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).not.toBe(0)
    expect(run(temporary, ['verify', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).not.toBe(0)
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--force', '--non-interactive']).exitCode).toBe(0)
    expect(await readFile(target, 'utf8')).toContain('name: dev-architect')
    expect(run(temporary, ['verify', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
  })

  test('dry-run writes nothing', async () => {
    const project = join(temporary, 'dry-run')
    await mkdir(project, { recursive: true })
    const result = run(temporary, ['add', skill(), '--agent', 'both', '--dir', project, '--dry-run', '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('would install')
    expect(await Bun.file(join(project, '.agents/skills/dev-architect/SKILL.md')).exists()).toBe(false)
  })

  test('refuses symlinked surfaces and symlinked --dir ancestors', async () => {
    const project = join(temporary, 'symlink-project')
    const outside = join(temporary, 'outside')
    await mkdir(project, { recursive: true })
    await mkdir(outside, { recursive: true })
    await symlink(outside, join(project, '.agents'))
    let result = run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('symlink')
    expect(await Bun.file(join(outside, 'skills/dev-architect/SKILL.md')).exists()).toBe(false)

    const real = join(temporary, 'real-project')
    const alias = join(temporary, 'project-alias')
    await mkdir(real, { recursive: true })
    await symlink(real, alias)
    result = run(temporary, ['add', skill(), '--agent', 'codex', '--dir', alias, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('symlink')
  })

  test('rolls back all targets when a later staging operation fails', async () => {
    const project = join(temporary, 'atomic-failure')
    await mkdir(join(project, '.claude'), { recursive: true })
    await writeFile(join(project, '.claude/skills'), 'not a directory')
    const result = run(temporary, ['add', skill(), '--agent', 'both', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(await Bun.file(join(project, '.agents/skills/dev-architect/SKILL.md')).exists()).toBe(false)
  })

  test('restores an existing differing target when a forced dual install cannot stage', async () => {
    const project = join(temporary, 'atomic-force-rollback')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const target = join(project, '.agents/skills/dev-architect/SKILL.md')
    await writeFile(target, 'user-owned prior content\n')
    await mkdir(join(project, '.claude'), { recursive: true })
    await writeFile(join(project, '.claude/skills'), 'not a directory')
    const result = run(temporary, ['add', skill(), '--agent', 'both', '--dir', project, '--force', '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(await readFile(target, 'utf8')).toBe('user-owned prior content\n')
  })

  test('recovers a prepared crash journal before a later install', async () => {
    const project = join(temporary, 'crash-recovery')
    const parent = join(project, '.agents/skills')
    const destination = join(parent, skill())
    const backup = join(parent, `.${skill()}.backup-crash`)
    const stage = join(parent, `.${skill()}.stage-crash`)
    await mkdir(destination, { recursive: true })
    await mkdir(backup, { recursive: true })
    await mkdir(stage, { recursive: true })
    await writeFile(join(destination, 'SKILL.md'), 'partially-applied-new\n')
    await writeFile(join(backup, 'SKILL.md'), 'recoverable-prior\n')
    await mkdir(join(project, '.vegastack'), { recursive: true })
    await writeFile(join(project, '.vegastack/.skills-install-transaction.json'), JSON.stringify({ schemaVersion: 2, status: 'prepared', operations: [{ skill: skill(), agent: 'codex', destination, backup, stage, existed: true }] }))
    const result = run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(await readFile(join(destination, 'SKILL.md'), 'utf8')).toBe('recoverable-prior\n')
    expect(await Bun.file(join(project, '.vegastack/.skills-install-transaction.json')).exists()).toBe(false)
  })

  test('rejects an untrusted crash journal without deleting outside data', async () => {
    const project = join(temporary, 'malicious-journal')
    const outside = join(temporary, 'must-survive')
    await mkdir(join(project, '.vegastack'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(outside, 'owned.txt'), 'preserve\n')
    await writeFile(join(project, '.vegastack/.skills-install-transaction.json'), JSON.stringify({ schemaVersion: 2, status: 'prepared', operations: [{ skill: skill(), agent: 'codex', destination: outside, stage: join(temporary, '.stage-attacker'), existed: false }] }))
    const result = run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('Untrusted installer recovery journal')
    expect(await readFile(join(outside, 'owned.txt'), 'utf8')).toBe('preserve\n')
  })

  test('refuses a concurrent live installer lock', async () => {
    const project = join(temporary, 'concurrent-lock')
    await mkdir(join(project, '.vegastack'), { recursive: true })
    await writeFile(join(project, '.vegastack/.skills-install.lock'), JSON.stringify({ schemaVersion: 1, pid: process.pid, startedAt: new Date().toISOString() }))
    const result = run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('installation is active')
    expect(await Bun.file(join(project, '.agents/skills/dev-architect/SKILL.md')).exists()).toBe(false)
  })

  test('doctor reports profile and installation state', async () => {
    const project = join(temporary, 'doctor')
    await mkdir(join(project, '.vegastack'), { recursive: true })
    await writeFile(join(project, '.vegastack/dev.md'), '# Dev profile\n\n## Knobs\n\ngates: 3\n')
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const result = run(temporary, ['doctor', '--dir', project, '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('ok dev profile')
    expect(result.stdout.toString()).toContain('ok codex dev-architect installation')
  })

  test('lists bundled skills with descriptions', async () => {
    const result = run(temporary, ['list'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('dev-architect')
  })

  test('hermes installs are global-only', async () => {
    const project = join(temporary, 'hermes-project')
    await mkdir(project, { recursive: true })
    const rejected = run(temporary, ['add', skill(), '--agent', 'hermes', '--project', '--dir', project, '--non-interactive'])
    expect(rejected.exitCode).not.toBe(0)
    expect(rejected.stderr.toString()).toContain('global')

    const home = join(temporary, 'hermes-home')
    await mkdir(home, { recursive: true })
    const global = run(home, ['add', skill(), '--agent', 'hermes', '--global', '--non-interactive'])
    expect(global.exitCode).toBe(0)
    expect(await readFile(join(home, '.hermes/skills/dev-architect/SKILL.md'), 'utf8')).toContain('name: dev-architect')

    const all = run(home, ['add', skill(), '--agent', 'all', '--global', '--non-interactive', '--force'])
    expect(all.exitCode).toBe(0)
    expect(await Bun.file(join(home, '.agents/skills/dev-architect/SKILL.md')).exists()).toBe(true)
    expect(await Bun.file(join(home, '.claude/skills/dev-architect/SKILL.md')).exists()).toBe(true)
  })

  test('project install with --agent all skips hermes with a notice', async () => {
    const project = join(temporary, 'all-project')
    await mkdir(project, { recursive: true })
    const result = run(temporary, ['add', skill(), '--agent', 'all', '--dir', project, '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('skipping hermes')
    expect(await Bun.file(join(project, '.agents/skills/dev-architect/SKILL.md')).exists()).toBe(true)
    expect(await Bun.file(join(project, '.hermes')).exists()).toBe(false)
  })

  test('verify with no skill name checks all bundled skills and tolerates uninstalled ones', async () => {
    const project = join(temporary, 'verify-all')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const result = run(temporary, ['verify', '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain(`verified codex ${skill()}`)
    expect(result.stdout.toString()).toContain('not installed codex skillify')

    const empty = join(temporary, 'verify-all-empty')
    await mkdir(empty, { recursive: true })
    const none = run(temporary, ['verify', '--agent', 'codex', '--dir', empty, '--non-interactive'])
    expect(none.exitCode).not.toBe(0)
    expect(none.stdout.toString()).toContain('no bundled skills are installed')
  })

  test('remove uninstalls a clean copy and refuses a drifted one without --force', async () => {
    const project = join(temporary, 'remove-flow')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const target = join(project, '.agents/skills', skill(), 'SKILL.md')
    await writeFile(target, 'locally modified\n')
    const refused = run(temporary, ['remove', skill(), '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(refused.exitCode).not.toBe(0)
    expect(refused.stderr.toString()).toContain('--force')
    expect(await Bun.file(target).exists()).toBe(true)
    expect(run(temporary, ['remove', skill(), '--agent', 'codex', '--dir', project, '--non-interactive', '--force']).exitCode).toBe(0)
    expect(await Bun.file(target).exists()).toBe(false)
    const gone = run(temporary, ['remove', skill(), '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(gone.exitCode).not.toBe(0)
    expect(gone.stdout.toString()).toContain('not installed')
  })

  test('hermes with defaulted project mode errors with global guidance', async () => {
    const project = join(temporary, 'hermes-defaulted')
    await mkdir(project, { recursive: true })
    const result = run(temporary, ['add', skill(), '--agent', 'hermes', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('--global')
  })

  test('dry-run over a differing install reports would-replace instead of erroring', async () => {
    const project = join(temporary, 'dry-run-differing')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    await writeFile(join(project, '.agents/skills', skill(), 'SKILL.md'), 'drift\n')
    const result = run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--dry-run', '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('would replace')
  })

  test('rejects a legacy v1 recovery journal with a manual-cleanup error', async () => {
    const project = join(temporary, 'legacy-journal')
    await mkdir(join(project, '.vegastack'), { recursive: true })
    await writeFile(join(project, '.vegastack/.skills-install-transaction.json'), JSON.stringify({ schemaVersion: 1, status: 'prepared', operations: [] }))
    const result = run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('Unsupported installer recovery journal')
  })
})

function skill() { return 'dev-architect' }

describe('selecting a family', () => {
  test('add --group installs every member flat, on both surfaces', async () => {
    const project = join(temporary, 'group-install')
    await mkdir(project, { recursive: true })
    const result = run(temporary, ['add', '--group', 'dev-skills', '--agent', 'both', '--dir', project, '--non-interactive'])
    expect(result.exitCode).toBe(0)
    for (const name of ['dev-plan', 'dev-ship', 'dev-setup']) {
      expect(existsSync(join(project, `.claude/skills/${name}/SKILL.md`))).toBe(true)
      expect(existsSync(join(project, `.agents/skills/${name}/SKILL.md`))).toBe(true)
    }
    // The invariant from issue 54: a selection may name a group, an install path never does.
    expect(existsSync(join(project, '.claude/skills/dev-skills'))).toBe(false)
  })

  test('a failure anywhere in the selection leaves the destination untouched', async () => {
    const project = join(temporary, 'group-rollback')
    // A pre-existing, differing copy of one member makes the run refuse without --force.
    await mkdir(join(project, '.claude/skills/dev-ship'), { recursive: true })
    await writeFile(join(project, '.claude/skills/dev-ship/SKILL.md'), 'not the bundled copy\n')
    const result = run(temporary, ['add', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    expect(result.exitCode).not.toBe(0)
    // No other member may have been written: the whole selection refuses together.
    expect(existsSync(join(project, '.claude/skills/dev-plan'))).toBe(false)
    expect(await readFile(join(project, '.claude/skills/dev-ship/SKILL.md'), 'utf8')).toBe('not the bundled copy\n')
  })

  test('--all installs the dev family but not the repo-only meta skills', async () => {
    const project = join(temporary, 'all-install')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', '--all', '--agent', 'claude', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    expect(existsSync(join(project, '.claude/skills/dev-plan/SKILL.md'))).toBe(true)
    expect(existsSync(join(project, '.claude/skills/skillify'))).toBe(false)
    expect(existsSync(join(project, '.claude/skills/skill-maintainer'))).toBe(false)
    // Still installable deliberately — this is how this repo sets itself up.
    expect(run(temporary, ['add', 'skill-maintainer', '--agent', 'claude', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    expect(existsSync(join(project, '.claude/skills/skill-maintainer/SKILL.md'))).toBe(true)
  })

  test('conflicting selectors and an unknown group are refused before any write', async () => {
    const project = join(temporary, 'selector-refusal')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', 'dev-plan', '--all', '--dir', project, '--non-interactive']).exitCode).not.toBe(0)
    const unknown = run(temporary, ['add', '--group', 'ghost', '--dir', project, '--non-interactive'])
    expect(unknown.exitCode).not.toBe(0)
    expect(unknown.stderr.toString()).toMatch(/dev-skills/)
    expect(existsSync(join(project, '.claude'))).toBe(false)
  })

  test('re-running a group install reports unchanged and exits 0', async () => {
    const project = join(temporary, 'group-idempotent')
    await mkdir(project, { recursive: true })
    run(temporary, ['add', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    const again = run(temporary, ['add', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    expect(again.exitCode).toBe(0)
    expect(again.stdout.toString()).toContain('unchanged')
  })

  test('verify --group reports each member, and fails when one is missing', async () => {
    const project = join(temporary, 'group-verify')
    await mkdir(project, { recursive: true })
    run(temporary, ['add', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    const clean = run(temporary, ['verify', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    expect(clean.exitCode).toBe(0)
    expect(clean.stdout.toString()).toContain('verified claude dev-plan')

    await rm(join(project, '.claude/skills/dev-ship'), { recursive: true, force: true })
    const missing = run(temporary, ['verify', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    expect(missing.exitCode).not.toBe(0)
    expect(missing.stdout.toString()).toMatch(/dev-ship/)
  })

  test('remove --group refuses on a drifted member before removing anything', async () => {
    const project = join(temporary, 'group-remove')
    await mkdir(project, { recursive: true })
    run(temporary, ['add', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    await writeFile(join(project, '.claude/skills/dev-ship/SKILL.md'), 'locally edited\n')
    const refused = run(temporary, ['remove', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive'])
    expect(refused.exitCode).not.toBe(0)
    // Nothing removed: an untouched member must still be there.
    expect(existsSync(join(project, '.claude/skills/dev-plan/SKILL.md'))).toBe(true)

    const forced = run(temporary, ['remove', '--group', 'dev-skills', '--agent', 'claude', '--dir', project, '--non-interactive', '--force'])
    expect(forced.exitCode).toBe(0)
    expect(existsSync(join(project, '.claude/skills/dev-plan'))).toBe(false)
    expect(existsSync(join(project, '.claude/skills/dev-ship'))).toBe(false)
  })

  test('list groups its output and teaches the group flag', () => {
    const out = run(temporary, ['list']).stdout.toString()
    expect(out).toMatch(/dev-skills/)
    expect(out).toMatch(/add --group dev-skills/)
    expect(out.indexOf('dev-plan')).toBeGreaterThan(out.indexOf('dev-skills'))
    // Repo-only skills are visible, and marked so the reason is legible without docs.
    expect(out).toMatch(/skillify/)
    expect(out).toMatch(/repo-only/i)
  })
})
