import { describe, expect, test } from 'bun:test'
import { parseBaseline } from '../scripts/skill-scan.mjs'

const rule = (over = {}) => ({
  id: 'P2',
  path: 'references/conventions.md',
  reason:
    'The vsk:v1 marker is the documented comment protocol. Still flag if: the comment carries an imperative aimed at the agent.',
  ...over,
})

describe('parseBaseline', () => {
  test('accepts a rule with a matcher and a clause-carrying reason', () => {
    const r = parseBaseline(JSON.stringify({ version: 2, rules: [rule()], fingerprints: [] }))
    expect(r.errors).toEqual([])
    expect(r.rules).toHaveLength(1)
  })

  test('rejects a reason with no "Still flag if:" clause', () => {
    const r = parseBaseline(
      JSON.stringify({ version: 2, rules: [rule({ reason: 'documented marker protocol' })], fingerprints: [] }),
    )
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('Still flag if:')
  })

  test('rejects the scanner placeholder reason', () => {
    const r = parseBaseline(
      JSON.stringify({
        version: 2,
        rules: [rule({ reason: 'Accepted finding (auto-generated baseline)' })],
        fingerprints: [],
      }),
    )
    expect(r.errors[0]).toContain('placeholder')
  })

  test('rejects a rule that matches everything', () => {
    const r = parseBaseline(
      JSON.stringify({ version: 2, rules: [{ reason: 'x. Still flag if: never' }], fingerprints: [] }),
    )
    expect(r.errors[0]).toContain('no matcher')
  })

  test('invalid JSON returns an error rather than throwing', () => {
    expect(parseBaseline('{not json').errors).toHaveLength(1)
  })

  test('accepts rule_id as the matcher key, the way SkillSpector does', () => {
    const r = parseBaseline(
      JSON.stringify({ version: 2, rules: [{ ...rule(), id: undefined, rule_id: 'P2' }], fingerprints: [] }),
    )
    expect(r.errors).toEqual([])
    expect(r.rules[0].id).toBe('P2')
  })

  // `skillspector baseline` writes every finding as a FINGERPRINT with a default
  // reason and an empty rules list. Enforcing the discipline only on rules would
  // let one committed auto-generated baseline suppress everything.
  test('a placeholder reason on a fingerprint is rejected too', () => {
    const r = parseBaseline(
      JSON.stringify({
        version: 2,
        rules: [],
        fingerprints: [{ hash: 'sha256:abc', rule_id: 'P2', file: 'a.md', reason: 'Accepted finding (auto-generated baseline)' }],
      }),
    )
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('placeholder')
  })

  test('a fingerprint needs a reason but not the clause — content hashing is its re-trigger', () => {
    const withReason = JSON.stringify({
      version: 2,
      rules: [],
      fingerprints: [{ hash: 'sha256:abc', reason: 'One-off: the fixture below is deliberately adversarial.' }],
    })
    expect(parseBaseline(withReason).errors).toEqual([])

    const withoutReason = JSON.stringify({ version: 2, rules: [], fingerprints: [{ hash: 'sha256:abc' }] })
    expect(parseBaseline(withoutReason).errors[0]).toContain('missing reason')
  })
})
