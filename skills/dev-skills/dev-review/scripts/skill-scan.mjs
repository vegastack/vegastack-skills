#!/usr/bin/env node
// dev-review guard: scans the project's agent skills with NVIDIA SkillSpector and
// blocks on any unsuppressed HIGH/CRITICAL finding. Facts block; heuristics warn.
// The scanner's own exit code (0 for score <= 50) is never the verdict — an
// aggregate score is distorted by meta-content, individual findings are not.
// Self-contained (ships with dev-review; no cross-skill imports, no dependencies).
//
// Exit codes: 0 pass (or skipped) · 1 pass-with-warnings · 2 blocked.
// Usage: node skill-scan.mjs [--root <path>] [--dev-md <path>] [--baseline <path>]
//        [--llm] [--json]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The clause every suppression must carry, mirroring the "Still flag if:"
// requirement on .vegastack/review-known-patterns.md entries: a suppression
// without a stated re-trigger condition is a blind spot, not a decision.
const CLAUSE = /still flag if:/i;

// SkillSpector's own default when `skillspector baseline` writes a file without
// --reason. Committing one of those suppresses every current finding at once.
const PLACEHOLDER = /auto-generated baseline/i;

function reasonErrors(entry, label, requireClause) {
  const errors = [];
  const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
  if (!reason) {
    errors.push(`${label}: missing reason — every suppression states why the pattern is structural here`);
    return errors;
  }
  if (PLACEHOLDER.test(reason)) {
    errors.push(`${label}: placeholder reason ("${reason}") — write why this pattern is structural, never the scanner's default`);
  }
  if (requireClause && !CLAUSE.test(reason)) {
    errors.push(`${label}: reason has no "Still flag if:" clause — a suppression without a re-trigger condition is a blind spot`);
  }
  return errors;
}

// Returns { rules, fingerprints, errors }. Never throws: unreadable content comes
// back as an error so the caller can block on it like any other fact.
export function parseBaseline(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { rules: [], fingerprints: [], errors: [`baseline is not valid JSON: ${error.message}`] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { rules: [], fingerprints: [], errors: ['baseline must be a JSON object'] };
  }

  const errors = [];
  const rawRules = Array.isArray(data.rules) ? data.rules : [];
  const rawFingerprints = Array.isArray(data.fingerprints) ? data.fingerprints : [];
  if (data.rules !== undefined && !Array.isArray(data.rules)) errors.push('baseline "rules" must be an array');
  if (data.fingerprints !== undefined && !Array.isArray(data.fingerprints)) errors.push('baseline "fingerprints" must be an array');

  const rules = [];
  rawRules.forEach((raw, index) => {
    const label = `rule ${index + 1}`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${label}: not an object`);
      return;
    }
    // SkillSpector accepts either key; normalize so callers see one shape.
    const id = raw.id ?? raw.rule_id;
    if (id === undefined && raw.path === undefined && raw.message === undefined) {
      errors.push(`${label}: no matcher (id, path, or message) — a rule with no matcher suppresses every finding`);
    }
    errors.push(...reasonErrors(raw, label, true));
    rules.push({ id, path: raw.path, message: raw.message, reason: raw.reason });
  });

  // The scanner rejects a v2 baseline that carries fingerprints without pinning
  // the version they were computed against, and it does so per invocation — so
  // catching it here turns twelve confusing "no readable report" failures into
  // one sentence naming the actual problem.
  if (rawFingerprints.length > 0 && !data.scanner_version) {
    errors.push('a v2 baseline with fingerprints must set "scanner_version" (the scanner rejects it otherwise)');
  }

  // Fingerprints get the same reason discipline minus the clause: they are
  // content-hashed, so editing the surrounding file re-triggers the finding on
  // its own — the re-trigger condition a rule has to state in prose. Without
  // this check the whole discipline is bypassed by committing the output of
  // `skillspector baseline`, which writes every finding as a fingerprint.
  rawFingerprints.forEach((raw, index) => {
    const label = `fingerprint ${index + 1}`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${label}: not an object`);
      return;
    }
    errors.push(...reasonErrors(raw, label, false));
  });

  return { rules, fingerprints: rawFingerprints, errors };
}

