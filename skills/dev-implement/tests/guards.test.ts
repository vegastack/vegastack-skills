import { describe, expect, test } from 'bun:test'
import { findMarkerComment, parseFlags, parseMarker, renderResult } from '../scripts/lib/gh.mjs'
import { evaluatePreflight } from '../scripts/preflight.mjs'
import { checkEvidence } from '../scripts/evidence-check.mjs'

const approval = (scope = 'brief') => ({ body: `<!-- vsk:v1 type=approval scope=${scope} -->\nApproved by operator (kmanojkumar) on 28-08-2026: "yes"` })
const baseIssue = () => ({
  body: '## Outcome\nA thing.\n',
  state: 'open',
  labels: [{ name: 'ready' }, { name: 'quick-build' }],
  assignees: [],
  repo: 'vegastack/vegastack-skills',
  blockedBy: [],
})
const devMd = 'repo: vegastack/vegastack-skills · default branch main\n'

describe('marker lib', () => {
  test('parses keys from a vsk marker', () => {
    expect(parseMarker('<!-- vsk:v1 type=ledger branch=feat/x -->')?.keys).toEqual({ type: 'ledger', branch: 'feat/x' })
  })
  test('no marker → null (no heading fallback)', () => {
    expect(parseMarker('## Ledger — feat/x')).toBeNull()
  })
  test('findMarkerComment: last of a type wins', () => {
    const found = findMarkerComment([approval('brief'), approval('plan')], 'approval')
    expect(found?.keys.scope).toBe('plan')
  })
  test('renderResult exit codes: block=2, warn=1, clean=0', () => {
    expect(renderResult('g', { blocks: ['x'], warns: [] }).exitCode).toBe(2)
    expect(renderResult('g', { blocks: [], warns: ['y'] }).exitCode).toBe(1)
    expect(renderResult('g', { blocks: [], warns: [] }).exitCode).toBe(0)
  })
  test('parseFlags: values and booleans', () => {
    expect(parseFlags(['--issue', '12', '--json'])).toEqual({ issue: '12', json: true })
  })
})

describe('preflight', () => {
  test('clean quick-build issue passes', () => {
    const r = evaluatePreflight({ issue: baseIssue(), comments: [approval()], devMd, me: 'kmanojkumar' })
    expect(r.blocks).toEqual([])
  })
  test('blocks without an approval marker', () => {
    const r = evaluatePreflight({ issue: baseIssue(), comments: [{ body: 'Approved!' }], devMd, me: 'kmanojkumar' })
    expect(r.blocks.some((b: string) => b.includes('type=approval'))).toBe(true)
  })
  test('blocks without exactly one scope label', () => {
    const issue = baseIssue()
    issue.labels = [{ name: 'ready' }]
    const r = evaluatePreflight({ issue, comments: [approval()], devMd, me: 'kmanojkumar' })
    expect(r.blocks.some((b: string) => b.includes('scope label'))).toBe(true)
  })
  test('full-plan blocks without plan approval, passes with scope=plan', () => {
    const issue = baseIssue()
    issue.labels = [{ name: 'ready' }, { name: 'full-plan' }]
    const missing = evaluatePreflight({ issue, comments: [approval('brief')], devMd, me: 'kmanojkumar' })
    expect(missing.blocks.some((b: string) => b.includes('plan approval'))).toBe(true)
    const ok = evaluatePreflight({ issue, comments: [approval('brief'), approval('plan')], devMd, me: 'kmanojkumar' })
    expect(ok.blocks).toEqual([])
  })
  test('blocks on unresolved Assumptions section', () => {
    const issue = baseIssue()
    issue.body += '\n## Assumptions — confirm or correct\n- gh supports X\n'
    const r = evaluatePreflight({ issue, comments: [approval()], devMd, me: 'kmanojkumar' })
    expect(r.blocks.some((b: string) => b.includes('Assumptions'))).toBe(true)
  })
  test('blocks on open blockers and foreign assignee', () => {
    const issue = baseIssue()
    issue.blockedBy = [{ number: 7, state: 'open' }]
    issue.assignees = [{ login: 'someone-else' }]
    const r = evaluatePreflight({ issue, comments: [approval()], devMd, me: 'kmanojkumar' })
    expect(r.blocks.some((b: string) => b.includes('#7'))).toBe(true)
    expect(r.blocks.some((b: string) => b.includes('someone-else'))).toBe(true)
  })
  test('blocks a closed issue and a wrong state label; expect=working accepts a resume', () => {
    const closed = baseIssue(); closed.state = 'closed'
    expect(evaluatePreflight({ issue: closed, comments: [approval()], devMd, me: 'kmanojkumar' }).blocks.some((b: string) => b.includes('only open issues'))).toBe(true)
    const wrong = baseIssue(); wrong.labels = [{ name: 'needs-operator' }, { name: 'quick-build' }]
    expect(evaluatePreflight({ issue: wrong, comments: [approval()], devMd, me: 'kmanojkumar' }).blocks.some((b: string) => b.includes('expected ready'))).toBe(true)
    const resume = baseIssue(); resume.labels = [{ name: 'working' }, { name: 'quick-build' }]
    expect(evaluatePreflight({ issue: resume, comments: [approval()], devMd, me: 'kmanojkumar', expect: 'working' }).blocks).toEqual([])
  })
  test('blocks on repo mismatch with dev.md', () => {
    const issue = baseIssue()
    issue.repo = 'vegastack/other-repo'
    const r = evaluatePreflight({ issue, comments: [approval()], devMd, me: 'kmanojkumar' })
    expect(r.blocks.some((b: string) => b.includes('does not match dev.md repo'))).toBe(true)
  })
})

describe('evidence-check', () => {
  const good = `<!-- vsk:v1 type=evidence rev=1 branch=feat/12-x sha=abc1234 -->
## Result (v1)
**Done:** thing
**Tests:** bun test → green
**Review:** subagent — clean
**Changelog:** changeset added
**Docs:** brief v1, plan v1 — in sync
**Not done / limits:** none
Branch: feat/12-x @ abc1234`
  test('complete evidence passes', () => {
    expect(checkEvidence(good).blocks).toEqual([])
  })
  test('blocks on missing marker, sections, and tail', () => {
    const r = checkEvidence('## Result\n**Done:** thing\n')
    expect(r.blocks.some((b: string) => b.includes('marker'))).toBe(true)
    expect(r.blocks.some((b: string) => b.includes('**Docs:**'))).toBe(true)
    expect(r.blocks.some((b: string) => b.includes('Branch:'))).toBe(true)
  })
  test('blocks on marker without real sha', () => {
    const r = checkEvidence(good.replace('sha=abc1234', 'sha=TBDTBDT'))
    expect(r.blocks.some((b: string) => b.includes('real sha'))).toBe(true)
  })
})
