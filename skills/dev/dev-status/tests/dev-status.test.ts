import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

describe('dev-status contract', () => {
  test('SKILL.md passes repo validation', () => {
    const result = validateSkill(skillRoot)
    expect(result.message).toBe('Skill is valid!')
    expect(result.ok).toBe(true)
  })

  test('trigger query fixture is a small hard set with near-miss negatives', () => {
    const queries = JSON.parse(readFileSync(join(skillRoot, 'tests/fixtures/trigger-queries.json'), 'utf8'))
    const positives = queries.filter((entry: { should_trigger: boolean }) => entry.should_trigger)
    const negatives = queries.filter((entry: { should_trigger: boolean }) => !entry.should_trigger)
    expect(positives.length).toBeGreaterThanOrEqual(5)
    expect(negatives.length).toBeGreaterThanOrEqual(4)
    for (const entry of queries) expect(typeof entry.query).toBe('string')
  })

  test('every eval case that asserts on the control room attaches a fixture carrying that field in the state it names', () => {
    // Case 5 (synced, one drifted knob) and case 6 (never synced) are the only coverage the drift
    // render rule has; a prompt describing a field its attachment lacks tests nothing.
    const evals = JSON.parse(readFileSync(join(skillRoot, 'evals/evals.json'), 'utf8'))
    const byId = (id: number) => evals.evals.find((e: { id: number }) => e.id === id)
    const synced = JSON.parse(readFileSync(join(skillRoot, byId(5).files[0]), 'utf8'))
    expect(synced.controlRoom).toMatchObject({ available: true, recordedSha: 'a1b2c3d', cloneSha: 'e4f5a6b', behind: true })
    expect(synced.controlRoom.knobs).toHaveLength(1)
    expect(byId(5).assertions.join(' ')).toContain(synced.controlRoom.knobs[0].knob)
    const unsynced = JSON.parse(readFileSync(join(skillRoot, byId(6).files[0]), 'utf8'))
    expect(unsynced.controlRoom).toMatchObject({ available: false })
    expect(unsynced.controlRoom.reason).toContain('vegafactory sync')
    expect(unsynced.controlRoom.knobs).toBeUndefined()
    expect(byId(6).assertions.join(' ')).toContain('not synced')
  })

})
