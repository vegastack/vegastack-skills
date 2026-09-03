import { beforeAll, expect, test } from 'bun:test'
import type { Db } from '../src/lib/cache/build'
import { filterOptions, parseFilters } from '../src/lib/cache/filters'
import { orgTotals, perPerson, perRepo, perSkill } from '../src/lib/cache/queries'
import { fixtureRoom, groups } from './helpers/fixture-room'

let db: Db
beforeAll(async () => { db = (await fixtureRoom()).db })
const f = (p: Record<string, string>) => parseFilters(p, filterOptions(db, groups), groups)

test('options list months newest first; an unknown value falls back before reaching SQL', () => {
  const options = filterOptions(db, groups)
  expect(options.months).toEqual(['SEP-2026', 'AUG-2026'])
  expect(options.groups).toEqual(['design', 'dev'])
  expect(f({ month: 'NOPE-1999', harness: "' or 1=1 --" })).toMatchObject({ month: 'SEP-2026', harness: null })
})

test('the month, group and harness filters narrow every aggregate the views read', () => {
  const september = orgTotals(db, f({ month: 'SEP-2026' }))
  expect(september).toMatchObject({ runs: 2, humanTouchpoints: 4 })
  expect(september.costUsd).toBeCloseTo(1.0, 6)
  expect(orgTotals(db, f({ month: 'AUG-2026' })).runs).toBe(1)
  expect(perRepo(db, f({ month: 'SEP-2026', group: 'dev' })).map((r) => r.repo)).toEqual(['vegastack/vegafactory'])
  expect(perPerson(db, f({ month: 'SEP-2026', harness: 'codex' })).map((p) => p.human)).toEqual(['dev1'])
  const skills = perSkill(db, f({ month: 'SEP-2026' }))
  expect(skills[0]).toMatchObject({ name: 'dev-plan', invocations: 1 })
  expect(skills[0]!.costPerInvocation).toBeCloseTo(0.4, 6)
})
