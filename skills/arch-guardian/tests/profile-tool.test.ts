import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { baseProfile } from './helpers'

const script = resolve(import.meta.dir, '../scripts/profile-tool.mjs')
const created: string[] = []
async function temporary(name: string) { const root = await realpath(await mkdtemp(join(tmpdir(), name))); created.push(root); return root }
afterEach(async () => { while (created.length) await rm(created.pop()!, { recursive: true, force: true }) })
const run = (args: string[], cwd: string) => Bun.spawnSync(['node', script, ...args], { cwd })

describe('profile questionnaire, scaffolding and inspection', () => {
  test('scaffold is dry-run by default and creates no files', async () => {
    const root = await temporary('guardian-scaffold-')
    const answers = join(root, 'answers.json')
    await writeFile(answers, JSON.stringify(baseProfile()))
    const before = await readdir(root)
    const result = run(['scaffold', answers, '--dir', root], root)
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString()).mode).toBe('dry-run')
    expect(await readdir(root)).toEqual(before)
  })

  test('authorized writes are atomic, conflict-safe, and force is explicit', async () => {
    const root = await temporary('guardian-write-')
    const answers = join(root, 'answers.json')
    await writeFile(answers, JSON.stringify(baseProfile()))
    expect(run(['scaffold', answers, '--dir', root, '--write'], root).exitCode).toBe(0)
    const target = join(root, '.vegastack/architecture.json')
    expect(JSON.parse(await readFile(target, 'utf8')).schemaVersion).toBe(4)
    await writeFile(target, 'user-content\n')
    expect(run(['scaffold', answers, '--dir', root, '--write'], root).exitCode).not.toBe(0)
    expect(await readFile(target, 'utf8')).toBe('user-content\n')
    expect(run(['scaffold', answers, '--dir', root, '--write', '--force'], root).exitCode).toBe(0)
  })

  test('refuses symlinked write surfaces', async () => {
    const root = await temporary('guardian-symlink-')
    const outside = await temporary('guardian-outside-')
    const answers = join(root, 'answers.json')
    await writeFile(answers, JSON.stringify(baseProfile()))
    await symlink(outside, join(root, '.vegastack'))
    const result = run(['scaffold', answers, '--dir', root, '--write'], root)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('symlink')
    expect(await readdir(outside)).toEqual([])
  })

  test('brownfield inspection is read-only and reports observed capabilities', async () => {
    const root = await temporary('guardian-inspect-')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src/index.ts'), "import 'next/server'\n")
    await mkdir(join(root, '.vegastack'))
    await writeFile(join(root, '.vegastack/architecture.json'), JSON.stringify(baseProfile()))
    const result = run(['inspect', root, '--json'], root)
    expect(result.exitCode).toBe(0)
    const report = JSON.parse(result.stdout.toString())
    expect(report.mutated).toBe(false)
    expect(report.observed.web).toEqual(['src/index.ts'])
    expect(report.observed.agents).toEqual([])
    expect(report.profileDraft.schemaVersion).toBe(4)
    expect(report.profileDraft.capabilities).toEqual(['web'])
    expect(report.profileDraft.project.tier).toBe('REQUIRED-CONFIRMED-TIER')
  })

  test('confines --output to --dir and rejects absolute or parent-escaping paths', async () => {
    const root = await temporary('guardian-output-')
    const outside = await temporary('guardian-output-outside-')
    const answers = join(root, 'answers.json')
    await writeFile(answers, JSON.stringify(baseProfile()))
    for (const escape of [join(outside, 'stolen.json'), '../stolen.json', 'nested/../../stolen.json']) {
      const result = run(['scaffold', answers, '--dir', root, '--write', '--output', escape], root)
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('--output')
    }
    expect(await readdir(outside)).toEqual([])
    expect(run(['scaffold', answers, '--dir', root, '--write', '--output', 'nested/profile.json'], root).exitCode).toBe(0)
    expect(JSON.parse(await readFile(join(root, 'nested/profile.json'), 'utf8')).schemaVersion).toBe(4)
  })

  test('inspect without --json prints a compact summary, not full evidence lists', async () => {
    const root = await temporary('guardian-summary-')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src/index.ts'), "import 'next/server'\n")
    const result = run(['inspect', root], root)
    expect(result.exitCode).toBe(0)
    const report = JSON.parse(result.stdout.toString())
    expect(report.observedCapabilities.web.count).toBe(1)
    expect(report.profileDraft).toBeUndefined()
  })

  test('v3 migration is deterministic, read-only by default, and converts exceptions to notes', async () => {
    const root = await temporary('guardian-migrate-')
    const v3 = {
      schemaVersion: 3,
      profileStatus: 'confirmed',
      foundation: { version: '0.3.0', baseline: 'vs-2026-08-07', adoption: 'supported' },
      project: { name: 'legacy', kind: 'saas-product', lifecycle: 'maintenance', access: 'authenticated', tenancy: 'multi-tenant-shared-schema' },
      environments: { production: { hosting: 'self-hosted' }, localDevelopment: { trusted: true, allowances: [] } },
      capabilities: {
        webControlPlane: { status: 'enabled', ownership: 'owned', versions: { next: '16.3.0' }, placement: 'node', sourceRoots: ['src'] },
        modelRouting: { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['packages/models'] },
        agents: { status: 'disabled', ownership: 'not-applicable' }
      },
      exceptions: [{ id: 'EXC-001', ruleId: 'SEC-002', decision: 'platform env vars until enterprise', paths: ['.env'], adr: 'docs/adr.md' }]
    }
    const input = join(root, 'v3.json')
    await writeFile(input, JSON.stringify(v3))
    const first = run(['migrate', input, '--dir', root], root)
    const second = run(['migrate', input, '--dir', root], root)
    expect(first.exitCode).toBe(0)
    expect(first.stdout.toString()).toBe(second.stdout.toString())
    const payload = JSON.parse(first.stdout.toString())
    expect(payload.mode).toBe('dry-run')
    expect(payload.profile.schemaVersion).toBe(4)
    expect(payload.profile.project.kind).toBe('saas')
    expect(payload.profile.project.tier).toBe('REQUIRED-CONFIRMED-TIER')
    expect(payload.profile.capabilities).toEqual(['web', 'models'])
    expect(payload.profile.notes[0]).toContain('EXC-001')
    expect(JSON.parse(await readFile(input, 'utf8')).schemaVersion).toBe(3)
    expect(await Bun.file(join(root, '.vegastack/architecture.v4-draft.json')).exists()).toBe(false)
  })
})
