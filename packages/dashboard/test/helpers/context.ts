import { filterOptions, parseFilters } from '../../src/lib/cache/filters'
import type { PageContext } from '../../src/lib/context'
import { freshnessFrom } from '../../src/lib/freshness'
import { parsePeopleCsv } from '../../src/lib/control-room/people'
import { fixtureRoom, groups } from './fixture-room'

const people = parsePeopleCsv([
  'login,name,role,slack,timezone,groups',
  'kmanojkumar,MK,lead,U1,Asia/Kolkata,dev',
  'dev1,Dev One,engineer,U2,Asia/Kolkata,dev',
].join('\n'))

// The PageContext a view test needs, built off Task 4's fixture room. It assembles the same
// pieces loadContext does; what it deliberately does not do is read process.env, so a view test
// never depends on the machine it runs on.
export async function contextFixture(options: {
  month: string
  viewer?: string | null
  statsPeople?: 'on' | 'off'
}): Promise<PageContext> {
  const { root, db } = await fixtureRoom()
  const filterList = filterOptions(db, groups)
  return {
    env: {
      controlRoom: root,
      cacheFile: `${root}/stats.db`,
      org: 'vegastack',
      repos: Object.keys(groups),
      stateFile: `${root}/factory.json`,
      version: '0.0.0',
      viewer: options.viewer ?? null,
      token: null,
      bin: null,
    },
    db,
    options: filterList,
    // The month is set literally rather than through parseFilters' fallback, so a test can ask
    // for a month the fixture has no runs in and see the empty view.
    filters: { ...parseFilters({ month: options.month }, filterList, groups), month: options.month },
    repoGroups: groups,
    people,
    policy: { stats: 'on', statsPeople: options.statsPeople ?? 'off' },
    freshness: freshnessFrom({ factoryJson: null, org: 'vegastack', now: Date.now(), liveOk: true }),
  }
}
