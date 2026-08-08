import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
      const result = run(temporary, ['add', 'arch-guardian', '--agent', agent, '--project', '--dir', project, '--non-interactive'])
      expect(result.exitCode).toBe(0)
      if (agent !== 'claude') expect(await readFile(join(project, '.agents/skills/arch-guardian/SKILL.md'), 'utf8')).toContain('name: arch-guardian')
      if (agent !== 'codex') expect(await readFile(join(project, '.claude/skills/arch-guardian/SKILL.md'), 'utf8')).toContain('name: arch-guardian')
    }
  })

  test('installs globally under the isolated HOME', async () => {
    const home = join(temporary, 'global-home')
    await mkdir(home, { recursive: true })
    const result = run(home, ['add', 'arch-guardian', '--agent', 'both', '--global', '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(await readFile(join(home, '.agents/skills/arch-guardian/SKILL.md'), 'utf8')).toContain('VegaStack Architecture Guardian')
    expect(await readFile(join(home, '.claude/skills/arch-guardian/SKILL.md'), 'utf8')).toContain('VegaStack Architecture Guardian')
  })

  test('refuses conflicts, force replaces, and verify detects drift', async () => {
    const project = join(temporary, 'conflict')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const target = join(project, '.agents/skills/arch-guardian/SKILL.md')
    await writeFile(target, 'different\n')
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).not.toBe(0)
    expect(run(temporary, ['verify', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).not.toBe(0)
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--force', '--non-interactive']).exitCode).toBe(0)
    expect(await readFile(target, 'utf8')).toContain('name: arch-guardian')
    expect(run(temporary, ['verify', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
  })

  test('dry-run writes nothing', async () => {
    const project = join(temporary, 'dry-run')
    await mkdir(project, { recursive: true })
    const result = run(temporary, ['add', skill(), '--agent', 'both', '--dir', project, '--dry-run', '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('would install')
    expect(await Bun.file(join(project, '.agents/skills/arch-guardian/SKILL.md')).exists()).toBe(false)
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
    expect(await Bun.file(join(outside, 'skills/arch-guardian/SKILL.md')).exists()).toBe(false)

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
    expect(await Bun.file(join(project, '.agents/skills/arch-guardian/SKILL.md')).exists()).toBe(false)
  })

  test('restores an existing differing target when a forced dual install cannot stage', async () => {
    const project = join(temporary, 'atomic-force-rollback')
    await mkdir(project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const target = join(project, '.agents/skills/arch-guardian/SKILL.md')
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
    expect(await Bun.file(join(project, '.agents/skills/arch-guardian/SKILL.md')).exists()).toBe(false)
  })

  test('doctor reports profile and installation state', async () => {
    const project = join(temporary, 'doctor')
    await cp(resolve(packageRoot, '../../skills/arch-guardian/tests/fixtures/compliant'), project, { recursive: true })
    expect(run(temporary, ['add', skill(), '--agent', 'codex', '--dir', project, '--non-interactive']).exitCode).toBe(0)
    const result = run(temporary, ['doctor', '--dir', project, '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('ok architecture profile')
    expect(result.stdout.toString()).toContain('ok codex arch-guardian installation')
    expect(result.stdout.toString()).toContain('ok architecture invariants')
  })

  test('lists bundled skills with descriptions', async () => {
    const result = run(temporary, ['list'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('arch-guardian')
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
    expect(await readFile(join(home, '.hermes/skills/arch-guardian/SKILL.md'), 'utf8')).toContain('name: arch-guardian')

    const all = run(home, ['add', skill(), '--agent', 'all', '--global', '--non-interactive', '--force'])
    expect(all.exitCode).toBe(0)
    expect(await Bun.file(join(home, '.agents/skills/arch-guardian/SKILL.md')).exists()).toBe(true)
    expect(await Bun.file(join(home, '.claude/skills/arch-guardian/SKILL.md')).exists()).toBe(true)
  })

  test('project install with --agent all skips hermes with a notice', async () => {
    const project = join(temporary, 'all-project')
    await mkdir(project, { recursive: true })
    const result = run(temporary, ['add', skill(), '--agent', 'all', '--dir', project, '--non-interactive'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('skipping hermes')
    expect(await Bun.file(join(project, '.agents/skills/arch-guardian/SKILL.md')).exists()).toBe(true)
    expect(await Bun.file(join(project, '.hermes')).exists()).toBe(false)
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

function skill() { return 'arch-guardian' }
