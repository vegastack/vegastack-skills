import { describe, expect, test } from 'bun:test'
import { lintBrief } from '../scripts/brief-lint.mjs'

const quickBuildBrief = `<!-- vsk:v1 type=brief rev=1 scope=quick-build -->
## Outcome
The status script accepts a flag.
## Approach and touch points
Modify \`skills/dev-status/scripts/status.mjs\`.
## Tests and acceptance
Unit tests over the flag branches.
`

describe('brief-lint', () => {
  test('a complete quick-build brief passes', () => {
    expect(lintBrief(quickBuildBrief, 'quick-build').blocks).toEqual([])
  })
  test('unknown scope class blocks', () => {
    expect(lintBrief(quickBuildBrief, 'medium').blocks[0]).toContain('unknown scope class')
  })
  test('blocks on missing marker and missing sections', () => {
    const r = lintBrief('## Outcome\nA thing.\n', 'full-plan')
    expect(r.blocks.some((b) => b.includes('marker'))).toBe(true)
    expect(r.blocks.some((b) => b.includes('Out of scope'))).toBe(true)
  })
  test('research briefs need question + answered-when', () => {
    const ok = lintBrief('<!-- vsk:v1 type=brief rev=1 scope=research -->\n## The question\nWhy?\n## What "answered" looks like\nA report.\n', 'research')
    expect(ok.blocks).toEqual([])
    const bad = lintBrief('<!-- vsk:v1 type=brief rev=1 scope=research -->\n## The question\nWhy?\n', 'research')
    expect(bad.blocks.length).toBe(1)
  })
  test('blocks when Approach names no backticked path', () => {
    const r = lintBrief(quickBuildBrief.replace('Modify `skills/dev-status/scripts/status.mjs`.', 'Modify the status script.'), 'quick-build')
    expect(r.blocks.some((b) => b.includes('backticked paths'))).toBe(true)
  })
  test('vague wording warns, never blocks', () => {
    const r = lintBrief(quickBuildBrief.replace('accepts a flag', 'works properly and is robust'), 'quick-build')
    expect(r.blocks).toEqual([])
    expect(r.warns.length).toBeGreaterThanOrEqual(2)
  })
})