// Absolute paths, sorted, of the skill directories under `root`. A directory is
// a skill iff it holds a SKILL.md. The root itself counts when it holds one;
// otherwise its immediate children are examined — ONE level, matching the
// authored layout's own depth cap. Dot-prefixed entries are skipped: a crashed
// scaffolder's `.name.scaffold-XXXX` leftover must never read as a skill.
// Symlinks are not followed — a scanner that traverses out of its root is a
// scanner that scans something other than what it reports on.
export function discoverSkills(root) {
  if (!root || !existsSync(root)) return [];
  const absolute = resolve(root);
  if (existsSync(join(absolute, 'SKILL.md'))) return [absolute];

  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => join(absolute, entry.name))
    .filter((dir) => existsSync(join(dir, 'SKILL.md')))
    .sort();
}

// The severities that stop a push. Deliberately NOT the aggregate risk score:
// a score is inflated by unresolvable-path artifacts in meta-content and
// deflated by suppressing unrelated findings, so it answers a question nobody
// asked. Individual findings are what a reviewer triages.
const BLOCKING = new Set(['HIGH', 'CRITICAL']);

const INSTALL_HINT = 'install it with `uv tool install git+https://github.com/NVIDIA/skillspector.git`';

// Pure evaluation over gathered facts — unit tests drive this directly.
export function evaluateScan(facts) {
  const blocks = [];
  const warns = [];
  const {
    binaryMissing,
    rootMissing,
    baselineMissing,
    baselineErrors = [],
    skills = [],
    scanErrors = [],
  } = facts;

  // Environment failures first: when the scanner never ran, a finding list is
  // not evidence of anything, and the real cause must read before the noise.
  if (binaryMissing) {
    blocks.push(`the \`skillspector\` binary is not on PATH — ${INSTALL_HINT}, or set skill-scan: none if this project has no skills`);
  }
  if (rootMissing) {
    blocks.push(`scan root "${rootMissing}" does not exist — build it first if it is a build output, or correct dev.md's skill-scan: knob`);
  }
  for (const error of baselineErrors) {
    blocks.push(`baseline: ${error}`);
  }
  for (const { skill, message } of scanErrors) {
    blocks.push(`${skill}: the scan did not produce a readable report (${message}) — an unscanned skill is not a clean skill`);
  }

  if (blocks.length > 0) return { blocks, warns };

  if (skills.length === 0) {
    blocks.push('no skills found under the scan root — a root with nothing in it is a misconfigured knob, not a clean result');
    return { blocks, warns };
  }

  for (const entry of skills) {
    if (!entry.executionSuccessful) {
      blocks.push(`${entry.name}: the scan did not complete (execution_successful: false) — a partial score is not a verdict`);
      continue;
    }
    for (const issue of entry.issues ?? []) {
      if (!BLOCKING.has(String(issue.severity).toUpperCase())) continue;
      const at = issue.line == null ? issue.file : `${issue.file}:${issue.line}`;
      blocks.push(`${entry.name}: ${issue.severity} ${issue.id} at ${at} — fix it, or add a justified baseline rule on the operator's word`);
    }
  }

  if (baselineMissing) {
    warns.push('no baseline file — every finding counts, including ones previously adjudicated as structural');
  }
  const suppressed = skills.reduce((total, entry) => total + (entry.suppressedCount ?? 0), 0);
  if (suppressed > 0) {
    warns.push(`${suppressed} finding(s) suppressed by the baseline — read it when a result surprises you`);
  }
  const belowBar = skills.reduce(
    (total, entry) => total + (entry.issues ?? []).filter((i) => !BLOCKING.has(String(i.severity).toUpperCase())).length,
    0,
  );
  if (belowBar > 0) {
    warns.push(`${belowBar} MEDIUM/LOW finding(s) below the blocking bar — the security axis triages these`);
  }

  return { blocks, warns };
}

// The dev.md knob naming the directory to scan. `none` or absent means this
// project authors no skills — the guard skips rather than erroring, so callers
// run one unconditional command instead of honouring a rule written in prose.
export function resolveScanRoot(devMdText) {
  const value = (/^skill-scan:\s*(\S+)/m.exec(devMdText ?? '') || [])[1];
  if (!value || value === 'none') return null;
  return value;
}

function normalizeIssue(raw) {
  const location = raw.location ?? {};
  return {
    id: raw.id ?? raw.rule_id ?? raw.finding_id ?? 'UNKNOWN',
    severity: raw.severity ?? 'UNKNOWN',
    file: location.file ?? raw.file ?? '(unknown file)',
    line: location.start_line ?? null,
  };
}

