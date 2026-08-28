import { describe, expect, test } from 'bun:test'
import { evaluateShipGate, parseMarker } from '../scripts/ship-gate.mjs'

const evidenceBody = (sha = 'abc1234') => `<!-- vsk:v1 type=evidence rev=1 branch=feat/12-x sha=${sha} -->
## Result (v1)
**Done:** thing
**Tests:** bun test → green
**Review:** subagent — clean
**Changelog:** changeset added
**Docs:** brief v1, plan v1 — in sync
**Not done / limits:** none
Branch: feat/12-x @ ${sha}`

const cleanFacts = () => ({
  evidence: { body: evidenceBody(), updatedAt: '2026-08-29T10:00:00Z' },
  reviewVerdict: 'clean',
  adjudicated: false,
  headSha: 'abc1234',
  headCommittedAt: '2026-08-29T09:00:00Z',
  diffText: 'diff --git a/.changeset/x.md b/.changeset/x.md\n+content',
  changelogTouched: true,
  allowNoChangelog: undefined,
  checkExit: 0,
})

describe('ship-gate', () => {
  test('clean facts pass', () => {
    expect(evaluateShipGate(cleanFacts()).blocks).toEqual([])
  })
  test('no evidence comment blocks immediately', () => {
    const r = evaluateShipGate({ ...cleanFacts(), evidence: null })
    expect(r.blocks[0]).toContain('no evidence comment')
  })
  test('moved head with stale evidence blocks; postdating Docs update passes', () => {
    const moved = { ...cleanFacts(), headSha: 'fff9999', headCommittedAt: '2026-08-29T12:00:00Z' }
    expect(evaluateShipGate(moved).blocks.some((b) => b.includes('moved past evidence sha'))).toBe(true)
    const reconciled = { ...moved, evidence: { body: evidenceBody(), updatedAt: '2026-08-29T13:00:00Z' } }
    expect(evaluateShipGate(reconciled).blocks).toEqual([])
  })
  test('missing changelog blocks unless a reason is given', () => {
    const r = evaluateShipGate({ ...cleanFacts(), changelogTouched: false })
    expect(r.blocks.some((b) => b.includes('changelog'))).toBe(true)
    const excused = evaluateShipGate({ ...cleanFacts(), changelogTouched: false, allowNoChangelog: 'docs-only' })
    expect(excused.blocks).toEqual([])
  })
  test('needs-fixes verdict blocks without adjudication, passes with it', () => {
    const r = evaluateShipGate({ ...cleanFacts(), reviewVerdict: 'needs-fixes' })
    expect(r.blocks.some((b) => b.includes('review verdict'))).toBe(true)
    const adjudicated = evaluateShipGate({ ...cleanFacts(), reviewVerdict: 'needs-fixes', adjudicated: true })
    expect(adjudicated.blocks).toEqual([])
  })
  test('failing fresh check blocks; absent check command does not', () => {
    expect(evaluateShipGate({ ...cleanFacts(), checkExit: 1 }).blocks.some((b) => b.includes('check command'))).toBe(true)
    expect(evaluateShipGate({ ...cleanFacts(), checkExit: null }).blocks).toEqual([])
  })
  test('leftover [DEBUG- tags in the diff block', () => {
    const r = evaluateShipGate({ ...cleanFacts(), diffText: '+console.log("[DEBUG-a4f2] x")' })
    expect(r.blocks.some((b) => b.includes('[DEBUG-'))).toBe(true)
  })
  test('rationalization phrases warn, never block', () => {
    const facts = cleanFacts()
    facts.evidence.body = facts.evidence.body.replace('**Not done / limits:** none', '**Not done / limits:** skipping tests for now on the edge case')
    const r = evaluateShipGate(facts)
    expect(r.blocks).toEqual([])
    expect(r.warns.length).toBe(1)
  })
  test('parseMarker exported for the skill wiring', () => {
    expect(parseMarker(evidenceBody())?.keys.type).toBe('evidence')
  })
})
