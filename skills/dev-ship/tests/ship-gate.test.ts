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
  checkoutMismatch: null,
})

describe('ship-gate', () => {
  test('clean facts pass', () => {
    expect(evaluateShipGate(cleanFacts()).blocks).toEqual([])
  })
  test('no evidence comment blocks immediately', () => {
    const r = evaluateShipGate({ ...cleanFacts(), evidence: null })
    expect(r.blocks[0]).toContain('no evidence comment')
  })
  test('moved head blocks until the evidence sha itself is updated — a mere comment edit is not reconciliation', () => {
    const moved = { ...cleanFacts(), headSha: 'fff9999', headCommittedAt: '2026-08-29T12:00:00Z' }
    expect(evaluateShipGate(moved).blocks.some((b) => b.includes('moved past evidence sha'))).toBe(true)
    const editedButStale = { ...moved, evidence: { body: evidenceBody(), updatedAt: '2026-08-29T13:00:00Z' } }
    expect(evaluateShipGate(editedButStale).blocks.some((b) => b.includes('moved past evidence sha'))).toBe(true)
    const reconciled = { ...moved, evidence: { body: evidenceBody('fff9999'), updatedAt: '2026-08-29T13:00:00Z' } }
    expect(evaluateShipGate(reconciled).blocks).toEqual([])
  })
  test('missing or invalid evidence sha blocks (never falls open on startsWith(""))', () => {
    const noSha = { ...cleanFacts(), evidence: { body: evidenceBody().replace(' sha=abc1234', ''), updatedAt: '2026-08-29T10:00:00Z' } }
    expect(evaluateShipGate(noSha).blocks.some((b) => b.includes('no valid sha='))).toBe(true)
    const shortSha = { ...cleanFacts(), evidence: { body: evidenceBody().replace('sha=abc1234', 'sha=f'), updatedAt: '2026-08-29T10:00:00Z' } }
    expect(evaluateShipGate(shortSha).blocks.some((b) => b.includes('no valid sha='))).toBe(true)
  })
  test('a checkout that is not the branch under review blocks the fresh-check claim', () => {
    const r = evaluateShipGate({ ...cleanFacts(), checkoutMismatch: 'the current checkout (1111111) is not the branch under review' })
    expect(r.blocks.some((b) => b.includes('not the branch under review'))).toBe(true)
  })
  test('the chronicle-entry rule is an ADDED heading, not any touch', () => {
    const headingRule = (fileDiff: string) => /^\+## /m.test(fileDiff)
    expect(headingRule('+## 29-08-2026 — a new entry (#16)\n+**What:** …')).toBe(true)
    expect(headingRule('-## 28-08-2026 — deleted entry\n')).toBe(false)
    expect(headingRule('-**Why:** old\n+**Why:** typo-fixed old entry\n')).toBe(false)
    expect(headingRule('+++ b/.vegastack/chronicle.md\n@@\n context only')).toBe(false)
  })
  test('an exercised excuse warns with what it excused', () => {
    const r = evaluateShipGate({ ...cleanFacts(), changelogTouched: false, chronicleOn: true, chronicleTouched: false, allowNoChangelog: 'docs-only' })
    expect(r.blocks).toEqual([])
    expect(r.warns.some((w) => w.includes('changelog + chronicle'))).toBe(true)
  })
  test('chronicle: on blocks a diff without a chronicle entry; the same reason excuses both', () => {
    const missing = evaluateShipGate({ ...cleanFacts(), chronicleOn: true, chronicleTouched: false })
    expect(missing.blocks.some((b) => b.includes('chronicle'))).toBe(true)
    const touched = evaluateShipGate({ ...cleanFacts(), chronicleOn: true, chronicleTouched: true })
    expect(touched.blocks).toEqual([])
    const excused = evaluateShipGate({ ...cleanFacts(), chronicleOn: true, chronicleTouched: false, allowNoChangelog: 'docs-only' })
    expect(excused.blocks).toEqual([])
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
  test('leftover [DEBUG- tags block only on ADDED lines — removals and docs context pass', () => {
    const added = evaluateShipGate({ ...cleanFacts(), diffText: '+console.log("[DEBUG-a4f2] x")' })
    expect(added.blocks.some((b) => b.includes('[DEBUG-'))).toBe(true)
    const removedOrContext = evaluateShipGate({ ...cleanFacts(), diffText: '-console.log("[DEBUG-a4f2] x")\n [DEBUG-docs] mention in context\n+++ b/skills/dev-debug/SKILL.md' })
    expect(removedOrContext.blocks).toEqual([])
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