// Impure: shells out to the scanner, once per skill. `--baseline` is rejected
// together with `--recursive` ("scan each sub-skill with its own baseline"), so
// the loop is the supported path, not an optimization we passed up.
export function gatherFacts({ root, baselinePath, llm }) {
  const binary = process.env.VSK_SKILLSPECTOR || 'skillspector';
  const base = {
    binaryMissing: false,
    rootMissing: null,
    baselineMissing: !baselinePath,
    baselineErrors: [],
    skills: [],
    scanErrors: [],
  };

  if (!root || !existsSync(root)) return { ...base, rootMissing: root ?? '(unset)' };

  const baselineUsable = Boolean(baselinePath) && existsSync(baselinePath);
  if (baselinePath && !baselineUsable) base.baselineMissing = true;
  if (baselineUsable) base.baselineErrors = parseBaseline(readFileSync(baselinePath, 'utf8')).errors;

  const outDir = mkdtempSync(join(tmpdir(), 'vsk-skill-scan-'));
  for (const dir of discoverSkills(root)) {
    const name = basename(dir);
    const reportPath = join(outDir, `${name}.json`);
    const args = ['scan', dir, '--format', 'json', '--output', reportPath];
    if (!llm) args.push('--no-llm');
    if (baselineUsable) args.push('--baseline', baselinePath);

    try {
      // `env` is passed explicitly, as ship-gate.mjs does: under Bun a mutated
      // process.env is NOT inherited by execFileSync children, so the seam and
      // any scanner configuration (SKILLSPECTOR_PROVIDER, etc.) would be lost.
      execFileSync(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    } catch (error) {
      // ENOENT means the binary itself is absent — a fact about the environment,
      // not about any skill, and it stops the whole run.
      if (error.code === 'ENOENT') return { ...base, binaryMissing: true };
      // Any other non-zero exit is expected: the scanner exits 1 whenever the
      // score exceeds 50, which says nothing about whether a finding blocks.
      // The report is the evidence; only its absence is a failure.
    }

    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch (error) {
      base.scanErrors.push({ skill: name, message: error.message });
      continue;
    }

    const assessment = report.risk_assessment ?? {};
    base.skills.push({
      name,
      score: assessment.score ?? null,
      severity: assessment.severity ?? 'UNKNOWN',
      executionSuccessful: report.execution_successful !== false,
      suppressedCount: report.suppressed_count ?? 0,
      issues: (report.issues ?? []).map(normalizeIssue),
    });
  }

  return base;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const json = argv.includes('--json');
  const devMdPath = get('--dev-md') || '.vegastack/dev.md';

  let root = get('--root');
  let skipped = false;
  if (!root) {
    let devMd = '';
    try {
      devMd = readFileSync(devMdPath, 'utf8');
    } catch {
      devMd = '';
    }
    root = resolveScanRoot(devMd);
    skipped = root === null;
  }

  let outcome = { blocks: [], warns: [] };
  let facts = { skills: [] };
  if (!skipped) {
    facts = gatherFacts({ root, baselinePath: get('--baseline') ?? null, llm: argv.includes('--llm') });
    outcome = evaluateScan(facts);
  }

  const ok = outcome.blocks.length === 0;
  if (json) {
    console.log(JSON.stringify({
      guard: 'skill-scan',
      ok,
      skipped,
      ...outcome,
      skills: facts.skills.map(({ name, score, severity, issues }) => ({
        name, score, severity, findings: issues.length,
      })),
    }, null, 2));
  } else if (skipped) {
    console.log(`skill-scan: skipped — ${devMdPath} names no scan root (skill-scan: none or absent)`);
  } else {
    console.log(`skill-scan: ${ok ? (outcome.warns.length ? 'pass with warnings' : 'pass') : 'BLOCKED'}`);
    for (const entry of facts.skills) {
      console.log(`  ${entry.name}: score ${entry.score} ${entry.severity} — ${entry.issues.length} finding(s)`);
    }
    for (const b of outcome.blocks) console.log(`  block: ${b}`);
    for (const w of outcome.warns) console.log(`  warn: ${w}`);
  }
  process.exit(ok ? (outcome.warns.length > 0 ? 1 : 0) : 2);
}
