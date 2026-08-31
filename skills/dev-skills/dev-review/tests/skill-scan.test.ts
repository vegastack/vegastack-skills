import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  discoverSkills,
  evaluateScan,
  findUnscannable,
  gatherFacts,
  parseBaseline,
  resolveScanRoot,
  scanRootDeclarations,
} from '../scripts/skill-scan.mjs'

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

  // Adversarial review, CRITICAL: `{"id":"*"}` with a clause-carrying reason
  // silenced EVERY finding — 39 on this repo — and the guard reported
  // "pass with warnings". The first fix rejected only `*` and `**`; re-review
  // bypassed it with `?*` in one attempt, and `*.md`, `[a-z]*` and `*SKILL*`
  // work the same way. Matching wildcard SHAPES is an arms race, so matchers
  // must simply be literal.
  test('every glob metacharacter is rejected, on every field and the file alias', () => {
    const bypasses = [
      { id: '*' },
      { path: '**' },
      { message: '?*' },
      { file: '*' },
      { path: '*.md' },
      { path: '[a-z]*' },
      { id: '*SKILL*' },
      { path: '?' },
      { id: 'P?' },
    ]
    for (const matcher of bypasses) {
      const r = parseBaseline(
        JSON.stringify({ version: 2, rules: [{ ...matcher, reason: 'x. Still flag if: never' }], fingerprints: [] }),
      )
      expect(r.errors.some((e: string) => e.includes('glob character'))).toBe(true)
    }
  })

  test('a non-string or empty matcher is rejected rather than coerced', () => {
    for (const matcher of [{ path: '   ' }, { id: 7 }, { path: ['a'] }, { message: {} }, { id: true }]) {
      const r = parseBaseline(
        JSON.stringify({ version: 2, rules: [{ ...matcher, reason: 'x. Still flag if: never' }], fingerprints: [] }),
      )
      expect(r.errors.length).toBeGreaterThan(0)
    }
  })

  test('a literal matcher — the only shape that scopes a rule to its cause — is accepted', () => {
    const r = parseBaseline(
      JSON.stringify({
        version: 2,
        rules: [{ id: 'P2', path: 'references/conventions.md', reason: 'documented. Still flag if: it changes.' }],
        fingerprints: [],
      }),
    )
    expect(r.errors).toEqual([])
  })

  // SkillSpector resolves `path` as `raw.get("path") or raw.get("file")`, so a
  // baseline using the alias is valid and must not be rejected as "no matcher".
  test('the file alias is accepted as a path matcher', () => {
    const r = parseBaseline(
      JSON.stringify({
        version: 2,
        rules: [{ file: 'references/conventions.md', reason: 'documented. Still flag if: it stops being documented.' }],
        fingerprints: [],
      }),
    )
    expect(r.errors).toEqual([])
    expect(r.rules[0].path).toBe('references/conventions.md')
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
  completeness: { status: 'complete', limitations: [], entirelyUninspected: 0, partiallyInspected: 0 },
  suppressed: [],
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

  // Codex cross-agent review, Finding [2]: execution_successful alone is not
  // enough. A run whose analyzer failed reports a HIGHER score with FEWER
  // filtered findings, so passing it because nothing blocking survived is
  // exactly backwards.
  test('an analyzer that did not finish blocks even when execution_successful is true', () => {
    const r = evaluateScan(
      facts({
        skills: [
          skill({
            executionSuccessful: true,
            issues: [],
            completeness: { status: 'partial', limitations: ['LLM stage degraded: 2/4 calls failed'], entirelyUninspected: 0 },
          }),
        ],
      }),
    )
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0]).toContain('did not finish')
  })

  // ...but `partial` on its own is the NORMAL result here: unresolved path-like
  // references in documentation produce it on a perfectly healthy scan. Blocking
  // on it would block every scan forever.
  test('plain partial completeness passes — it is the normal result for documentation-heavy skills', () => {
    const r = evaluateScan(
      facts({ skills: [skill({ completeness: { status: 'partial', limitations: [], entirelyUninspected: 0 } })] }),
    )
    expect(r.blocks).toEqual([])
  })

  test('a file that was never inspected blocks', () => {
    const r = evaluateScan(
      facts({ skills: [skill({ completeness: { status: 'partial', limitations: [], entirelyUninspected: 2 } })] }),
    )
    expect(r.blocks[0]).toContain('never inspected')
  })

  test('an unrecognised completeness status blocks rather than being read as clean', () => {
    const r = evaluateScan(
      facts({ skills: [skill({ completeness: { status: 'failed', limitations: [], entirelyUninspected: 0, partiallyInspected: 0 } })] }),
    )
    expect(r.blocks[0]).toContain('completeness')
  })

  // Codex cross-agent review, round 2 on Finding [2]: distinct from `status:
  // "partial"`, which is normal here. Measured across all twelve skills,
  // partially_inspected_files is 0 on a healthy run — so this blocks only
  // genuinely truncated coverage, at no cost to normal operation.
  test('a partly-inspected file blocks even when nothing else is degraded', () => {
    const r = evaluateScan(
      facts({
        skills: [skill({ completeness: { status: 'partial', limitations: [], entirelyUninspected: 0, partiallyInspected: 1 } })],
      }),
    )
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0]).toContain('partly inspected')
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

  test('baseline errors are gathered so the verdict can block on them, and no scan runs', () => {
    const log = argvLogPath()
    const path = join(mkdtempSync(join(tmpdir(), 'vsk-base-')), 'baseline.json')
    writeFileSync(path, JSON.stringify({ version: 2, rules: [rule({ reason: 'no clause here' })], fingerprints: [] }))
    withFake({ VSK_FAKE_ARGV: log }, () => {
      const f = gatherFacts({ root: oneSkill(), baselinePath: path, llm: false })
      expect(f.baselineErrors).toHaveLength(1)
      expect(f.baselineErrors[0]).toContain('Still flag if:')
      expect(f.skills).toEqual([])
    })
    // Nothing the scan reports is trustworthy with a bad baseline, and the
    // scanner would reject the file once per skill — so it must not be invoked.
    expect(existsSync(log)).toBe(false)
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
      analysis_completeness: { status: 'partial', limitations: [], entirely_uninspected_files: 0 },
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
      expect(entry.completeness).toEqual({
        status: 'partial',
        limitations: [],
        entirelyUninspected: 0,
        partiallyInspected: 0,
        fullyInspected: 0,
        coveragePercent: null,
      })
    })
  })

  // Codex cross-agent review, Finding [2]: the analyzer-limitation signal must
  // survive normalization, or the verdict function can never see it.
  test('analyzer limitations and coverage counts survive into the facts shape', () => {
    const report = JSON.stringify({
      risk_assessment: { score: 98, severity: 'CRITICAL' },
      issues: [],
      execution_successful: true,
      analysis_completeness: {
        status: 'partial',
        limitations: ['LLM stage degraded'],
        entirely_uninspected_files: 1,
        partially_inspected_files: 2,
        fully_inspected_files: 3,
        coverage_percent: 50.0,
      },
    })
    withFake({ VSK_FAKE_REPORT: report }, () => {
      const entry = gatherFacts({ root: oneSkill(), baselinePath: null, llm: false }).skills[0]
      expect(entry.completeness).toEqual({
        status: 'partial',
        limitations: ['LLM stage degraded'],
        entirelyUninspected: 1,
        partiallyInspected: 2,
        fullyInspected: 3,
        coveragePercent: 50.0,
      })
    })
  })

  // Adversarial review: the brief names this coupling risk by name — "fail
  // loudly on an unrecognised report shape rather than reading a missing key as
  // 'no findings'". A renamed key upstream would otherwise turn every skill
  // green while reporting a CRITICAL score.
  test('a report with no "issues" array is a scanError, never "no findings"', () => {
    const report = JSON.stringify({
      risk_assessment: { score: 95, severity: 'CRITICAL' },
      findings: [{ id: 'X', severity: 'CRITICAL' }],
      execution_successful: true,
    })
    withFake({ VSK_FAKE_REPORT: report }, () => {
      const f = gatherFacts({ root: oneSkill(), baselinePath: null, llm: false })
      expect(f.skills).toEqual([])
      expect(f.scanErrors).toHaveLength(1)
      expect(f.scanErrors[0].message).toContain('unrecognised shape')
      // and the verdict must block on it
      expect(evaluateScan(f).blocks[0]).toContain('alpha')
    })
  })

  test('a report that is valid JSON but not an object is a scanError', () => {
    withFake({ VSK_FAKE_REPORT: '[1,2,3]' }, () => {
      expect(gatherFacts({ root: oneSkill(), baselinePath: null, llm: false }).scanErrors).toHaveLength(1)
    })
  })

  // Codex cross-agent review, round 2 on Finding [1]: the scanner emits the
  // suppressed entries themselves, not just a count, and the Security axis is
  // told to judge each one against its cause. Discarding them made that
  // impossible while the evidence sat in the report.
  test('the project baseline is never inherited by an ad-hoc --root scan of someone else’s skill', () => {
    const log = argvLogPath()
    const proc = Bun.spawnSync(
      ['node', join(import.meta.dir, '../scripts/skill-scan.mjs'), '--root', oneSkill(), '--json'],
      {
        cwd: join(import.meta.dir, '../../../..'),
        env: { ...process.env, VSK_SKILLSPECTOR: fake, VSK_FAKE_ARGV: log },
      },
    )
    expect(proc.exitCode).not.toBe(2)
    // A rule written for our content could silence a real finding in theirs.
    expect(argvLines(log)[0]).not.toContain('--baseline')
  })

  test('the scanner suppressed-entry list is carried through, not just its count', () => {
    const report = JSON.stringify({
      risk_assessment: { score: 0, severity: 'LOW' },
      issues: [],
      suppressed_count: 1,
      suppressed: [{ rule_id: 'P2', file: 'references/conventions.md', reason: 'documented protocol. Still flag if: ...' }],
      execution_successful: true,
      analysis_completeness: { status: 'partial', limitations: [], entirely_uninspected_files: 0, partially_inspected_files: 0 },
    })
    withFake({ VSK_FAKE_REPORT: report }, () => {
      const entry = gatherFacts({ root: oneSkill(), baselinePath: null, llm: false }).skills[0]
      expect(entry.suppressed).toHaveLength(1)
      expect(entry.suppressed[0]).toMatchObject({ rule_id: 'P2', file: 'references/conventions.md' })
    })
  })
})

