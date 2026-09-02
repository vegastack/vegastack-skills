import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

describe('dev-chronicle contract', () => {
  test('SKILL.md passes repo validation', () => {
    const result = validateSkill(skillRoot)
    expect(result.message).toBe('Skill is valid!')
    expect(result.ok).toBe(true)
  })

  test('SKILL.md routes to references/styles.md and names both style knobs', () => {
    const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8')
    expect(skill).toContain('](references/styles.md)')
    expect(skill).toContain('`chronicle-style:`')
    expect(skill).toContain('`emoji:`')
  })

  test('styles.md carries one worked example per style, each closed by a one-line rationale', () => {
    const styles = readFileSync(join(skillRoot, 'references/styles.md'), 'utf8')
    for (const style of ['plain', 'story', 'witty']) expect(styles).toContain(`### Example — ${style}`)
    const examples = styles.match(/<example>[\s\S]*?<\/example>/g) ?? []
    expect(examples.length).toBe(3)
    for (const block of examples) {
      expect(block.match(/<rationale>[^\n]+<\/rationale>/g)?.length).toBe(1)
      for (const keyword of ['reminderAt', 'send-reminders', 'pg-boss', '--dry-run']) expect(block).toContain(keyword)
    }
    expect(styles).not.toContain('<!--')
  })

  test('styles.md is packaged', () => {
    const packaging = JSON.parse(readFileSync(join(skillRoot, '../../../packages/cli/packaging.json'), 'utf8'))
    expect(packaging['dev-chronicle']).toContain('references/styles.md')
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
