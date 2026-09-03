import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

describe('dev-intake contract', () => {
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

  test('a new capability asked in chat is intake, and a trivial chat fix is not', () => {
    const queries = JSON.parse(readFileSync(join(skillRoot, 'tests/fixtures/trigger-queries.json'), 'utf8'))
    const capability = queries.find((entry: { query: string }) => entry.query === 'add support for mermaid and latex')
    expect(capability).toEqual({ query: 'add support for mermaid and latex', should_trigger: true, ambiguous_with: ['dev-implement'] })
    const typo = queries.find((entry: { query: string }) => entry.query === 'fix the typo in README.md line 12, "recieve" should be "receive"')
    expect(typo).toEqual({ query: 'fix the typo in README.md line 12, "recieve" should be "receive"', should_trigger: false, ambiguous_with: ['dev-implement'] })
  })

  test('the brief template offers Priority and Effort under the Scope line', () => {
    const template = readFileSync(join(skillRoot, 'references/brief-template.md'), 'utf8')
    const scopeAt = template.indexOf('**Scope:**')
    const priorityAt = template.indexOf('**Priority:**')
    const effortAt = template.indexOf('**Effort:**')
    expect(scopeAt).toBeGreaterThan(-1)
    expect(priorityAt).toBeGreaterThan(scopeAt)
    expect(effortAt).toBeGreaterThan(priorityAt)
    expect(template).toContain('`issue-fields:`')
  })

  // TODO: if this skill ships scripts/, add unit tests for every deterministic
  // branch. A prose-only skill needs nothing more here - its quality bar is the
  // behavioral eval of skillify Phase 4, which runs BEFORE tests lock anything in.
})
