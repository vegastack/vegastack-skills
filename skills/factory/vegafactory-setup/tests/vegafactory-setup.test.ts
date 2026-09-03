import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

describe('vegafactory-setup contract', () => {
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


  const assets = resolve(skillRoot, 'assets/control-room')

  test('every control-room template is packaged, and packaging lists them in tree order', () => {
    const packaging = JSON.parse(
      readFileSync(resolve(skillRoot, '../../../packages/cli/packaging.json'), 'utf8'),
    ) as Record<string, string[]>
    const templates = packaging['vegafactory-setup'].filter((p) => p.startsWith('assets/control-room/'))
    expect(templates).toEqual([
      'assets/control-room/org.md.template',
      'assets/control-room/people.csv.template',
      'assets/control-room/decisions.md.template',
      'assets/control-room/group.md.template',
      'assets/control-room/repos.md.template',
      'assets/control-room/boards.md.template',
      'assets/control-room/rules/README.md.template',
      'assets/control-room/rules/CODEOWNERS.template',
      'assets/control-room/templates/README.md.template',
      'assets/control-room/onboarding/new-repo.md.template',
      'assets/control-room/onboarding/new-teammate.md.template',
    ])
    for (const path of templates) expect(existsSync(resolve(skillRoot, path))).toBe(true)
  })

  test('people.csv template carries the exact column header the layering rule reads', () => {
    const csv = readFileSync(join(assets, 'people.csv.template'), 'utf8')
    expect(csv.split('\n')[0]).toBe('login,name,role,slack,timezone,groups')
  })

  test('group.md template carries a default for every knob a repo dev.md can hold', () => {
    const group = readFileSync(join(assets, 'group.md.template'), 'utf8')
    for (const knob of [
      'review:', 'gates:', 'merge:', 'branch:', 'labels:', 'tests:', 'changelog:', 'release:',
      'chronicle:', 'chronicle-style:', 'emoji:', 'evidence-repo:', 'architect:', 'operators:',
      'harness:', 'dispatcher:', 'ship-environments:', 'design-system:', 'secrets:', 'gh-floor:', 'stats:',
    ]) expect(group).toContain(knob)
  })

  test('org.md template holds the global policy only, never a department knob', () => {
    const org = readFileSync(join(assets, 'org.md.template'), 'utf8')
    expect(org).toMatch(/^stats: on$/m)
    expect(org).toMatch(/^stats-people: off$/m)
    expect(org).toMatch(/^stats-override: allowed$/m)
    for (const knob of ['review:', 'gates:', 'merge:', 'harness:']) expect(org).not.toContain(knob)
  })

  test('no template carries a secret value, only secret names', () => {
    for (const file of ['org.md.template', 'group.md.template']) {
      const body = readFileSync(join(assets, file), 'utf8')
      expect(body).not.toMatch(/(ghp_|sk-|AKIA)[A-Za-z0-9]/)
    }
  })

  // TODO: if this skill ships scripts/, add unit tests for every deterministic
  // branch. A prose-only skill needs nothing more here - its quality bar is the
  // behavioral eval of skillify Phase 4, which runs BEFORE tests lock anything in.
})
