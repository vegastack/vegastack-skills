import { describe, expect, test } from 'bun:test'
import { checkTriggers, normalizeQuery } from '../scripts/trigger-check.mjs'

const entry = (query: string, should_trigger: boolean, ambiguous_with?: string[]) =>
  ambiguous_with ? { query, should_trigger, ambiguous_with } : { query, should_trigger }
const eight = (prefix: string) => Array.from({ length: 8 }, (_, i) => entry(`${prefix} filler ${i}`, i % 2 === 0))
const fixture = (skill: string, entries: unknown) => ({ file: `skills/${skill}/tests/fixtures/trigger-queries.json`, data: entries })
const family = (a: unknown[], b: unknown[]) => new Map<string, any>([['alpha', fixture('alpha', a)], ['beta', fixture('beta', b)]])

describe('normalizeQuery', () => {
  test('case, whitespace, and trailing punctuation fold together', () => {
    expect(normalizeQuery('  Plan  Issue 42?  ')).toBe('plan issue 42')
    expect(normalizeQuery('plan issue 42...')).toBe('plan issue 42')
    expect(normalizeQuery('PLAN\tissue\n42!')).toBe('plan issue 42')
  })
  test('interior punctuation survives', () => {
    expect(normalizeQuery("what's the status, really")).toBe("what's the status, really")
  })
})

describe('checkTriggers', () => {
  test('a clean family has no blocks and no warns', () => {
    expect(checkTriggers(family(eight('a'), eight('b')))).toEqual({ blocks: [], warns: [] })
  })
  test('two positives on one normalised query block unless mutual', () => {
    const r = checkTriggers(family([...eight('a'), entry('Ship it!', true)], [...eight('b'), entry('ship it', true)]))
    expect(r.blocks).toEqual(['"ship it" is should_trigger:true in alpha and beta without a mutual ambiguous_with — merge the trigger or have each fixture name the other'])
  })
  test('a mutual ambiguous_with clears the collision', () => {
    const r = checkTriggers(family([...eight('a'), entry('ship it', true, ['beta'])], [...eight('b'), entry('ship it', true, ['alpha'])]))
    expect(r.blocks).toEqual([])
    expect(r.warns).toEqual([])
  })
  test('a one-sided positive reference warns instead of blocking', () => {
    const r = checkTriggers(family([...eight('a'), entry('ship it', true, ['beta'])], [...eight('b'), entry('ship it', true)]))
    expect(r.blocks).toEqual([])
    expect(r.warns).toEqual(['"ship it" is should_trigger:true in alpha and beta; alpha names beta in ambiguous_with but beta does not name alpha — add the reciprocal entry'])
  })
  test('bad shapes block with file and index', () => {
    const bad = [...eight('a'), { query: '', should_trigger: true }, { query: 'x', should_trigger: 'yes' }, { query: 'y', should_trigger: false, ambiguous_with: 'beta' }, 42]
    const r = checkTriggers(family(bad, eight('b')))
    // The four bad entries sit at indices 8-11; blocks come back string-sorted.
    expect(r.blocks).toEqual([
      'skills/alpha/tests/fixtures/trigger-queries.json[10]: ambiguous_with must be an array of skill-name strings',
      'skills/alpha/tests/fixtures/trigger-queries.json[11]: entry must be an object',
      'skills/alpha/tests/fixtures/trigger-queries.json[8]: query must be a non-empty string',
      'skills/alpha/tests/fixtures/trigger-queries.json[9]: should_trigger must be true or false',
    ])
    expect(r.warns).toEqual([])
  })
  test('a non-array fixture and a read error block', () => {
    const m = new Map<string, any>([['alpha', fixture('alpha', { queries: [] })], ['beta', { file: 'skills/beta/tests/fixtures/trigger-queries.json', error: 'Unexpected token } in JSON at position 3' }]])
    expect(checkTriggers(m).blocks).toEqual([
      'skills/alpha/tests/fixtures/trigger-queries.json: fixture must be a JSON array of entries',
      'skills/beta/tests/fixtures/trigger-queries.json: Unexpected token } in JSON at position 3',
    ])
  })
  test('a name not authored here warns', () => {
    const r = checkTriggers(family([...eight('a'), entry('wire the provider', false, ['vegastack-consume'])], eight('b')))
    expect(r.blocks).toEqual([])
    expect(r.warns).toEqual(['skills/alpha/tests/fixtures/trigger-queries.json[8]: ambiguous_with names "vegastack-consume", which is no skill authored here — a typo is invisible to this guard, so confirm the name by hand'])
  })
  test('a negative handing a query to a neighbour that never claims it warns', () => {
    const r = checkTriggers(family([...eight('a'), entry('merge it', false, ['beta'])], eight('b')))
    expect(r.warns).toEqual(['skills/alpha/tests/fixtures/trigger-queries.json[8]: should_trigger:false hands "merge it" to beta, whose fixture has no entry for it — add it there so the family-level eval walks both sides'])
  })
  test('a negative whose neighbour claims the query is silent', () => {
    const r = checkTriggers(family([...eight('a'), entry('Merge it', false, ['beta'])], [...eight('b'), entry('merge it', true)]))
    expect(r.warns).toEqual([])
  })
  test('a missing fixture and a small fixture warn', () => {
    const m = new Map<string, any>([['alpha', null], ['beta', fixture('beta', eight('b').slice(0, 3))]])
    expect(checkTriggers(m).warns).toEqual([
      'alpha: no tests/fixtures/trigger-queries.json — every skill ships one (skillify item 2)',
      'beta: 3 fixture entries, fewer than 8',
    ])
  })
})
