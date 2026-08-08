import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { checkArchitecture, summarize } from '../scripts/architecture-check.mjs'
import { adr, agentCapability, baseProfile, jobsCapability, secretCapability, webCapability, writeProject } from './helpers'

const created: string[] = []
async function project(profile: any, files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'guardian-check-'))
  created.push(root)
  await writeProject(root, profile, files)
  return root
}
afterEach(async () => { while (created.length) await rm(created.pop()!, { recursive: true, force: true }) })

describe('capability-aware architecture checks', () => {
  test('passes the compliant fixture with explicit NOT VERIFIED qualification', async () => {
    const findings = await checkArchitecture(resolve(import.meta.dir, 'fixtures/compliant'))
    expect(summarize(findings).status).toBe('PASS')
    expect(findings.some(item => item.status === 'NOT_VERIFIED' && item.reason && item.risk && item.owner && item.nextAction)).toBe(true)
  })

  test('web-only public product does not require auth, SQL, EVE, jobs, or sandbox', async () => {
    const profile = baseProfile()
    profile.environments.production.hosting = 'self-hosted'
    profile.capabilities.webControlPlane = webCapability()
    const root = await project(profile, { 'src/index.ts': "import 'next/server'\nexport const ok = true\n" })
    const findings = await checkArchitecture(root)
    expect(summarize(findings).status).toBe('PASS')
    for (const rule of ['AUTH-001', 'AUTH-003', 'TEN-002', 'DUR-001', 'DUR-003', 'SBX-001']) expect(findings.some(item => item.status === 'FAIL' && item.rule === rule)).toBe(false)
  })

  test('agentic product without Flutter activates agents/jobs but not mobile checks', async () => {
    const profile = baseProfile()
    profile.project.kind = 'platform-service'
    profile.capabilities.agents = agentCapability()
    profile.capabilities.jobs = jobsCapability()
    const root = await project(profile, { 'apps/eve/runtime.ts': "import { run } from 'eve'\nexport { run }\n", 'apps/jobs/runtime.ts': "import PgBoss from 'pg-boss'\nexport { PgBoss }\n" })
    const findings = await checkArchitecture(root)
    expect(summarize(findings).status).toBe('PASS')
    expect(findings.some(item => item.rule.startsWith('MOB-') && item.status === 'FAIL')).toBe(false)
  })

  test('detects profile/code capability drift in both directions', async () => {
    const disabled = baseProfile()
    let root = await project(disabled, { 'src/agent.ts': "import { run } from 'eve'\nexport { run }\n" })
    let findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'capability.agents.undeclared')).toBe(true)

    const missing = baseProfile()
    missing.capabilities.knowledge = { status: 'enabled', ownership: 'owned', versions: { knowledge: '1.0.0' }, placement: 'node', sourceRoots: ['packages/knowledge'], controls: {} }
    root = await project(missing)
    findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'capability.knowledge.missing-code')).toBe(true)
  })

  test('continues observational security scanning when the profile is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'guardian-no-profile-'))
    created.push(root)
    await Bun.write(join(root, '.env'), 'API_KEY=supersecretvalue123\n')
    const findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'profile.present')).toBe(true)
    expect(findings.some(item => item.control === 'secret.plaintext')).toBe(true)
  })

  test('finds unquoted root .env secrets with file and line evidence', async () => {
    const profile = baseProfile()
    profile.capabilities.secrets = secretCapability()
    const root = await project(profile, { '.env': 'PUBLIC=value\nAPI_KEY=supersecretvalue123\n' })
    const finding = (await checkArchitecture(root)).find(item => item.control === 'secret.plaintext')!
    expect(finding.path).toBe('.env')
    expect(finding.evidence.line).toBe(2)
  })

  test('scopes production evidence, honors local-secret allowance, and scans non-JS source', async () => {
    const profile = baseProfile()
    profile.environments.localDevelopment.allowances = ['local-secrets']
    let root = await project(profile, {
      '.env.local': 'API_KEY=trustedlocalvalue123\n',
      'docs/example.md': 'API_KEY=documentationvalue123 connector\n',
      'tests/example.py': 'STRIPE_SECRET_KEY = "fixturesecretvalue123"\n'
    })
    let findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'secret.plaintext')).toBe(false)
    expect(findings.some(item => item.control === 'capability.connectors.undeclared')).toBe(false)

    root = await project(profile, { 'src/config.py': 'STRIPE_SECRET_KEY = "productionsecretvalue123"\n' })
    findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'secret.plaintext' && item.path === 'src/config.py')).toBe(true)
  })

  test('rejects permissive RLS predicates and accepts policies split across migrations', async () => {
    const profile = baseProfile()
    profile.project.kind = 'platform-service'
    profile.project.access = 'internal'
    profile.project.tenancy = 'multi-tenant-shared-schema'
    const create = 'CREATE TABLE resources (workspace_id uuid NOT NULL, id uuid NOT NULL, PRIMARY KEY (workspace_id, id));\n'
    const context = `export const q = "SELECT set_config('app.workspace_id', $1, true)"\n`
    let root = await project(profile, { 'db/001.sql': create, 'db/002.sql': 'ALTER TABLE resources ENABLE ROW LEVEL SECURITY;\nALTER TABLE resources FORCE ROW LEVEL SECURITY;\nCREATE POLICY p ON resources USING (true) WITH CHECK (true);\n', 'src/db.ts': context })
    let findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'tenancy.rls-policy')).toBe(true)

    root = await project(profile, { 'db/001.sql': create, 'db/002.sql': "ALTER TABLE resources ENABLE ROW LEVEL SECURITY;\nALTER TABLE resources FORCE ROW LEVEL SECURITY;\nCREATE POLICY p ON resources USING (workspace_id = current_setting('app.workspace_id')::uuid) WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid);\n", 'src/db.ts': context })
    findings = await checkArchitecture(root)
    expect(findings.some(item => item.rule.startsWith('TEN-') && item.status === 'FAIL')).toBe(false)
  })

  test('binds RLS policies to the correct table, permits command-specific splits, and checks privileged paths', async () => {
    const profile = baseProfile()
    profile.project.tenancy = 'multi-tenant-shared-schema'
    const tables = 'CREATE TABLE alpha (workspace_id uuid NOT NULL, id uuid NOT NULL, PRIMARY KEY (workspace_id, id));\nCREATE TABLE beta (workspace_id uuid NOT NULL, id uuid NOT NULL, PRIMARY KEY (workspace_id, id));\nALTER TABLE alpha ENABLE ROW LEVEL SECURITY; ALTER TABLE alpha FORCE ROW LEVEL SECURITY; ALTER TABLE beta ENABLE ROW LEVEL SECURITY; ALTER TABLE beta FORCE ROW LEVEL SECURITY;\n'
    const alphaOnly = "CREATE POLICY alpha_all ON alpha USING (workspace_id = current_setting('app.workspace_id')::uuid) WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid);\n"
    let root = await project(profile, { 'db/001.sql': tables + alphaOnly, 'src/db.ts': `export const q = "SELECT set_config('app.workspace_id', $1, true)"\n` })
    let findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'tenancy.rls-policy' && item.message.includes('beta'))).toBe(true)

    const split = "CREATE POLICY beta_read ON beta FOR SELECT USING (workspace_id = current_setting('app.workspace_id')::uuid);\nCREATE POLICY beta_write ON beta FOR INSERT WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid);\n"
    root = await project(profile, { 'db/001.sql': tables + alphaOnly + split, 'src/db.ts': `export const q = "SELECT set_config('app.workspace_id', $1, true)"\n` })
    findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'tenancy.rls-policy')).toBe(false)

    const definer = "CREATE FUNCTION unsafe_lookup() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;\n"
    root = await project(profile, { 'db/001.sql': tables + alphaOnly + split + definer, 'src/db.ts': `export const q = "SELECT set_config('app.workspace_id', $1, true)"\n` })
    findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'tenancy.security-definer' && item.rule === 'TEN-004')).toBe(true)
  })

  test('valid project-owner exception makes CI pass but remains EXCEPTED with rejection verdict', async () => {
    const profile = baseProfile()
    profile.capabilities.secrets = secretCapability()
    const exception = { id: 'EXC-101', ruleId: 'SEC-002', controls: ['secret.plaintext'], paths: ['.env'], adr: 'docs/adr-101.md', projectOwner: 'product-owner', status: 'active', verificationType: 'static-sentinel', rationale: 'temporary migration', decision: 'accept for migration', risks: ['credential disclosure'], compensatingControls: ['restricted environment'], verification: ['secret scan'], rollbackOrMigration: 'move to OpenBao', review: { date: '2099-01-01' }, foundationDeviationAcknowledged: true }
    profile.exceptions = [exception]
    const root = await project(profile, { '.env': 'API_KEY=supersecretvalue123\n', 'infra/secrets/config.yaml': 'provider: openbao\n', [exception.adr]: adr(exception) })
    const findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
    const summary = summarize(findings)
    expect(summary.status).toBe('PASS')
    expect(summary.verdict).toBe('GUARDIAN VERDICT: REJECT')
    expect(findings.some(item => item.status === 'EXCEPTED' && item.exceptionId === exception.id && item.rule === 'SEC-002')).toBe(true)
  })

  test('committed critical-risk fixture exits cleanly with visible EXCEPTED status', async () => {
    const findings = await checkArchitecture(resolve(import.meta.dir, 'fixtures/excepted'), { now: '2026-08-07T00:00:00Z' })
    expect(summarize(findings).status).toBe('PASS')
    expect(findings.some(item => item.status === 'EXCEPTED' && item.rule === 'SEC-002')).toBe(true)
  })

  test('invalid, expired, and mismatched exceptions fail without broad suppression', async () => {
    for (const variant of ['invalid', 'expired', 'mismatched']) {
      const profile = baseProfile()
      profile.capabilities.secrets = secretCapability()
      const exception: any = { id: 'EXC-102', ruleId: 'SEC-002', controls: ['secret.plaintext'], paths: [variant === 'mismatched' ? 'config/other.env' : '.env'], adr: 'docs/adr-102.md', projectOwner: 'product-owner', status: 'active', verificationType: 'static-sentinel', rationale: 'temporary', decision: 'accept', risks: ['disclosure'], compensatingControls: ['monitor'], verification: ['scan'], rollbackOrMigration: 'remove', review: { date: variant === 'expired' ? '2026-01-01' : '2099-01-01' }, foundationDeviationAcknowledged: true }
      profile.exceptions = [exception]
      const root = await project(profile, { '.env': 'API_KEY=supersecretvalue123\n', 'infra/secrets/config.yaml': 'provider: openbao\n', [exception.adr]: variant === 'invalid' ? '# malformed\n' : adr(exception) })
      const findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
      expect(summarize(findings).status).toBe('FAIL')
      if (variant === 'mismatched') expect(findings.some(item => item.control === 'exception.scope-match')).toBe(true)
      else expect(findings.some(item => item.control === 'exception.validity')).toBe(true)
    }
  })

  test('does not allow an ADR to suppress structural profile or exception-validity failures', async () => {
    const profile = baseProfile()
    profile.unexpected = true
    const exception = { id: 'EXC-103', ruleId: 'FOUND-001', controls: ['profile.schema'], paths: ['.vegastack/architecture.json'], adr: 'docs/adr-103.md', projectOwner: 'product-owner', status: 'active', verificationType: 'static-sentinel', rationale: 'accept invalid shape', decision: 'continue temporarily', risks: ['tooling ambiguity'], compensatingControls: ['manual review'], verification: ['schema review'], rollbackOrMigration: 'remove extra field', review: { date: '2099-01-01' }, foundationDeviationAcknowledged: true }
    profile.exceptions = [exception]
    const root = await project(profile, { [exception.adr]: adr(exception) })
    const findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
    expect(summarize(findings).status).toBe('FAIL')
    expect(findings.some(item => item.control === 'profile.schema' && item.status === 'FAIL')).toBe(true)
    expect(findings.some(item => item.control === 'exception.scope-match' && item.status === 'FAIL')).toBe(true)
  })

  test('manual exceptions must exactly match an emitted NOT VERIFIED finding', async () => {
    const profile = baseProfile()
    const exception = { id: 'EXC-104', ruleId: 'REL-001', controls: ['reliability.objectives'], paths: ['.vegastack/architecture.json'], adr: 'docs/adr-104.md', projectOwner: 'product-owner', status: 'active', verificationType: 'manual-qualification', rationale: 'pre-launch objective decision', decision: 'accept temporarily', risks: ['unqualified capacity'], compensatingControls: ['limited launch'], verification: ['load test'], rollbackOrMigration: 'define measured objectives', review: { date: '2099-01-01' }, foundationDeviationAcknowledged: true }
    profile.exceptions = [exception]
    let root = await project(profile, { [exception.adr]: adr(exception) })
    let findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
    expect(summarize(findings).status).toBe('PASS')
    expect(findings.some(item => item.status === 'EXCEPTED' && item.exceptionId === exception.id && item.control === 'reliability.objectives')).toBe(true)

    profile.exceptions[0].paths = ['docs/objectives.md']
    root = await project(profile, { [exception.adr]: adr(profile.exceptions[0]) })
    findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
    expect(summarize(findings).status).toBe('FAIL')
    expect(findings.some(item => item.control === 'exception.scope-match')).toBe(true)
  })

  test('governs candidate foundation adoption through an exact project ADR', async () => {
    const profile = baseProfile()
    profile.foundation.baseline = 'candidate'
    profile.foundation.adoption = 'candidate'
    const exception = { id: 'EXC-105', ruleId: 'PKG-003', controls: ['foundation.non-supported-adoption'], paths: ['.vegastack/architecture.json'], adr: 'docs/adr-105.md', projectOwner: 'product-owner', status: 'active', verificationType: 'static-sentinel', rationale: 'qualification branch', decision: 'adopt candidate temporarily', risks: ['protocol incompatibility'], compensatingControls: ['isolated rollout'], verification: ['replay suite'], rollbackOrMigration: 'return to supported baseline', review: { date: '2099-01-01' }, foundationDeviationAcknowledged: true }
    profile.exceptions = [exception]
    const root = await project(profile, { [exception.adr]: adr(exception) })
    const findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
    expect(summarize(findings).status).toBe('PASS')
    expect(findings.some(item => item.status === 'EXCEPTED' && item.control === 'foundation.non-supported-adoption')).toBe(true)
  })

  test('Cloudflare web-only passes while owned agent/job placement in the Worker fails', async () => {
    const profile = baseProfile()
    profile.environments.production.hosting = 'cloudflare-opennext'
    profile.capabilities.webControlPlane = webCapability('open-next-worker')
    let root = await project(profile, { 'src/index.ts': "import '@opennextjs/cloudflare'\n" })
    expect(summarize(await checkArchitecture(root)).status).toBe('PASS')
    profile.capabilities.agents = { ...agentCapability(), placement: 'open-next-worker' }
    profile.capabilities.jobs = { ...jobsCapability(), placement: 'open-next-worker' }
    root = await project(profile, { 'src/index.ts': "import '@opennextjs/cloudflare'\n", 'apps/eve/index.ts': "import 'eve'\n", 'apps/jobs/index.ts': "import 'pg-boss'\n" })
    const findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'hosting.agents-placement')).toBe(true)
    expect(findings.some(item => item.control === 'hosting.jobs-placement')).toBe(true)
  })

  test('honors .guardianignore prefixes and downgrades generated bundles to one NOT VERIFIED note', async () => {
    const profile = baseProfile()
    profile.capabilities.secrets = secretCapability()
    const root = await project(profile, {
      '.guardianignore': '# deliberate exclusions\nvendor-copied\n',
      'vendor-copied/.env': 'API_KEY=supersecretvalue123\n',
      'generated/bundle.js': `export const blob = "${'a'.repeat(6000)}"\n`,
      'infra/secrets/config.yaml': 'provider: openbao\n'
    })
    const findings = await checkArchitecture(root)
    expect(findings.some(item => item.control === 'secret.plaintext')).toBe(false)
    const notes = findings.filter(item => item.control === 'inspection.traversal' && item.status === 'NOT_VERIFIED')
    expect(notes).toHaveLength(1)
    expect(notes[0].message).toContain('generated/bundled')
  })

  test('caps repeated identical-control findings and records the suppressed count', async () => {
    const profile = baseProfile()
    profile.capabilities.secrets = secretCapability()
    const lines = Array.from({ length: 30 }, (_, index) => `API_KEY=supersecretvalue${index}00\n`).join('')
    const root = await project(profile, { '.env': lines, 'infra/secrets/config.yaml': 'provider: openbao\n' })
    const findings = await checkArchitecture(root)
    const plaintext = findings.filter(item => item.control === 'secret.plaintext' && item.status === 'FAIL')
    expect(plaintext).toHaveLength(25)
    expect(plaintext.at(-1)!.suppressedCount).toBe(5)
    expect(summarize(findings).suppressedFindings).toBe(5)
  })

  test('discovers a legacy .yaml-named JSON profile with unchanged verdict semantics', async () => {
    const root = await mkdtemp(join(tmpdir(), 'guardian-legacy-'))
    created.push(root)
    const profile = baseProfile()
    await writeProject(root, profile)
    const { rename } = await import('node:fs/promises')
    await rename(join(root, '.vegastack/architecture.json'), join(root, '.vegastack/architecture.yaml'))
    const findings = await checkArchitecture(root)
    expect(summarize(findings).status).toBe('PASS')
    expect(findings.some(item => item.control === 'profile.present')).toBe(false)
  })

  test('a rule-level exception without controls covers every control under its rule via an all-controls ADR', async () => {
    const profile = baseProfile()
    profile.capabilities.secrets = secretCapability()
    const exception: any = { id: 'EXC-106', ruleId: 'SEC-002', paths: ['.env'], adr: 'docs/adr-106.md', projectOwner: 'product-owner', status: 'active', verificationType: 'static-sentinel', rationale: 'migration window', decision: 'accept all SEC-002 controls on this path', risks: ['credential disclosure'], compensatingControls: ['restricted environment'], verification: ['secret scan'], rollbackOrMigration: 'move to OpenBao', review: { date: '2099-01-01' }, foundationDeviationAcknowledged: true }
    profile.exceptions = [exception]
    const root = await project(profile, { '.env': 'API_KEY=supersecretvalue123\nAUTHZ="Bearer hardcodedtokenvalue"\n', 'infra/secrets/config.yaml': 'provider: openbao\n', [exception.adr]: adr(exception) })
    const findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
    const summary = summarize(findings)
    expect(summary.status).toBe('PASS')
    expect(summary.verdict).toBe('GUARDIAN VERDICT: REJECT')
    const excepted = findings.filter(item => item.status === 'EXCEPTED' && item.exceptionId === exception.id)
    expect(new Set(excepted.map(item => item.control)).size).toBeGreaterThanOrEqual(1)
    expect(findings.some(item => item.status === 'FAIL' && item.rule === 'SEC-002')).toBe(false)
  })

  test('a rule-level exception whose ADR lacks Control-IDs: all is invalid', async () => {
    const profile = baseProfile()
    profile.capabilities.secrets = secretCapability()
    const exception: any = { id: 'EXC-107', ruleId: 'SEC-002', paths: ['.env'], adr: 'docs/adr-107.md', projectOwner: 'product-owner', status: 'active', verificationType: 'static-sentinel', rationale: 'migration window', decision: 'accept', risks: ['disclosure'], compensatingControls: ['monitor'], verification: ['scan'], rollbackOrMigration: 'remove', review: { date: '2099-01-01' }, foundationDeviationAcknowledged: true }
    profile.exceptions = [exception]
    const badAdr = adr({ ...exception, controls: ['secret.plaintext'] })
    const root = await project(profile, { '.env': 'API_KEY=supersecretvalue123\n', 'infra/secrets/config.yaml': 'provider: openbao\n', [exception.adr]: badAdr })
    const findings = await checkArchitecture(root, { now: '2026-08-07T00:00:00Z' })
    expect(summarize(findings).status).toBe('FAIL')
    expect(findings.some(item => item.control === 'exception.validity')).toBe(true)
  })

  test('detects the deliberate conditional violating fixture', async () => {
    const findings = await checkArchitecture(resolve(import.meta.dir, 'fixtures/violating'))
    const rules = new Set(findings.filter(item => item.status === 'FAIL').map(item => item.rule))
    for (const rule of ['FOUND-002', 'DUR-001', 'DUR-003', 'RUN-001', 'RUN-002', 'SEC-002', 'SBX-002', 'SBX-003', 'AUTH-003', 'AUTH-006', 'TEN-002', 'TEN-003']) expect(rules.has(rule)).toBe(true)
  })
})
