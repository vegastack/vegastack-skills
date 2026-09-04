import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { dashboardPaths, dashboardSpec, installArgs, launchEnv, planDashboard, portCandidates, SERVER_ENTRY } from '../src/dashboard.ts'

const base = {
  controlRoom: '/c', cacheFile: '/c/stats.db', org: 'vegastack', repos: ['vegastack/vegafactory'],
  viewer: 'mk', token: 'gho_x', bin: '/bin/vegafactory', stateFile: '/f.json', port: 7777,
}

test('the cache root is versioned, the fetch is pinned, and --dir is never fetched over', () => {
  const paths = dashboardPaths({ home: '/home/mk', version: '0.19.0', override: null })
  expect(paths.root).toBe('/home/mk/.vegastack/dashboard/0.19.0')
  expect(paths.entry).toBe(join(paths.root, 'node_modules', '@vegastack/vegafactory-dashboard', SERVER_ENTRY))
  expect(dashboardSpec('0.19.0')).toBe('@vegastack/vegafactory-dashboard@0.19.0')
  expect(installArgs({ root: '/r', version: '0.19.0' }))
    .toEqual(['install', '--prefix', '/r', dashboardSpec('0.19.0'), '--no-audit', '--no-fund', '--omit=dev'])
  expect(planDashboard({ entryExists: false, source: 'cache', dryRun: false }).action).toBe('fetch-then-launch')
  expect(planDashboard({ entryExists: true, source: 'cache', dryRun: false }).action).toBe('launch')
  expect(planDashboard({ entryExists: false, source: 'cache', dryRun: true }).action).toBe('plan')
  expect(dashboardPaths({ home: '/home/mk', version: '0.19.0', override: '/repo/packages/dashboard' }).entry)
    .toBe(join('/repo/packages/dashboard', SERVER_ENTRY))
  expect(planDashboard({ entryExists: false, source: 'override', dryRun: false })).toEqual({
    action: 'refuse',
    reason: 'the --dir tree has no dist-standalone/packages/dashboard/server.js; run bun run build && bun run assemble in it first',
  })
})

test('the launch environment is exactly the server contract, on the loopback interface', () => {
  expect(Object.keys(launchEnv({ env: base })).sort()).toEqual([
    'HOSTNAME', 'PORT', 'VEGAFACTORY_BIN', 'VEGAFACTORY_CACHE', 'VEGAFACTORY_CONTROL_ROOM',
    'VEGAFACTORY_GH_TOKEN', 'VEGAFACTORY_ORG', 'VEGAFACTORY_REPOS', 'VEGAFACTORY_STATE', 'VEGAFACTORY_VIEWER',
  ])
  expect(launchEnv({ env: base })).toMatchObject({ HOSTNAME: '127.0.0.1', PORT: '7777', VEGAFACTORY_GH_TOKEN: 'gho_x' })
  const partial = launchEnv({ env: { ...base, viewer: null, token: null } })
  expect(partial.VEGAFACTORY_VIEWER).toBeUndefined()
  expect(partial.VEGAFACTORY_GH_TOKEN).toBeUndefined()
  expect(portCandidates(7777, 3)).toEqual([7777, 7778, 7779])
})
