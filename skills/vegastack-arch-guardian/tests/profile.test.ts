import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { canonicalRuleIds, validateProfile } from '../scripts/validate-profile.mjs'
import { agentCapability, baseProfile, jobsCapability, secretCapability, serviceContract, webCapability, writeProject } from './helpers'

const created: string[] = []
async function project(profile: any, files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'guardian-profile-'))
  created.push(root)
  await writeProject(root, profile, files)
  return { root, path: join(root, '.vegastack/architecture.json') }
}
afterEach(async () => { while (created.length) await rm(created.pop()!, { recursive: true, force: true }) })

describe('architecture profile v3', () => {
  test('accepts the compliant shared-schema web fixture', async () => {
    expect((await validateProfile(resolve(import.meta.dir, 'fixtures/compliant/.vegastack/architecture.json'))).errors).toEqual([])
  })

  test('accepts web-only public and internal single-tenant products without agent capabilities', async () => {
    for (const variant of [{ access: 'public', tenancy: 'none', auth: false }, { access: 'internal', tenancy: 'single-tenant', auth: true }]) {
      const profile = baseProfile()
      profile.project.access = variant.access
      profile.project.tenancy = variant.tenancy
      profile.environments.production.hosting = 'self-hosted'
      profile.capabilities.webControlPlane = webCapability('node', { auth: variant.auth })
      if (variant.auth) profile.capabilities.secrets = secretCapability()
      const { path } = await project(profile)
      expect((await validateProfile(path)).errors).toEqual([])
    }
  })

  test('accepts Flutter without agents only with PKCE and generated REST client', async () => {
    const profile = baseProfile()
    profile.project.access = 'authenticated'
    profile.environments.production.hosting = 'self-hosted'
    profile.capabilities.webControlPlane = webCapability('node', { auth: true, controls: { canonicalApi: 'rest-openapi', openapiGenerated: true } })
    profile.capabilities.flutter = { status: 'enabled', ownership: 'owned', versions: { flutter: '3.32.8' }, placement: 'native-client', sourceRoots: ['apps/mobile'], controls: { delegatedOAuthPkce: true, generatedRestClient: true } }
    profile.capabilities.secrets = secretCapability()
    const { path } = await project(profile)
    expect((await validateProfile(path)).errors).toEqual([])
    profile.capabilities.flutter.controls.delegatedOAuthPkce = false
    const broken = await project(profile)
    expect((await validateProfile(broken.path)).errors.join('\n')).toContain('flutter.oauth-pkce')
  })

  test('accepts owned agents/jobs without Flutter and rare shared-managed EVE without provider roots', async () => {
    const ownedProfile = baseProfile()
    ownedProfile.project.kind = 'platform-service'
    ownedProfile.capabilities.agents = agentCapability()
    ownedProfile.capabilities.jobs = jobsCapability()
    let target = await project(ownedProfile)
    expect((await validateProfile(target.path)).errors).toEqual([])

    const shared = baseProfile()
    shared.project.kind = 'platform-service'
    shared.capabilities.agents = agentCapability('shared-managed')
    target = await project(shared)
    expect((await validateProfile(target.path)).errors).toEqual([])
    expect(shared.capabilities.agents.sourceRoots).toBeUndefined()
  })

  test('accepts a fully enabled platform when every conditional dependency is explicit', async () => {
    const profile = baseProfile()
    profile.project = { name: 'full-platform', kind: 'saas-product', lifecycle: 'greenfield', access: 'mixed', tenancy: 'multi-tenant-shared-schema' }
    profile.environments.production.hosting = 'cloudflare-opennext'
    profile.capabilities.webControlPlane = webCapability('open-next-worker', { auth: true, controls: { canonicalApi: 'rest-openapi', openapiGenerated: true } })
    profile.capabilities.flutter = { status: 'enabled', ownership: 'owned', versions: { flutter: '3.32.8' }, placement: 'native-client', sourceRoots: ['apps/mobile'], controls: { delegatedOAuthPkce: true, generatedRestClient: true } }
    profile.capabilities.agents = { ...agentCapability(), controls: { ...agentCapability().controls, untrustedExecution: true } }
    profile.capabilities.jobs = jobsCapability()
    profile.capabilities.sandbox = { status: 'enabled', ownership: 'owned', versions: { cloudflareSandbox: '0.12.4' }, placement: 'worker', sourceRoots: ['packages/sandbox'], controls: { provider: 'cloudflare-sandbox', trustedBroker: true, egress: 'deny-by-default', databaseCredentials: false } }
    profile.capabilities.connectors = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['packages/connectors'], controls: { credentialBearing: true } }
    profile.capabilities.knowledge = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['packages/knowledge'], controls: { postgresOwner: 'product-postgresql', binaryObjects: true, objectStorageOwner: 'product-object-store' } }
    profile.capabilities.modelRouting = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['packages/modelRouting'], controls: { credentialBearing: true } }
    profile.capabilities.realtime = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['packages/realtime'], controls: {} }
    profile.capabilities.notifications = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['packages/notifications'], controls: { durableIntentOwner: 'product-postgresql' } }
    profile.capabilities.enterpriseIdentity = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'web', sourceRoots: ['packages/identity'], controls: { scim: true, organizationMapping: true, deprovisioning: true } }
    profile.capabilities.secrets = secretCapability()
    profile.data = { classes: [{ name: 'restricted', owner: 'confirmed-owner', retention: 'confirmed-policy' }] }
    profile.objectives = { availability: 'confirmed-objective', latency: 'confirmed-objective', rpoMinutes: 15, rtoMinutes: 60 }
    const { path } = await project(profile)
    expect((await validateProfile(path)).errors).toEqual([])
  })

  test('requires complete shared/external contracts structurally', async () => {
    const profile = baseProfile()
    profile.capabilities.knowledge = { status: 'enabled', ownership: 'external-managed', versions: { service: '1.0.0' }, placement: 'external', contract: { ...serviceContract(), migrationExit: undefined } }
    const { path } = await project(profile)
    const errors = (await validateProfile(path)).errors.join('\n')
    expect(errors).toContain('migrationExit')
  })

  test('requires conditional durable, data, credential, and notification owners', async () => {
    const profile = baseProfile()
    profile.capabilities.agents = { ...agentCapability(), controls: { workflowWorld: 'postgres', agentRun: true, admission: 'pg-boss' } }
    profile.capabilities.jobs = { ...jobsCapability(), controls: { roles: ['agent-admission'] } }
    profile.capabilities.knowledge = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['knowledge'], controls: { binaryObjects: true } }
    profile.capabilities.connectors = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['connectors'], controls: { credentialBearing: true } }
    profile.capabilities.notifications = { status: 'enabled', ownership: 'owned', versions: { implementation: '1.0.0' }, placement: 'node-service', sourceRoots: ['notifications'], controls: {} }
    const { path } = await project(profile)
    const errors = (await validateProfile(path)).errors.join('\n')
    for (const controlId of ['agents.storage-ownership', 'jobs.database-owner', 'knowledge.storage-owner', 'knowledge.object-storage-owner', 'secrets.dependency', 'notifications.durable-intent-owner']) expect(errors).toContain(controlId)
  })

  test('requires a complete removal plan only when disabling a previously enabled capability', async () => {
    const profile = baseProfile()
    profile.capabilities.connectors = { status: 'disabled', ownership: 'not-applicable', transitionFrom: 'enabled' }
    let target = await project(profile)
    expect((await validateProfile(target.path)).errors.join('\n')).toContain('removal')
    profile.capabilities.connectors.removal = { durableData: 'delete mappings', credentials: 'revoke', queues: 'drain', contracts: 'terminate', owner: 'team', verification: 'reconcile', rollback: 'restore mappings' }
    target = await project(profile)
    expect((await validateProfile(target.path)).errors).toEqual([])
  })

  test('enforces Cloudflare placement only for enabled owned agents/jobs', async () => {
    const webOnly = baseProfile()
    webOnly.environments.production.hosting = 'cloudflare-opennext'
    webOnly.capabilities.webControlPlane = webCapability('open-next-worker')
    let target = await project(webOnly)
    expect((await validateProfile(target.path)).errors).toEqual([])
    webOnly.capabilities.agents = { ...agentCapability(), placement: 'open-next-worker' }
    webOnly.capabilities.jobs = jobsCapability()
    target = await project(webOnly)
    expect((await validateProfile(target.path)).errors.join('\n')).toContain('hosting.agents-placement')
  })

  test('distinguishes supported, candidate, and deprecated foundation adoption', async () => {
    for (const [baseline, adoption] of [['candidate', 'candidate'], ['vs-2026-05-01', 'deprecated']]) {
      const profile = baseProfile()
      profile.foundation.baseline = baseline
      profile.foundation.adoption = adoption
      const { path } = await project(profile)
      expect((await validateProfile(path)).errors.join('\n')).toContain('foundation.non-supported-adoption')
    }
  })

  test('uses JSON Schema for extra properties, types and uniqueness', async () => {
    const profile = baseProfile()
    profile.unexpected = true
    profile.project.name = 42
    profile.environments.localDevelopment.allowances = ['single-process', 'single-process']
    const { path } = await project(profile)
    const errors = (await validateProfile(path)).errors.join('\n')
    expect(errors).toContain('additional property')
    expect(errors).toContain('must be string')
    expect(errors).toContain('unique')
  })

  test('rejects impossible calendar dates in exception reviews', async () => {
    const profile = baseProfile()
    profile.exceptions = [{ id: 'EXC-999', ruleId: 'SEC-002', controls: ['secret.plaintext'], paths: ['.env'], adr: 'docs/adr.md', projectOwner: 'owner', status: 'active', verificationType: 'static-sentinel', rationale: 'rationale', decision: 'decision', risks: ['risk'], compensatingControls: ['control'], verification: ['verify'], rollbackOrMigration: 'migrate', review: { date: '2027-02-31' }, foundationDeviationAcknowledged: true }]
    const { path } = await project(profile)
    expect((await validateProfile(path)).errors.join('\n')).toContain('real ISO calendar date')
  })

  test('provides deterministic v2 migration guidance', async () => {
    const v2 = JSON.parse(await readFile(resolve(import.meta.dir, 'fixtures/violating/.vegastack/architecture.json'), 'utf8'))
    v2.schemaVersion = 2
    const { path } = await project(v2)
    expect((await validateProfile(path)).errors.join('\n')).toContain('profile-tool.mjs migrate-v2')
  })

  test('exposes a unique canonical catalog including v0.3 capability alignment', async () => {
    const ids = await canonicalRuleIds()
    expect(ids.size).toBe(107)
    for (const id of ['FOUND-004', 'TEN-002', 'DUR-001', 'SBX-003']) expect(ids.has(id)).toBe(true)
  })
})
