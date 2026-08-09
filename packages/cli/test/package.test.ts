import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, realpath, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const packageRoot = resolve(import.meta.dir, '..')
let temporary = ''

beforeAll(async () => { temporary = await realpath(await mkdtemp(join(tmpdir(), 'vegastack-pack-'))) })
afterAll(async () => { await rm(temporary, { recursive: true, force: true }) })

describe('publishable package', () => {
  test('packs locally, installs the tarball, and runs its bundled installer', async () => {
    const pack = Bun.spawnSync(['npm', 'pack', '--silent', '--pack-destination', temporary], { cwd: packageRoot })
    expect(pack.exitCode).toBe(0)
    const filename = pack.stdout.toString().trim().split('\n').at(-1)!
    const tarball = join(temporary, filename)
    const installRoot = join(temporary, 'consumer')
    await mkdir(installRoot, { recursive: true })
    const install = Bun.spawnSync(['npm', 'install', '--ignore-scripts', '--prefix', installRoot, tarball], { cwd: temporary })
    expect(install.exitCode).toBe(0)
    const cli = join(installRoot, 'node_modules/.bin/vegastack-skills')
    const project = join(temporary, 'packed-project')
    const compliant = resolve(packageRoot, '../../skills/arch-guardian/tests/fixtures/compliant')
    await cp(compliant, project, { recursive: true })
    const add = Bun.spawnSync([cli, 'add', 'arch-guardian', '--agent', 'both', '--dir', project, '--non-interactive'], { cwd: temporary, env: { ...process.env, HOME: temporary } })
    expect(add.exitCode).toBe(0)
    expect(await readFile(join(project, '.agents/skills/arch-guardian/SKILL.md'), 'utf8')).toContain('name: arch-guardian')
    expect(await readFile(join(project, '.claude/skills/arch-guardian/SKILL.md'), 'utf8')).toContain('name: arch-guardian')
    const installed = join(project, '.agents/skills/arch-guardian')
    const installedFiles = await walk(installed)
    for (const forbidden of ['golden-architecture.md', 'evidence-manifest.json', 'coverage-matrix.md', 'verification-ledger.md', '23-evidence-comparisons.md', '24-roadmap.md', 'compile-guide.mjs']) expect(installedFiles.some(path => path.endsWith(forbidden))).toBe(false)
    expect((await readFile(join(installed, 'SKILL.md'), 'utf8')).split('\n').length).toBeLessThanOrEqual(120)
    for (const required of ['references/workflows.md', 'references/profile-governance.md', 'references/golden-patterns.md', 'references/advisory-report.md', 'references/foundation-compatibility.json', 'references/rule-model.json', 'scripts/profile-tool.mjs', 'scripts/schema-validate.mjs']) expect(installedFiles.some(path => path.endsWith(required))).toBe(true)
    expect(installedFiles.some(path => path.endsWith('architecture-check.mjs') || path.endsWith('control-catalog.json'))).toBe(false)
    expect(installedFiles.some(path => path.includes('/tests/'))).toBe(false)
    const profile = Bun.spawnSync(['node', join(installed, 'scripts/validate-profile.mjs'), join(project, '.vegastack/architecture.json')], { cwd: project })
    expect(profile.exitCode).toBe(0)
    const corpus = Bun.spawnSync(['node', join(installed, 'scripts/verify-corpus.mjs')], { cwd: project })
    expect(corpus.exitCode).toBe(0)
    expect(corpus.stdout.toString()).toContain('Mermaid mode=structural-fallback')
    const refresh = Bun.spawnSync(['node', join(installed, 'scripts/refresh-evidence.mjs'), '--topics', 'unrelated-fast-path', '--offline', '--cache', join(project, '.vegastack/packed-cache.json'), '--report', join(project, '.vegastack/packed-report.json')], { cwd: project })
    expect(refresh.exitCode).toBe(0)
    const inspect = Bun.spawnSync(['node', join(installed, 'scripts/profile-tool.mjs'), 'inspect', project, '--json'], { cwd: project })
    expect(inspect.exitCode).toBe(0)
    expect(JSON.parse(inspect.stdout.toString()).mutated).toBe(false)
  }, 30_000)
})

async function walk(root: string): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) output.push(...await walk(path))
    else output.push(path)
  }
  return output
}
