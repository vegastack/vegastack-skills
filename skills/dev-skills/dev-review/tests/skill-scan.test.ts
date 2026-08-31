import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { discoverSkills, evaluateScan, gatherFacts, parseBaseline, resolveScanRoot } from '../scripts/skill-scan.mjs'

const SKILL_MD = '---\nname: x\ndescription: y\n---\n'

const tree = (spec: Record<string, boolean>) => {
  const root = mkdtempSync(join(tmpdir(), 'vsk-scan-'))
  for (const [name, hasSkillMd] of Object.entries(spec)) {
    mkdirSync(join(root, name), { recursive: true })
    if (hasSkillMd) writeFileSync(join(root, name, 'SKILL.md'), SKILL_MD)
  }
  return root
}

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
        scanner_version: '2.11.0',
        rules: [],
        fingerprints: [{ hash: 'sha256:abc', rule_id: 'P2', file: 'a.md', reason: 'Accepted finding (auto-generated baseline)' }],
      }),
    )
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('placeholder')
  })

  // The scanner rejects such a baseline on every invocation, so without this the
  // run reports N unreadable-report failures instead of the one real cause.
  test('fingerprints without scanner_version are rejected before any scan runs', () => {
    const r = parseBaseline(
      JSON.stringify({
        version: 2,
        rules: [],
        fingerprints: [{ hash: 'sha256:abc', reason: 'One-off, adjudicated.' }],
      }),
    )
    expect(r.errors.some((e: string) => e.includes('scanner_version'))).toBe(true)
  })

  test('a fingerprint needs a reason but not the clause — content hashing is its re-trigger', () => {
    const withReason = JSON.stringify({
      version: 2,
      scanner_version: '2.11.0',
      rules: [],
      fingerprints: [{ hash: 'sha256:abc', reason: 'One-off: the fixture below is deliberately adversarial.' }],
    })
    expect(parseBaseline(withReason).errors).toEqual([])

    const withoutReason = JSON.stringify({
      version: 2,
      scanner_version: '2.11.0',
      rules: [],
      fingerprints: [{ hash: 'sha256:abc' }],
    })
    expect(parseBaseline(withoutReason).errors[0]).toContain('missing reason')
  })
})

describe('discoverSkills', () => {
  test('finds child directories holding SKILL.md and skips the rest', () => {
    const root = tree({ alpha: true, beta: false, '.scaffold-tmp': true })
    expect(discoverSkills(root).map((p: string) => basename(p))).toEqual(['alpha'])
  })

  test('a root that is itself a skill returns just itself', () => {
    const root = tree({})
    writeFileSync(join(root, 'SKILL.md'), SKILL_MD)
    expect(discoverSkills(root)).toEqual([root])
  })

  test('a missing root returns an empty list rather than throwing', () => {
    expect(discoverSkills(join(tmpdir(), 'vsk-does-not-exist'))).toEqual([])
  })

  test('results are sorted, so the report order is stable', () => {
    const root = tree({ zeta: true, alpha: true, mid: true })
    expect(discoverSkills(root).map((p: string) => basename(p))).toEqual(['alpha', 'mid', 'zeta'])
  })
})

const skill = (over = {}) => ({
  name: 'dev-review',
  score: 17,
  severity: 'LOW',
  executionSuccessful: true,
  suppressedCount: 0,
  issues: [],
  ...over,
})

const facts = (over = {}) => ({
  binaryMissing: false,
  rootMissing: null,
  baselineMissing: false,
  baselineErrors: [],
  skills: [skill()],
  scanErrors: [],
  ...over,
})

