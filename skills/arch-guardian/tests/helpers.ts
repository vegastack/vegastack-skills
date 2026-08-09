import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const capabilityNames = ['web', 'flutter', 'agents', 'jobs', 'sandbox', 'connectors', 'knowledge', 'models', 'realtime', 'notifications', 'enterprise-identity'] as const

export function baseProfile() {
  return {
    schemaVersion: 4,
    foundationVersion: '0.4.0',
    project: { name: 'test-project', kind: 'saas', tier: 'production', tenancy: 'none' },
    hosting: 'none',
    capabilities: [],
    notes: []
  } as any
}

export async function writeProject(root: string, profile: any, files: Record<string, string> = {}) {
  await mkdir(join(root, '.vegastack'), { recursive: true })
  await writeFile(join(root, '.vegastack/architecture.json'), `${JSON.stringify(profile, null, 2)}\n`)
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), body)
  }
}
