import { expect, test } from 'bun:test'
import { buildPeopleView, buildPersonView } from '../src/lib/views/people'
import { buildSkillsView } from '../src/lib/views/skills'
import { contextFixture } from './helpers/context'

test('a lead sees every person, and only while stats-people is on', async () => {
  const view = buildPeopleView({ context: await contextFixture({ month: 'SEP-2026', viewer: 'kmanojkumar', statsPeople: 'on' }) })
  expect(view.gated).toBe(false)
  expect(view.rows.map((r) => r.login).sort()).toEqual(['dev1', 'kmanojkumar'])
  const off = buildPeopleView({ context: await contextFixture({ month: 'SEP-2026', viewer: 'kmanojkumar', statsPeople: 'off' }) })
  expect(off.rows.map((r) => r.login)).toEqual(['kmanojkumar'])
})

test('a non-lead sees only themselves; another person refuses with no data; skills roll up', async () => {
  const context = await contextFixture({ month: 'SEP-2026', viewer: 'dev1', statsPeople: 'on' })
  const view = buildPeopleView({ context })
  expect(view.gated).toBe(true)
  expect(view.rows.map((r) => r.login)).toEqual(['dev1'])
  expect(buildPersonView({ context, login: 'kmanojkumar' }))
    .toMatchObject({ gate: { allowed: false }, person: null, totals: null })
  const skills = buildSkillsView({ context, orgSkills: { 'dev-plan': 40 } })
  expect(skills.rows[0]).toMatchObject({ name: 'dev-plan', invocations: 1, triggers: { model: 1 }, outcomes: { 'for-operator': 1 } })
  expect(skills.rows[0]!.costPerInvocation).toBeCloseTo(0.4, 6)
  expect(skills.orgTotals).toEqual({ 'dev-plan': 40 })
})