describe('evaluateScan', () => {
  test('a clean scan passes with no blocks and no warns', () => {
    expect(evaluateScan(facts())).toEqual({ blocks: [], warns: [] })
  })

  test('an unsuppressed HIGH finding blocks, naming rule and location', () => {
    const r = evaluateScan(
      facts({ skills: [skill({ issues: [{ id: 'RA1', severity: 'HIGH', file: 'refresh/REFRESH.md', line: 17 }] })] }),
    )
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0]).toContain('RA1')
    expect(r.blocks[0]).toContain('refresh/REFRESH.md:17')
  })

  test('CRITICAL blocks and MEDIUM or LOW never do', () => {
    expect(
      evaluateScan(facts({ skills: [skill({ issues: [{ id: 'X', severity: 'CRITICAL', file: 'a', line: 1 }] })] }))
        .blocks,
    ).toHaveLength(1)
    expect(
      evaluateScan(facts({ skills: [skill({ issues: [{ id: 'Y', severity: 'MEDIUM', file: 'a', line: 1 }] })] })).blocks,
    ).toEqual([])
    expect(
      evaluateScan(facts({ skills: [skill({ issues: [{ id: 'Z', severity: 'LOW', file: 'a', line: 1 }] })] })).blocks,
    ).toEqual([])
  })

  test('a score above 50 with no HIGH finding still passes — findings decide, not the score', () => {
    expect(evaluateScan(facts({ skills: [skill({ score: 80, severity: 'HIGH', issues: [] })] })).blocks).toEqual([])
  })

  test('a degraded scan blocks rather than reporting its partial score', () => {
    const r = evaluateScan(facts({ skills: [skill({ executionSuccessful: false })] }))
    expect(r.blocks[0]).toContain('did not complete')
  })

  test('a missing binary blocks with the install command', () => {
    const r = evaluateScan(facts({ binaryMissing: true }))
    expect(r.blocks[0]).toContain('uv tool install')
  })

  test('a missing scan root blocks and names the path', () => {
    expect(evaluateScan(facts({ rootMissing: 'packages/cli/skill' })).blocks[0]).toContain('packages/cli/skill')
  })

  test('baseline errors block, one per bad entry', () => {
    expect(evaluateScan(facts({ baselineErrors: ['rule 1: no matcher', 'rule 2: placeholder'] })).blocks).toHaveLength(2)
  })

  test('a skill whose HIGH findings were all suppressed passes, and the count is reported', () => {
    const r = evaluateScan(facts({ skills: [skill({ suppressedCount: 4, issues: [] })] }))
    expect(r.blocks).toEqual([])
    expect(r.warns.join(' ')).toContain('4')
  })

  test('an absent baseline warns rather than blocks', () => {
    const r = evaluateScan(facts({ baselineMissing: true }))
    expect(r.blocks).toEqual([])
    expect(r.warns[0]).toContain('no baseline')
  })

  test('a scanner error for one skill blocks — an unscanned skill is not a clean skill', () => {
    expect(evaluateScan(facts({ scanErrors: [{ skill: 'skillify', message: 'exit 2' }] })).blocks[0]).toContain(
      'skillify',
    )
  })

  test('finding nothing to scan blocks — an empty root is a misconfiguration, not a pass', () => {
    expect(evaluateScan(facts({ skills: [] })).blocks[0]).toContain('no skills')
  })

  test('environment failures are reported before findings, so the real cause reads first', () => {
    const r = evaluateScan(
      facts({
        binaryMissing: true,
        skills: [skill({ issues: [{ id: 'RA1', severity: 'HIGH', file: 'a', line: 1 }] })],
      }),
    )
    expect(r.blocks[0]).toContain('uv tool install')
  })
})

describe('resolveScanRoot', () => {
  test('reads the knob', () => {
    expect(resolveScanRoot('## Knobs\n\nskill-scan: packages/cli/skill   # built bundle\n')).toBe('packages/cli/skill')
  })

  test('none and absent both mean no scan', () => {
    expect(resolveScanRoot('skill-scan: none\n')).toBeNull()
    expect(resolveScanRoot('review: subagent\n')).toBeNull()
  })
})

const fake = join(import.meta.dir, 'fixtures/fake-skillspector.mjs')
const oneSkill = () => tree({ alpha: true })
const argvLogPath = () => join(mkdtempSync(join(tmpdir(), 'vsk-argv-')), 'argv.jsonl')
const argvLines = (path: string) =>
  readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as string[])

