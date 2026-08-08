import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const capabilityNames = ['webControlPlane', 'flutter', 'agents', 'jobs', 'sandbox', 'connectors', 'knowledge', 'modelRouting', 'enterpriseIdentity', 'realtime', 'notifications', 'secrets'] as const
export const disabledCapabilities = () => Object.fromEntries(capabilityNames.map(name => [name, { status: 'disabled', ownership: 'not-applicable' }]))

export function baseProfile() {
  return {
    schemaVersion: 3,
    profileStatus: 'confirmed',
    foundation: { version: '0.3.0', baseline: 'vs-2026-08-07', adoption: 'supported' },
    project: { name: 'test-project', kind: 'public-product', lifecycle: 'greenfield', access: 'public', tenancy: 'none' },
    environments: { production: { hosting: 'none' }, localDevelopment: { trusted: true, allowances: [] } },
    capabilities: disabledCapabilities(),
    exceptions: []
  } as any
}

export const webCapability = (placement = 'node', extra: any = {}) => ({ status: 'enabled', ownership: 'owned', versions: { bun: '1.3.14', node: '24.18.0', next: '16.3.0', ...(placement === 'open-next-worker' ? { openNext: '1.20.2' } : {}), ...(extra.auth ? { betterAuth: '1.6.26' } : {}) }, placement, sourceRoots: ['src'], controls: { ...(extra.auth ? { secureCookies: true } : {}), ...(extra.controls ?? {}) } })
export const secretCapability = () => ({ status: 'enabled', ownership: 'owned', versions: { openbao: '2.3.2' }, placement: 'external-service', sourceRoots: ['infra/secrets'], controls: { provider: 'openbao' } })
export const agentCapability = (ownership = 'owned') => ({ status: 'enabled', ownership, versions: { eve: '0.29.5', workflowWorldContract: '5.0.0-beta.23', workflowLocal: '5.0.0-beta.32', workflowPostgres: '5.0.0-beta.30', node: '24.18.0' }, placement: ownership === 'owned' ? 'node-service' : 'shared-service', ...(ownership === 'owned' ? { sourceRoots: ['apps/eve'] } : { contract: serviceContract('shared-eve') }), controls: { workflowWorld: 'postgres', agentRun: true, ...(ownership === 'owned' ? { workflowDatabaseOwner: 'product-postgresql', agentRunOwner: 'product-control-plane' } : {}), admission: ownership === 'owned' ? 'pg-boss' : 'shared-contract' } })
export const jobsCapability = () => ({ status: 'enabled', ownership: 'owned', versions: { pgBoss: '12.27.0', postgres: '17.10' }, placement: 'node-service', sourceRoots: ['apps/jobs'], controls: { roles: ['agent-admission'], databaseOwner: 'product-postgresql' } })
export const serviceContract = (name = 'service') => ({ ownerService: `platform-${name}`, contract: name, version: '1.0.0', tenantSecurityBoundary: 'workspace-audience', identityAudience: `urn:${name}`, dataResidency: 'declared-region', sloRecovery: 'contract-slo-and-recovery', incidentOwner: 'platform-oncall', compatibility: 'semver-and-contract-tests', migrationExit: 'export-and-cutover' })

export async function writeProject(root: string, profile: any, files: Record<string, string> = {}) {
  await mkdir(join(root, '.vegastack'), { recursive: true })
  await writeFile(join(root, '.vegastack/architecture.json'), `${JSON.stringify(profile, null, 2)}\n`)
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), body)
  }
  for (const capability of Object.values(profile.capabilities ?? {}) as any[]) if (capability.status === 'enabled' && capability.ownership === 'owned') for (const sourceRoot of capability.sourceRoots ?? []) await mkdir(join(root, sourceRoot), { recursive: true })
}

export function adr(exception: any) {
  return `# ADR-001: Accepted project risk

- Status: accepted
- Date: 2026-08-07
- Project-Owner: ${exception.projectOwner}
- Scope-Paths: ${exception.paths.join(', ')}
- Rule-ID: ${exception.ruleId}
- Control-IDs: ${exception.controls ? exception.controls.join(', ') : 'all'}
- Exception-ID: ${exception.id}
- Foundation-Deviation-Acknowledged: true
- Review-Date: ${exception.review.date ?? 'none'}
- Review-Event: ${exception.review.event ?? 'none'}

## Context and facts

Confirmed project decision.

## Decision and rationale

Accept the scoped deviation.

## Risks and accepted deviation

Foundation recommendation remains unmet.

## Compensating controls

Project controls apply.

## Verification

Review the exact finding.

## Rollback or migration

Remove the deviation.

## Review trigger

Review as declared.
`
}
