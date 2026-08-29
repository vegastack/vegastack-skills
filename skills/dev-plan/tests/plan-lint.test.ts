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
  - Steps: failing test:

    \`\`\`js
    expect(doThing('a')).toBe(1)
    \`\`\`

    → run red → implement → run green → commit
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
  test('a failing-test Steps task without a fenced block is blocked; the fenced fixture passes', () => {
    const unfenced = goodPlan.replace(/  - Steps: failing test:[\s\S]*?→ run red/, '  - Steps: write the failing test → run red')
    expect(unfenced.includes('```')).toBe(false)
    expect(lintPlan(unfenced).blocks.some((b) => b.includes('fenced'))).toBe(true)
    expect(lintPlan(goodPlan).blocks).toEqual([])
  })
  test('a Task line missing its checkbox is detected, not absorbed', () => {
    const bad = goodPlan + '\n**Task 2: sneaky no-checkbox task**\n  - Files — Modify: `x.ts`\n  - Interfaces — Produces: nothing\n  - Steps: edit → verify → commit\n'
    expect(lintPlan(bad).blocks.some((b) => b.includes('without a checkbox'))).toBe(true)
  })
  test('ticked checkboxes still count as tasks', () => {
    expect(lintPlan(goodPlan.replace('- [ ]', '- [x]')).blocks).toEqual([])
  })
})
