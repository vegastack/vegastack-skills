import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')

describe('the CLI and the dashboard release on one version', () => {
  test('changesets keeps the two packages in one fixed group, so a CLI-only changeset bumps both', () => {
    // `vegafactory dashboard` fetches @vegastack/vegafactory-dashboard at the CLI's own version;
    // most changesets name only the CLI, and only this group makes the versions agree by
    // construction rather than by author discipline. The Ship guard and release.yml stop a
    // mismatch, but a stop is a blocked release, not a prevented one.
    const config = JSON.parse(readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8'))
    const group = (config.fixed as string[][] | undefined)?.find((entry) => entry.includes('@vegastack/vegafactory'))
    expect(group).toBeDefined()
    expect(group!.sort()).toEqual(['@vegastack/vegafactory', '@vegastack/vegafactory-dashboard'])
  })

  test('the two manifests carry one version today', () => {
    const cli = JSON.parse(readFileSync(resolve(repoRoot, 'packages/cli/package.json'), 'utf8'))
    const dashboard = JSON.parse(readFileSync(resolve(repoRoot, 'packages/dashboard/package.json'), 'utf8'))
    expect(dashboard.version).toBe(cli.version)
  })
})
