import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readEnv } from '../src/lib/env'

const complete = {
  VEGAFACTORY_CONTROL_ROOM: '/home/mk/.vegastack/control-room/vegastack',
  VEGAFACTORY_CACHE: '/home/mk/.vegastack/cache/stats.db',
  VEGAFACTORY_ORG: 'vegastack',
  VEGAFACTORY_STATE: '/home/mk/.vegastack/factory.json',
}

test('takes the four required variables, defaults the optional ones, names what is missing', () => {
  const bare = readEnv(complete)
  expect(bare.ok && bare.env).toMatchObject({ org: 'vegastack', repos: [], viewer: null, token: null, bin: null })
  const full = readEnv({ ...complete, VEGAFACTORY_REPOS: 'vegastack/vegafactory, vegastack/site', VEGAFACTORY_GH_TOKEN: 'gho_x' })
  expect(full.ok && full.env.repos).toEqual(['vegastack/vegafactory', 'vegastack/site'])
  expect(full.ok && full.env.token).toBe('gho_x')
  expect(readEnv({ VEGAFACTORY_ORG: 'vegastack' }))
    .toEqual({ ok: false, missing: ['VEGAFACTORY_CONTROL_ROOM', 'VEGAFACTORY_CACHE', 'VEGAFACTORY_STATE'] })
})

test('the stylesheet imports the design-system preset rather than declaring colours', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/app/globals.css'), 'utf8')
  expect(css).toContain('@import "@vegastack/design/preset.css";')
  expect(css).not.toMatch(/#[0-9a-fA-F]{6}\b/)
})
