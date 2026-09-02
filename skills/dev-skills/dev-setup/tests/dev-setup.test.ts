import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

describe('dev-setup contract', () => {
  test('SKILL.md passes repo validation', () => {
    const result = validateSkill(skillRoot)
    expect(result.message).toBe('Skill is valid!')
    expect(result.ok).toBe(true)
  })

  test('agents-section template stays within the always-loaded budget and mirrors this repo AGENTS.md', () => {
    const template = readFileSync(join(skillRoot, 'assets/agents-section.md.template'), 'utf8')
    const body = template.split('<!-- vsk-dev:start -->')[1].split('<!-- vsk-dev:end -->')[0]
    expect(body.trim().split(/\s+/).length).toBeLessThanOrEqual(450)
    expect(body.match(/^\| .* \| .* \|$/gm)?.length).toBe(7) // header + six routing rows
    expect(body).toContain('| dev-intake, which writes the issue and never builds |')
    expect(body).toContain("| dev-implement's direct path |")
    expect(body).toContain('Local, reversible actions proceed')
    expect(body).toContain('Agent conduct:')
    const agents = readFileSync(resolve(skillRoot, '../../../AGENTS.md'), 'utf8')
    expect(agents).toContain(template.trim())
  })

  test('trigger query fixture is a small hard set with near-miss negatives', () => {
    const queries = JSON.parse(readFileSync(join(skillRoot, 'tests/fixtures/trigger-queries.json'), 'utf8'))
    const positives = queries.filter((entry: { should_trigger: boolean }) => entry.should_trigger)
    const negatives = queries.filter((entry: { should_trigger: boolean }) => !entry.should_trigger)
    expect(positives.length).toBeGreaterThanOrEqual(5)
    expect(negatives.length).toBeGreaterThanOrEqual(4)
    for (const entry of queries) expect(typeof entry.query).toBe('string')
  })

  // TODO: if this skill ships scripts/, add unit tests for every deterministic
  // branch. A prose-only skill needs nothing more here - its quality bar is the
  // behavioral eval of skillify Phase 4, which runs BEFORE tests lock anything in.
})
