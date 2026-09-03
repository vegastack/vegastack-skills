import { describe, expect, test } from 'bun:test'
import {
  ageMinutes, defaultClonePath, factoryConfigPath, isStale,
  parseControlRoomKnob, parseSyncMaxAge, readFactoryConfig, serializeFactoryConfig, withSyncResult,
} from '../src/control-room.ts'

const DEV_MD = [
  'repo: vegastack/billing · default branch main',
  '',
  '## Knobs',
  'architect: kmanojkumar',
  'control-room: vegastack/vegafactory-control-room#dev@a1b2c3d   # org control room · group · drafted-from sha',
  'sync-max-age: 30m           # how stale the clone may be before a session refreshes it',
].join('\n')

describe('control-room knob and machine state', () => {
  test('the knob carries org, repo, group and the recorded sha', () => {
    expect(parseControlRoomKnob(DEV_MD)).toEqual({
      org: 'vegastack', repo: 'vegastack/vegafactory-control-room', group: 'dev', sha: 'a1b2c3d',
    })
  })

  test('no knob, or a knob set to none, resolves to null — skill defaults apply', () => {
    expect(parseControlRoomKnob('## Knobs\nreview: subagent\n')).toBeNull()
    expect(parseControlRoomKnob('## Knobs\ncontrol-room: none\n')).toBeNull()
  })

  test('a knob a profile has never synced parses with a null sha', () => {
    expect(parseControlRoomKnob('control-room: acme/acme-control-room#platform')).toEqual({
      org: 'acme', repo: 'acme/acme-control-room', group: 'platform', sha: null,
    })
  })

  test('sync-max-age reads minutes and hours and falls back to 30 minutes', () => {
    expect(parseSyncMaxAge(DEV_MD)).toBe(30)
    expect(parseSyncMaxAge('sync-max-age: 2h')).toBe(120)
    expect(parseSyncMaxAge('## Knobs\n')).toBe(30)
    expect(parseSyncMaxAge('sync-max-age: whenever')).toBe(30)
  })

  test('one clone directory per org under the machine root', () => {
    expect(defaultClonePath('vegastack', '/home/mk')).toBe('/home/mk/.vegastack/control-room/vegastack')
    expect(factoryConfigPath('/home/mk')).toBe('/home/mk/.vegastack/factory.json')
  })

  test('a missing state file is an empty config; an unreadable one is a refusal, never a silent reset', () => {
    expect(readFactoryConfig(null)).toEqual({ schemaVersion: 1, controlRooms: {}, settings: {} })
    expect(() => readFactoryConfig('{ not json')).toThrow(/not valid JSON/)
  })

  test('age is measured from the last successful fetch; never fetched is always stale', () => {
    const now = Date.parse('2026-09-03T12:00:00Z')
    expect(ageMinutes('2026-09-03T11:15:00Z', now)).toBe(45)
    expect(ageMinutes(null, now)).toBeNull()
    expect(isStale('2026-09-03T11:15:00Z', now, 30)).toBe(true)
    expect(isStale('2026-09-03T11:45:00Z', now, 30)).toBe(false)
    expect(isStale(null, now, 30)).toBe(true)
  })

  test('recording one org never drops another, and never mutates the input', () => {
    const before = readFactoryConfig(JSON.stringify({
      schemaVersion: 1,
      controlRooms: { acme: { repo: 'acme/cr', path: '/x', branch: 'main', lastSyncedAt: '2026-09-01T00:00:00Z', sha: '0000000' } },
    }))
    const after = withSyncResult(before, 'vegastack', {
      repo: 'vegastack/vegafactory-control-room',
      path: '/home/mk/.vegastack/control-room/vegastack',
      branch: 'main', lastSyncedAt: '2026-09-03T12:00:00Z', sha: 'a1b2c3d',
    })
    expect(Object.keys(after.controlRooms).sort()).toEqual(['acme', 'vegastack'])
    expect(after.controlRooms.vegastack!.sha).toBe('a1b2c3d')
    expect(before.controlRooms.vegastack).toBeUndefined()
  })

  test('the dispatcher settings sharing this file survive a sync write, never clobbered', () => {
    const before = readFactoryConfig(JSON.stringify({
      schemaVersion: 1,
      repos: [{ path: '~/code/app', repo: 'acme/app', org: 'acme' }],
      interval: 300,
      controlRooms: {},
    }))
    const after = withSyncResult(before, 'acme', {
      repo: 'acme/cr', path: '/x', branch: 'main', lastSyncedAt: '2026-09-03T12:00:00Z', sha: 'a1b2c3d',
    })
    expect(after.settings).toEqual({ repos: [{ path: '~/code/app', repo: 'acme/app', org: 'acme' }], interval: 300 })
    expect(after.controlRooms.acme!.sha).toBe('a1b2c3d')
    const written = serializeFactoryConfig(after)
    expect(written.interval).toBe(300)
    expect(written.repos).toEqual([{ path: '~/code/app', repo: 'acme/app', org: 'acme' }])
    expect(Object.keys(written)).not.toContain('settings')
  })
})