// The CLI branch. Two adversarial-review findings lived here and neither was
// reachable from the exported functions, so it gets its own tests despite no
// other guard in this repo testing its CLI.
describe('CLI', () => {
  const script = join(import.meta.dir, '../scripts/skill-scan.mjs')
  const repoRoot = join(import.meta.dir, '../../../..')

  const run = (args: string[], env: Record<string, string> = {}) => {
    const proc = Bun.spawnSync(['node', script, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
    })
    return { code: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() }
  }

  test('an unreadable dev.md blocks — it is not the same answer as "skill-scan: none"', () => {
    const r = run(['--dev-md', join(tmpdir(), 'vsk-no-such-profile.md'), '--json'])
    expect(r.code).toBe(2)
    expect(r.out).toContain('cannot read')
  })

  test('skill-scan: none still skips cleanly', () => {
    const profile = join(mkdtempSync(join(tmpdir(), 'vsk-prof-')), 'dev.md')
    writeFileSync(profile, 'skill-scan: none\n')
    const r = run(['--dev-md', profile])
    expect(r.code).toBe(0)
    expect(r.out).toContain('skipped')
  })

  // A crash must never land on exit 1, which this guard's own scheme reads as
  // "pass with warnings".
  test('an unexpected failure exits 2, not 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vsk-file-'))
    const notADir = join(dir, 'a-file')
    writeFileSync(notADir, 'not a directory')
    const profile = join(mkdtempSync(join(tmpdir(), 'vsk-prof-')), 'dev.md')
    writeFileSync(profile, `skill-scan: ${notADir}\n`)
    const r = run(['--dev-md', profile], { VSK_SKILLSPECTOR: fake })
    expect(r.code).toBe(2)
  })
})

