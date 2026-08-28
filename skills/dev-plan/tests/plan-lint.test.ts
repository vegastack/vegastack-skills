import { describe, expect, test } from 'bun:test'
import { bannedPlaceholders, lintPlan } from '../scripts/plan-lint.mjs'

const goodPlan = `<!-- vsk:v1 type=plan rev=1 -->
## Plan (v1)
**Goal:** a thing exists.
**Approach:** the simple way; alternative B lost on cost.
**Constraints:**
- Node >= 24

### Tasks
- [ ] **Task 1: build it**
  - Files — Create: \`skills/x/scripts/x.mjs\` · Test: \`skills/x/tests/x.test.ts\`
  - Interfaces — Produces: \`doThing(input: string): number\`
  - Steps: failing test → run red → implement → run green → commit
`

describe('plan-lint', () => {
  test('a complete plan passes', () => {
    expect(lintPlan(goodPlan).blocks).toEqual([])
  })
  test('blocks on missing marker', () => {
    const r = lintPlan(goodPlan.replace(/<!--[^>]*-->\n/, ''))
    expect(r.blocks.some((b) => b.includes('marker'))).toBe(true)
  })
  test('blocks every banned placeholder — one realistic phrase per pattern', () => {
    const phrases = [
      'TBD', 'TODO', 'we can implement later', 'fill in details here',
      'add appropriate error handling', 'then add validation', 'we will handle edge cases',
      'write tests for the above', 'similar to Task 2',
    ]
    expect(phrases.length).toBe(bannedPlaceholders.length)
    for (const phrase of phrases) {
      const r = lintPlan(goodPlan.replace('the simple way', phrase))
      expect(r.blocks.some((b) => b.includes('banned placeholder'))).toBe(true)
    }
  })
  test('blocks a plan with no checkbox tasks', () => {
    const r = lintPlan(goodPlan.replace('- [ ] **Task 1: build it**', '**Task 1: build it**'))
    expect(r.blocks.some((b) => b.includes('no checkbox tasks'))).toBe(true)
  })
  test('blocks tasks missing Files, Interfaces, or Steps', () => {
    for (const cut of ['Files —', 'Interfaces —', 'Steps:']) {
      const r = lintPlan(goodPlan.replace(cut, 'X —'))
      expect(r.blocks.length).toBeGreaterThan(0)
    }
  })
  test('ticked checkboxes still count as tasks', () => {
    expect(lintPlan(goodPlan.replace('- [ ]', '- [x]')).blocks).toEqual([])
  })
})