describe('gatherFacts', () => {
  const withFake = (env: Record<string, string | undefined>, run: () => void) => {
    const saved = { ...process.env }
    Object.assign(process.env, { VSK_SKILLSPECTOR: fake, ...env })
    try {
      run()
    } finally {
      process.env = saved
    }
  }

  const baselineFile = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'vsk-base-')), 'baseline.json')
    writeFileSync(path, JSON.stringify({ version: 2, rules: [rule()], fingerprints: [] }))
    return path
  }

  test('always passes --no-llm and the baseline, and never --use-shipped-baseline or --recursive', () => {
    const log = argvLogPath()
    const baseline = baselineFile()
    withFake({ VSK_FAKE_ARGV: log }, () => {
      gatherFacts({ root: oneSkill(), baselinePath: baseline, llm: false })
    })
    const argv = argvLines(log)[0]
    expect(argv).toContain('--no-llm')
    expect(argv).toContain('--baseline')
    expect(argv).toContain(baseline)
    expect(argv).not.toContain('--use-shipped-baseline')
    expect(argv).not.toContain('--recursive')
  })

  // A path the operator named but that is not there must not read as "no
  // baseline configured" — the scan silently counts findings that were
  // previously adjudicated as structural.
  test('a baseline path that does not exist is reported as missing, not passed to the scanner', () => {
    const log = argvLogPath()
    let f: ReturnType<typeof gatherFacts>
    withFake({ VSK_FAKE_ARGV: log }, () => {
      f = gatherFacts({ root: oneSkill(), baselinePath: join(tmpdir(), 'vsk-no-baseline.json'), llm: false })
    })
    expect(f!.baselineMissing).toBe(true)
    expect(argvLines(log)[0]).not.toContain('--baseline')
  })

  test('baseline errors are gathered so the verdict can block on them', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'vsk-base-')), 'baseline.json')
    writeFileSync(path, JSON.stringify({ version: 2, rules: [rule({ reason: 'no clause here' })], fingerprints: [] }))
    withFake({}, () => {
      const f = gatherFacts({ root: oneSkill(), baselinePath: path, llm: false })
      expect(f.baselineErrors).toHaveLength(1)
      expect(f.baselineErrors[0]).toContain('Still flag if:')
    })
  })

  test('--llm drops --no-llm, and is the only way to reach the semantic pass', () => {
    const log = argvLogPath()
    withFake({ VSK_FAKE_ARGV: log }, () => {
      gatherFacts({ root: oneSkill(), baselinePath: null, llm: true })
    })
    expect(argvLines(log)[0]).not.toContain('--no-llm')
  })

  test('invokes the scanner once per discovered skill', () => {
    const log = argvLogPath()
    withFake({ VSK_FAKE_ARGV: log }, () => {
      gatherFacts({ root: tree({ alpha: true, beta: true, gamma: true }), baselinePath: null, llm: false })
    })
    expect(argvLines(log)).toHaveLength(3)
  })

  test('a missing binary is reported as a fact, not an exception', () => {
    withFake({ VSK_SKILLSPECTOR: '/nonexistent/skillspector' }, () => {
      expect(gatherFacts({ root: oneSkill(), baselinePath: null, llm: false }).binaryMissing).toBe(true)
    })
  })

  test('a missing root is reported as a fact', () => {
    withFake({}, () => {
      const f = gatherFacts({ root: join(tmpdir(), 'vsk-absent-root'), baselinePath: null, llm: false })
      expect(f.rootMissing).toContain('vsk-absent-root')
    })
  })

  test('an unparseable report becomes a scanError for that skill', () => {
    withFake({ VSK_FAKE_REPORT: 'not json' }, () => {
      expect(gatherFacts({ root: oneSkill(), baselinePath: null, llm: false }).scanErrors).toHaveLength(1)
    })
  })

  // The scanner exits 1 whenever the score exceeds 50, which says nothing about
  // whether a blocking FINDING exists. Treating that exit as an error would make
  // every medium-scoring skill unscannable.
  test('a non-zero scanner exit with a readable report is data, not an error', () => {
    withFake({ VSK_FAKE_EXIT: '1' }, () => {
      const f = gatherFacts({ root: oneSkill(), baselinePath: null, llm: false })
      expect(f.scanErrors).toEqual([])
      expect(f.skills).toHaveLength(1)
    })
  })

  test('report fields map onto the facts shape the verdict function reads', () => {
    const report = JSON.stringify({
      risk_assessment: { score: 80, severity: 'HIGH' },
      issues: [{ id: 'AE1', severity: 'HIGH', location: { file: 'SKILL.md', start_line: 16 } }],
      suppressed_count: 2,
      execution_successful: true,
    })
    withFake({ VSK_FAKE_REPORT: report }, () => {
      const entry = gatherFacts({ root: oneSkill(), baselinePath: null, llm: false }).skills[0]
      expect(entry).toMatchObject({
        name: 'alpha',
        score: 80,
        severity: 'HIGH',
        suppressedCount: 2,
        executionSuccessful: true,
      })
      expect(entry.issues[0]).toEqual({ id: 'AE1', severity: 'HIGH', file: 'SKILL.md', line: 16 })
    })
  })
})