describe('adversarial regressions', () => {
  // Grouped layouts (`<root>/<group>/<skill>/`) scanned as ZERO skills while the
  // run reported success on whatever else it found.
  test('grouped skill layouts are discovered, not silently skipped', () => {
    const root = mkdtempSync(join(tmpdir(), 'vsk-grouped-'))
    mkdirSync(join(root, 'flat-skill'), { recursive: true })
    writeFileSync(join(root, 'flat-skill/SKILL.md'), SKILL_MD)
    mkdirSync(join(root, 'a-group/grouped-skill'), { recursive: true })
    writeFileSync(join(root, 'a-group/grouped-skill/SKILL.md'), SKILL_MD)
    // Sorted by full path, so a group's members stay together in the report.
    expect(discoverSkills(root).map((p: string) => basename(p))).toEqual(['grouped-skill', 'flat-skill'])
  })

  // Created by the two-level-discovery fix and caught on re-review: a symlink to
  // a directory CONTAINING skills was descended by neither discovery nor the
  // first findUnscannable, so six HIGH findings vanished into "pass with
  // warnings". findUnscannable is now the difference between a deep walk and
  // what was scanned, so it cannot drift from discovery again.
  test('a symlinked intermediate directory holding skills is named and blocked', () => {
    const real = mkdtempSync(join(tmpdir(), 'vsk-realgroup-'))
    mkdirSync(join(real, 'hidden-skill'), { recursive: true })
    writeFileSync(join(real, 'hidden-skill/SKILL.md'), SKILL_MD)
    const root = mkdtempSync(join(tmpdir(), 'vsk-introot-'))
    symlinkSync(real, join(root, 'linked-group'))

    expect(discoverSkills(root)).toEqual([])
    const { unscannable } = findUnscannable(root)
    expect(unscannable).toHaveLength(1)
    expect(evaluateScan(facts({ unscannable, skills: [] })).blocks[0]).toContain('linked-group')
  })

  test('a skill nested deeper than the layout allows is reported, not silently ignored', () => {
    const root = mkdtempSync(join(tmpdir(), 'vsk-deep-'))
    mkdirSync(join(root, 'a/b/too-deep'), { recursive: true })
    writeFileSync(join(root, 'a/b/too-deep/SKILL.md'), SKILL_MD)
    expect(discoverSkills(root)).toEqual([])
    expect(findUnscannable(root).unscannable.some((p: string) => p.endsWith('too-deep'))).toBe(true)
  })

  // The eleventh defect of this branch's recurring class, found by the round-3
  // adversarial pass: the previous fix capped the walk at depth 4, so a
  // deliberately malicious skill at depth 5 was scanned by nobody and flagged by
  // nobody — "pass with warnings", exit 1. A cap IS a cliff; the walk is now
  // unbounded and only a visit budget stops it, which blocks rather than
  // truncating.
  test('a skill buried arbitrarily deep is still reported — a depth cap is a cliff', () => {
    for (const depth of [3, 4, 5, 6, 9]) {
      const root = mkdtempSync(join(tmpdir(), `vsk-depth${depth}-`))
      const buried = join(root, ...Array.from({ length: depth - 1 }, (_, i) => `lvl${i}`), 'buried')
      mkdirSync(buried, { recursive: true })
      writeFileSync(join(buried, 'SKILL.md'), SKILL_MD)
      const { unscannable } = findUnscannable(root)
      expect(unscannable.some((p: string) => p.endsWith('buried'))).toBe(true)
    }
  })

  test('a walk that cannot finish blocks instead of reporting partial coverage', () => {
    expect(evaluateScan(facts({ coverageExhausted: true, skills: [] })).blocks[0]).toContain('too large')
  })

  test('a dot-prefixed skill directory is reported rather than silently skipped', () => {
    const root = mkdtempSync(join(tmpdir(), 'vsk-dot-'))
    mkdirSync(join(root, '.scaffold-leftover'), { recursive: true })
    writeFileSync(join(root, '.scaffold-leftover/SKILL.md'), SKILL_MD)
    expect(discoverSkills(root)).toEqual([])
    expect(findUnscannable(root).unscannable).toHaveLength(1)
  })

  test('a symlinked skill directory is named and blocked, never silently dropped', () => {
    const real = mkdtempSync(join(tmpdir(), 'vsk-real-'))
    mkdirSync(join(real, 'victim'), { recursive: true })
    writeFileSync(join(real, 'victim/SKILL.md'), SKILL_MD)
    const root = mkdtempSync(join(tmpdir(), 'vsk-link-'))
    symlinkSync(join(real, 'victim'), join(root, 'linked-skill'))

    expect(discoverSkills(root)).toEqual([])
    const { unscannable } = findUnscannable(root)
    expect(unscannable).toHaveLength(1)
    expect(evaluateScan(facts({ unscannable, skills: [] })).blocks[0]).toContain('was not scanned')
  })

  // An unrecognised severity was sorted below the blocking bar and then
  // described as "MEDIUM/LOW" in the summary.
  test('an unrecognised severity blocks instead of being ranked below the bar', () => {
    const r = evaluateScan(
      facts({ skills: [skill({ issues: [{ id: 'X9', severity: 'SEVERE', file: 'a.md', line: 3 }] })] }),
    )
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0]).toContain('unrecognised severity')
    expect(r.warns.join(' ')).not.toContain('MEDIUM/LOW')
  })

  test('an indented or bulleted knob is still read — an unseen knob disables the gate', () => {
    expect(resolveScanRoot('## Knobs\n\n  skill-scan: packages/cli/skill\n')).toBe('packages/cli/skill')
    expect(resolveScanRoot('- skill-scan: skills/\n')).toBe('skills/')
    expect(resolveScanRoot('  - skill-scan: none\n')).toBeNull()
  })

  // Regression introduced BY the forgiving-regex fix and caught on re-review:
  // tolerating bullets let a prose example match, and first-match-wins meant an
  // example of `skill-scan: none` above the real knob silently disabled the gate.
  test('a prose example above the real knob is an ambiguity that blocks, never a silent skip', () => {
    const profile = join(mkdtempSync(join(tmpdir(), 'vsk-ambig-')), 'dev.md')
    writeFileSync(
      profile,
      '## Notes\n\n- skill-scan: none  <- example of turning it off\n\n## Knobs\n\nskill-scan: packages/cli/skill\n',
    )
    const proc = Bun.spawnSync(['node', join(import.meta.dir, '../scripts/skill-scan.mjs'), '--dev-md', profile, '--json'], {
      cwd: join(import.meta.dir, '../../../..'),
      env: { ...process.env },
    })
    expect(proc.exitCode).toBe(2)
    expect(proc.stdout.toString()).toContain('declares skill-scan more than once')
  })

  test('declarations are collected in order so the caller can see disagreement', () => {
    expect(scanRootDeclarations('- skill-scan: none\n\nskill-scan: skills/\n')).toEqual(['none', 'skills/'])
    expect(scanRootDeclarations('skill-scan: skills/\n')).toEqual(['skills/'])
    expect(scanRootDeclarations('review: subagent\n')).toEqual([])
  })

  // Two-level discovery makes duplicate basenames reachable. A report path keyed
  // on the basename would let one skill's result stand in for another's — a
  // wrong verdict indistinguishable from a right one.
  test('two skills sharing a basename across groups get distinct reports and distinct names', () => {
    const root = mkdtempSync(join(tmpdir(), 'vsk-collide-'))
    for (const group of ['group-a', 'group-b']) {
      mkdirSync(join(root, group, 'twin'), { recursive: true })
      writeFileSync(join(root, group, 'twin/SKILL.md'), SKILL_MD)
    }
    expect(discoverSkills(root)).toHaveLength(2)

    const saved = { ...process.env }
    try {
      process.env.VSK_SKILLSPECTOR = fake
      const f = gatherFacts({ root, baselinePath: null, llm: false })
      expect(f.skills).toHaveLength(2)
      // Both must be present and distinguishable, not one name twice.
      expect(new Set(f.skills.map((e: { name: string }) => e.name)).size).toBe(2)
      expect(f.skills.map((e: { name: string }) => e.name).sort()).toEqual(['group-a/twin', 'group-b/twin'])
    } finally {
      process.env = saved
    }
  })

  test('the suppression warning names severities, not just a count', () => {
    const r = evaluateScan(
      facts({
        skills: [skill({ suppressedCount: 2, suppressed: [{ severity: 'HIGH' }, { severity: 'LOW' }] })],
      }),
    )
    expect(r.warns.join(' ')).toContain('1 HIGH')
  })
})
