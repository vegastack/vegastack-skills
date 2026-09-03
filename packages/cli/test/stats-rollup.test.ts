import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeRecord, type StatsRecord } from '../src/stats/record.ts'
import { rollupRepo, rollupOrg, rollupSkills, stableStringify } from '../src/stats/rollup.ts'

const fixtures = join(import.meta.dir, 'fixtures/stats/SEP-2026')
const records: StatsRecord[] = readFileSync(join(fixtures, 'mini.jsonl'), 'utf8')
  .trimEnd().split('\n').map((line) => JSON.parse(line) as StatsRecord)
const timelines = JSON.parse(readFileSync(join(fixtures, 'timeline-121.json'), 'utf8'))
const options = { repo: 'vegastack/vegafactory', month: 'SEP-2026', people: true }

test('the same fixture month rolls up byte-identically twice', () => {
  const first = stableStringify(rollupRepo(records, timelines, options))
  const second = stableStringify(rollupRepo(records, timelines, options))
  expect(first).toBe(second)
  expect(first).not.toContain('generatedAt')
})

test('stableStringify sorts keys', () => {
  expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
})

test('per-stage totals and rework come from the records alone', () => {
  const summary = rollupRepo(records, timelines, options)
  expect(summary.runs).toBe(records.length)
  expect(summary.by_stage.implement!.runs).toBe(2)
  expect(summary.by_stage.implement!.outcomes).toEqual({ complete: 1, handback: 1 })
  expect(summary.rework.review_rounds).toBe(3)
  expect(summary.rework.runs_with_rework).toBe(2)
})

test('lead and cycle time come from the label timeline, not from the records', () => {
  const summary = rollupRepo(records, timelines, options)
  expect(summary.lead_time_h.p50).toBe(48)
  expect(summary.cycle_time_h.ready!.p50).toBe(12)
  expect(summary.cycle_time_h.working!.p50).toBe(24)
})

test('the org summary sums its repos, sorts them, and drops people blocks when gated off', () => {
  const repoA = rollupRepo(records, timelines, options)
  const repoB = rollupRepo(records, timelines, { ...options, repo: 'vegastack/billing' })
  const org = rollupOrg([repoA, repoB], { month: 'SEP-2026', people: true })
  expect(org.repos).toEqual(['vegastack/billing', 'vegastack/vegafactory'])
  expect(org.runs).toBe(repoA.runs + repoB.runs)
  expect(rollupRepo(records, timelines, { ...options, people: false }).people).toBeNull()
  expect(rollupOrg([repoA], { month: 'SEP-2026', people: false }).people).toBeNull()
})

test('the skills summary counts invocations by trigger and harness', () => {
  const run = (ts: string, outcome: string, skills: object[]) => normalizeRecord({ repo: 'r', ts, outcome, skills } as never)
  const summary = rollupSkills([
    run('2026-09-03T10:00:00.000Z', 'complete', [{ name: 'dev-implement', trigger: 'typed', harness: 'claude' }, { name: 'dev-architect', trigger: 'model', harness: 'claude' }]),
    run('2026-09-04T10:00:00.000Z', 'handback', [{ name: 'dev-implement', trigger: 'mention', harness: 'codex' }]),
  ], { month: 'SEP-2026' })
  expect(summary.skills['dev-implement']).toEqual({
    invocations: 2, by_trigger: { mention: 1, typed: 1 },
    by_harness: { claude: 1, codex: 1 }, outcomes: { complete: 1, handback: 1 },
  })
})
