import { expect, test } from 'bun:test'
import { parseRecordLine, readRecords } from '../src/lib/stats/record'
import { compareMonths, monthToken, parseMonth } from '../src/lib/stats/month'

const ts = '2026-09-02T10:00:00.000Z'
const repo = 'vegastack/vegafactory'

test('a full line maps to the view shape; absent fields are null; bad lines are counted', () => {
  const record = parseRecordLine(JSON.stringify({
    ts, repo, issue: 122, stage: 'implement', harness: 'claude', human: 'kmanojkumar',
    tokens: { in: 1000, out: 200, cache_read: 50, cache_write: 10 }, cost_usd: 0.42,
    skills: [{ name: 'dev-implement', trigger: 'model' }], a_key_121_adds_later: 'passed over',
  }))!
  expect(record.month).toBe('SEP-2026')
  expect(record.tokensIn).toBe(1000)
  expect(record.cacheWrite).toBe(10)
  expect(record.skills[0]!.name).toBe('dev-implement')
  expect(parseRecordLine(JSON.stringify({ ts, repo }))!.costUsd).toBeNull()
  expect(parseRecordLine(JSON.stringify({ ts, repo: 'nope' }))).toBeNull()
  expect(readRecords(['{bad', JSON.stringify({ ts, repo })].join('\n'), 'stats/x/SEP-2026/m.jsonl'))
    .toMatchObject({ skipped: 1 })
  expect(monthToken(new Date(ts))).toBe('SEP-2026')
  expect(parseMonth('sep-2026')).toBeNull()
  expect(['SEP-2026', 'AUG-2026'].sort(compareMonths)).toEqual(['AUG-2026', 'SEP-2026'])
})
