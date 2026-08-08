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
    expect(JSON.parse(await readFile(target, 'utf8')).schemaVersion).toBe(3)
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

  test('brownfield inspection is read-only and reports observed capabilities without treating profile text as code', async () => {
    const root = await temporary('guardian-inspect-')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src/index.ts'), "import 'next/server'\n")
    await mkdir(join(root, '.vegastack'))
    await writeFile(join(root, '.vegastack/architecture.json'), JSON.stringify(baseProfile()))
    const before = await Promise.all((await readdir(root, { recursive: true }) as string[]).sort().map(async path => [path, await Bun.file(join(root, path)).exists() && !path.endsWith('src') && !path.endsWith('.vegastack') ? await Bun.file(join(root, path)).text().catch(() => '') : '']))
    const result = run(['inspect', root, '--json'], root)
    expect(result.exitCode).toBe(0)
    const report = JSON.parse(result.stdout.toString())
    expect(report.mutated).toBe(false)
    expect(report.observed.webControlPlane).toEqual(['src/index.ts'])
    expect(report.observed.agents).toEqual([])
    expect(report.profileDraft.capabilities.webControlPlane.ownership).toBe('REQUIRED-CONFIRMED-OWNERSHIP')
    const after = await Promise.all((await readdir(root, { recursive: true }) as string[]).sort().map(async path => [path, await Bun.file(join(root, path)).exists() && !path.endsWith('src') && !path.endsWith('.vegastack') ? await Bun.file(join(root, path)).text().catch(() => '') : '']))
    expect(after).toEqual(before)
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
    expect(JSON.parse(await readFile(join(root, 'nested/profile.json'), 'utf8')).schemaVersion).toBe(3)
  })

  test('inspect without --json prints a compact summary, not full evidence lists', async () => {
    const root = await temporary('guardian-summary-')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src/index.ts'), "import 'next/server'\n")
    const result = run(['inspect', root], root)
    expect(result.exitCode).toBe(0)
    const report = JSON.parse(result.stdout.toString())
    expect(report.observedCapabilities.webControlPlane.count).toBe(1)
    expect(report.profileDraft).toBeUndefined()
  })

  test('v2 migration is deterministic, read-only by default, and does not overwrite the source', async () => {
    const root = await temporary('guardian-migrate-')
    const source = resolve(import.meta.dir, 'fixtures/compliant/.vegastack/architecture.json')
    const v2 = { schemaVersion: 2, project: 'legacy', hostingProfile: 'self-hosted', versions: { bun: '1.3.14', node: '24.18.0', next: '16.3.0', openNext: 'not-applicable', eve: '0.29.5', workflowWorldContract: '5.0.0-beta.23', workflowLocal: '5.0.0-beta.32', workflowPostgres: '5.0.0-beta.30', postgres: '17.10', pgBoss: '12.27.0', betterAuth: '1.6.26' }, runtimePlacement: { next: 'node', eve: 'node-service', jobs: 'node-service', sandboxBroker: 'node-service', flutter: 'native-client' }, sourceRoots: { next: ['src'], eve: ['apps/eve'], jobs: ['apps/jobs'] }, capabilities: { api: { canonical: 'rest-openapi', openapiGenerated: true }, jobs: { roles: ['agent-admission'] }, sandbox: { provider: 'cloudflare-sandbox', egress: 'deny-by-default', databaseCredentials: false }, secrets: 'openbao' }, identity: { delegated: 'oauth2.1-oidc-code-pkce' }, tenancy: { storage: 'shared-schema-composite-keys' } }
    const input = join(root, 'v2.json')
    await writeFile(input, JSON.stringify(v2))
    const first = run(['migrate-v2', input, '--dir', root], root)
    const second = run(['migrate-v2', input, '--dir', root], root)
    expect(first.exitCode).toBe(0)
    expect(first.stdout.toString()).toBe(second.stdout.toString())
    expect(JSON.parse(await readFile(input, 'utf8')).schemaVersion).toBe(2)
    expect(await Bun.file(join(root, '.vegastack/architecture.v3-draft.yaml')).exists()).toBe(false)
    expect(source).toContain('fixtures/compliant')
  })
})
