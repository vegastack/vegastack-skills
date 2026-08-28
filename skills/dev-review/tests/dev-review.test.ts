import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../packages/cli/scripts/validate-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

describe('dev-review contract', () => {
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

  // TODO: if this skill ships scripts/, add unit tests for every deterministic
  // branch. A prose-only skill needs nothing more here - its quality bar is the
  // behavioral eval of skillify Phase 4, which runs BEFORE tests lock anything in.
})

// Acceptance: a review comment in this skill's format is consumable by
// dev-ship's ship-gate (first-marker read, verdict key). Cross-skill import is
// test-only — tests never ship.
import { parseMarker as shipGateParseMarker } from '../../dev-ship/scripts/ship-gate.mjs'

describe('review comment ↔ ship-gate contract', () => {
  const reviewComment = `<!-- vsk:v1 type=review round=2 sha=abc1234 agent=codex verdict=clean -->
## Review — round 2 @ abc1234

**Verdict: clean** — spec: 0 · standards: 0 · security: n/a (no surface)

## Review — round 1 @ def5678

**Verdict: needs-fixes** — spec: 1 must-fix
`
  test('ship-gate reads the top marker: type, verdict, sha, agent', () => {
    const marker = shipGateParseMarker(reviewComment)
    expect(marker?.keys).toEqual({ type: 'review', round: '2', sha: 'abc1234', agent: 'codex', verdict: 'clean' })
  })
  test('appended prior rounds carry no marker, so the first marker stays current', () => {
    const afterTop = reviewComment.split('\n').slice(1).join('\n')
    expect(shipGateParseMarker(afterTop)).toBeNull()
  })
})
