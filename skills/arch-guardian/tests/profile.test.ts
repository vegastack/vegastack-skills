import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { canonicalRuleIds, validateProfile } from '../scripts/validate-profile.mjs'
import { baseProfile, writeProject } from './helpers'

const created: string[] = []
async function project(profile: any, files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'guardian-profile-'))
  created.push(root)
  await writeProject(root, profile, files)
  return { root, path: join(root, '.vegastack/architecture.json') }
}
afterEach(async () => { while (created.length) await rm(created.pop()!, { recursive: true, force: true }) })

describe('architecture profile v4', () => {
  test('accepts the compliant fixture profile', async () => {
    expect((await validateProfile(resolve(import.meta.dir, 'fixtures/compliant/.vegastack/architecture.json'))).errors).toEqual([])
  })

  test('accepts a minimal profile for every tier and kind', async () => {
    for (const tier of ['prototype', 'production', 'enterprise']) {
      for (const kind of ['saas', 'internal-tool', 'client-site', 'api', 'package']) {
        const profile = baseProfile()
        profile.project.tier = tier
        profile.project.kind = kind
        const { path } = await project(profile)
        expect((await validateProfile(path)).errors).toEqual([])
      }
    }
  })

  test('accepts an enabled capability list and free-form notes', async () => {
    const profile = baseProfile()
    profile.project.tenancy = 'multi-tenant-shared-schema'
    profile.hosting = 'cloudflare-opennext'
    profile.capabilities = ['web', 'agents', 'jobs', 'enterprise-identity']
    profile.notes = ['Better Auth for identity', 'secrets in platform store until enterprise tier']
    const { path } = await project(profile)
    expect((await validateProfile(path)).errors).toEqual([])
  })

  test('rejects unknown tiers, kinds, capabilities, hosting values, and duplicates via schema', async () => {
    const profile = baseProfile()
    profile.project.tier = 'startup'
    profile.capabilities = ['web', 'web', 'blockchain']
    profile.hosting = 'mainframe'
    profile.unexpected = true
    const { path } = await project(profile)
    const errors = (await validateProfile(path)).errors.join('\n')
    expect(errors).toContain('tier')
    expect(errors).toContain('unique')
    expect(errors).toContain('must be one of')
    expect(errors).toContain('additional property')
  })

  test('rejects REQUIRED placeholders anywhere in the profile', async () => {
    const profile = baseProfile()
    profile.project.name = 'REQUIRED-CONFIRMED-PROJECT-NAME'
    profile.notes = ['REQUIRED-CONFIRMED-NOTE']
    const { path } = await project(profile)
    const errors = (await validateProfile(path)).errors.join('\n')
    expect(errors).toContain('project.name')
    expect(errors).toContain('notes[0]')
  })

  test('directs obsolete v2/v3 profiles to the migrate command', async () => {
    for (const version of [2, 3]) {
      const profile = { schemaVersion: version, project: { name: 'legacy' } }
      const { path } = await project(profile)
      expect((await validateProfile(path)).errors.join('\n')).toContain('profile-tool.mjs migrate')
    }
  })

  test('exposes a unique canonical rule catalog with the core invariants', async () => {
    const ids = await canonicalRuleIds()
    expect(ids.size).toBeGreaterThan(50)
    for (const id of ['TEN-002', 'DUR-001', 'SBX-003', 'AUTH-003', 'SEC-002']) expect(ids.has(id)).toBe(true)
  })
})
