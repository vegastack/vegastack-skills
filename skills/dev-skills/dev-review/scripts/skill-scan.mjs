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
    // SkillSpector normalizes `id`/`rule_id` and `path`/`file` to one field each
    // (`path=raw.get("path") or raw.get("file")`). Missing the `file` alias would
    // both reject a valid baseline AND let `{"file": "*"}` past the wildcard
    // check below into a scanner that honours it.
    const id = raw.id ?? raw.rule_id;
    const path = raw.path ?? raw.file;
    const matchers = { id, path, message: raw.message };
    const present = Object.entries(matchers).filter(([, value]) => value !== undefined);
    if (present.length === 0) {
      errors.push(`${label}: no matcher (id, path, or message) — a rule with no matcher suppresses every finding`);
    }
    // Matchers must be LITERAL. Chasing wildcard shapes is an arms race that
    // was lost at the first attempt: `*` was rejected and `?*` silenced every
    // finding just the same, as do `*.md`, `[a-z]*` and `*SKILL*`. The rule
    // this project already states — "scope a rule as narrowly as its cause" —
    // is mechanically checkable only as "name the thing". A project that wants
    // two files writes two rules, which is the more reviewable artifact anyway.
    for (const [field, value] of present) {
      if (typeof value !== 'string' || !value.trim()) {
        errors.push(`${label}: "${field}" must be a non-empty string, got ${JSON.stringify(value)}`);
        continue;
      }
      const glob = value.match(/[*?[\]]/);
      if (glob) {
        errors.push(`${label}: "${field}" contains the glob character "${glob[0]}" ("${value}") — matchers must be literal so a rule cannot silence more than the cause it names; write one rule per file`);
      }
    }
    errors.push(...reasonErrors(raw, label, true));
    rules.push({ id, path, message: raw.message, reason: raw.reason });
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
  // its own — the re-trigger condition a rule has to state in prose. This check
  // catches the common accident, committing `skillspector baseline` output
  // verbatim, since that writes every finding as a fingerprint carrying the
  // default reason. It does NOT stop someone passing `--reason` with a clause
  // in it: a deliberate mass-suppression is caught by review of the diff and by
  // the suppression counts in the report, not by this guard.
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
// otherwise children AND grandchildren are examined — two levels, matching the
// authored layout's own cap (`skills/<name>/` and `skills/<group>/<name>/`), so
// pointing the knob at a grouped tree scans it instead of silently finding
// nothing. Dot-prefixed entries are skipped: a crashed scaffolder's
// `.name.scaffold-XXXX` leftover must never read as a skill. Symlinked
// directories are not followed — a scanner that traverses out of its root scans
// something other than what it reports on.
function childDirectories(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

export function discoverSkills(root) {
  if (!root || !existsSync(root)) return [];
  const absolute = resolve(root);
  if (existsSync(join(absolute, 'SKILL.md'))) return [absolute];

  const found = [];
  for (const child of childDirectories(absolute)) {
    if (existsSync(join(child, 'SKILL.md'))) {
      found.push(child);
      continue;
    }
    // One level deeper, for the grouped authored layout (`<root>/<group>/<skill>/`).
    // Without this a grouped tree scans as ZERO skills while reporting success on
    // whatever else it found — coverage silently lost, which is the whole defect
    // class this guard exists to stop.
    for (const grandchild of childDirectories(child)) {
      if (existsSync(join(grandchild, 'SKILL.md'))) found.push(grandchild);
    }
  }
  return found.sort();
}

// Anything that LOOKS like a skill but discovery did not scan. Defined as the
// difference between a deep walk and `discoverSkills`, rather than as a list of
// known-bad shapes — so it stays correct by construction when discovery changes.
// It catches: skills nested deeper than the layout allows, dot-prefixed
// directories, and symlinked directories that either are a skill or contain
// one. Symlinks are still never followed for scanning (a scanner that walks out
// of its root reports on something it was not pointed at) — but dropping them
// silently is coverage loss dressed as a clean run, so they are named and the
// caller blocks.
const WALK_DEPTH = 4;

function deepSkillDirs(dir, depth, seen) {
  if (depth > WALK_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // Not descended. Flag it if the target is, or holds, a skill.
      if (existsSync(join(child, 'SKILL.md'))) {
        seen.add(child);
        continue;
      }
      for (const nested of childDirectories(child)) {
        if (existsSync(join(nested, 'SKILL.md'))) seen.add(child);
      }
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (existsSync(join(child, 'SKILL.md'))) seen.add(child);
    deepSkillDirs(child, depth + 1, seen);
  }
}

export function findUnscannable(root) {
  if (!root || !existsSync(root)) return [];
  const absolute = resolve(root);
  const scanned = new Set(discoverSkills(absolute));
  const seen = new Set();
  deepSkillDirs(absolute, 1, seen);
  return [...seen].filter((dir) => !scanned.has(dir)).sort();
}

// The severities that stop a push. Deliberately NOT the aggregate risk score:
// a score is inflated by unresolvable-path artifacts in meta-content and
// deflated by suppressing unrelated findings, so it answers a question nobody
// asked. Individual findings are what a reviewer triages.
const BLOCKING = new Set(['HIGH', 'CRITICAL']);
// Everything the scanner is known to emit. A severity outside this set is
// upstream drift, and drift must fail CLOSED: silently sorting an unrecognised
// severity under the blocking bar and then calling it "MEDIUM/LOW" would be a
// false success dressed as a summary line.
const KNOWN_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

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
  for (const path of facts.unscannable ?? []) {
    blocks.push(`${path} holds a SKILL.md but was not scanned — nested deeper than the layout allows, dot-prefixed, or behind a symlink discovery will not follow out of the scan root. Move it into place, or scan it directly with --root`);
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
    // A degraded run reports a HIGHER score than a clean one (a failed analyzer
    // leaves its findings unfiltered), so "no blocking finding" from a degraded
    // scan proves nothing. But `status: "partial"` on its own is the NORMAL
    // result for documentation-heavy skills — it is what unresolved path-like
    // references produce — so blocking on it would block every scan forever,
    // the same trap as gating on the aggregate score. Block only on the signals
    // that mean work did not happen.
    const { status, limitations, entirelyUninspected, partiallyInspected } = entry.completeness ?? {};
    if (status && status !== 'complete' && status !== 'partial') {
      blocks.push(`${entry.name}: the scan reported completeness "${status}" — only "complete" or "partial" is a result you can act on`);
      continue;
    }
    if (limitations?.length) {
      blocks.push(`${entry.name}: an analyzer did not finish (${limitations.join('; ')}) — a degraded scan scores HIGHER than a clean one, so its silence proves nothing`);
      continue;
    }
    if (entirelyUninspected > 0) {
      blocks.push(`${entry.name}: ${entirelyUninspected} file(s) were never inspected — an unread file is not a clean file`);
      continue;
    }
    // Distinct from `status: "partial"`, which every healthy scan here reports.
    // Measured across all twelve skills, `partially_inspected_files` is 0 on a
    // healthy run, so this blocks only genuinely truncated coverage.
    if (partiallyInspected > 0) {
      blocks.push(`${entry.name}: ${partiallyInspected} file(s) were only partly inspected — the unread remainder is exactly where something would hide`);
      continue;
    }
    // A scan that read nothing reports "complete" with zero findings, which is
    // indistinguishable from a clean skill. Reachable with a symlinked or
    // unreadable SKILL.md: the scanner sees no bytes and says so by counting
    // them, which is the only place this shows up.
    if (entry.completeness?.fullyInspected === 0) {
      blocks.push(`${entry.name}: the scanner inspected 0 files — an empty read is not a clean result (unreadable or symlinked content?)`);
      continue;
    }
    for (const issue of entry.issues ?? []) {
      const severity = String(issue.severity).toUpperCase();
      const at = issue.line == null ? issue.file : `${issue.file}:${issue.line}`;
      if (!KNOWN_SEVERITIES.has(severity)) {
        blocks.push(`${entry.name}: unrecognised severity "${issue.severity}" for ${issue.id} at ${at} — refusing to rank an unknown severity below the bar`);
        continue;
      }
      if (!BLOCKING.has(severity)) continue;
      blocks.push(`${entry.name}: ${issue.severity} ${issue.id} at ${at} — fix it, or add a justified baseline rule on the operator's word`);
    }
  }

  if (baselineMissing) {
    warns.push('no baseline file — every finding counts, including ones previously adjudicated as structural');
  }
  const suppressed = skills.reduce((total, entry) => total + (entry.suppressedCount ?? 0), 0);
  if (suppressed > 0) {
    // A bare count hides what was silenced. Ten LOW suppressions and ten HIGH
    // ones are very different facts about a baseline, and the second is the one
    // worth reading before trusting a green run.
    const bySeverity = {};
    for (const entry of skills) {
      for (const item of entry.suppressed ?? []) {
        const key = String(item?.severity ?? 'UNKNOWN').toUpperCase();
        bySeverity[key] = (bySeverity[key] ?? 0) + 1;
      }
    }
    const breakdown = Object.entries(bySeverity)
      .sort()
      .map(([severity, count]) => `${count} ${severity}`)
      .join(', ');
    warns.push(
      `${suppressed} finding(s) suppressed by the baseline${breakdown ? ` (${breakdown})` : ''} — read it when a result surprises you`,
    );
  }
  const belowBar = skills.reduce(
    (total, entry) =>
      total +
      (entry.issues ?? []).filter((i) => {
        const severity = String(i.severity).toUpperCase();
        return KNOWN_SEVERITIES.has(severity) && !BLOCKING.has(severity);
      }).length,
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
// Conventional home for the project's suppressions, beside dev.md — one fewer
// knob, and it means the documented one-command invocation actually applies them.
export const DEFAULT_BASELINE = '.vegastack/skillspector-baseline.json';

// Tolerates the shapes a hand-edited profile actually takes — indented under a
// heading, or written as a list item. A knob the guard cannot see reads as
// absent, and absent silently disables the gate, so the match is deliberately
// forgiving about layout and strict about the value.
const KNOB_LINE = /^[ \t]*(?:[-*+][ \t]+)?skill-scan:[ \t]*(\S+)/gm;

// Every `skill-scan:` value the profile declares. Tolerating indentation and
// list bullets means a prose EXAMPLE can also match — and with first-match-wins
// an example of `skill-scan: none` sitting above the real knob silently
// disabled the gate. The caller blocks when these disagree rather than picking
// one; guessing which line the author meant is exactly the judgement a guard
// must not make.
export function scanRootDeclarations(devMdText) {
  return [...String(devMdText ?? '').matchAll(KNOB_LINE)].map((match) => match[1]);
}

export function resolveScanRoot(devMdText) {
  const value = scanRootDeclarations(devMdText)[0];
  if (!value || value === 'none') return null;
  return value;
}

// Findings carry file names and rule ids that originate in SCANNED content, and
// this guard's output is read in a terminal. Strip C0/C1 controls (ANSI escapes
// included) so a crafted path cannot repaint or forge lines of the report.
function safe(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');
}

function normalizeIssue(raw) {
  const location = raw.location ?? {};
  return {
    id: safe(raw.id ?? raw.rule_id ?? raw.finding_id ?? 'UNKNOWN'),
    severity: safe(raw.severity ?? 'UNKNOWN'),
    file: safe(location.file ?? raw.file ?? '(unknown file)'),
    line: location.start_line ?? null,
  };
}

// Impure: shells out to the scanner, once per skill. `--baseline` is rejected
// together with `--recursive` ("scan each sub-skill with its own baseline"), so
// the loop is the supported path, not an optimization we passed up.
export function gatherFacts({ root, baselinePath, llm }) {
  // VSK_SKILLSPECTOR is a TEST SEAM (stubs the scanner in unit tests), mirroring
  // ship-gate.mjs's VSK_GH. Normal runs resolve `skillspector` from PATH.
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
  // Short-circuit: with a bad baseline nothing the scan reports is trustworthy —
  // suppressions may not apply — and the scanner would reject the file once per
  // skill anyway. Block on the real reason instead of after N wasted invocations.
  if (base.baselineErrors.length > 0) return base;

  // Paths here are attacker-chosen directory names in a third-party tree, and
  // they are printed verbatim in block lines.
  base.unscannable = findUnscannable(root).map(safe);

  const outDir = mkdtempSync(join(tmpdir(), 'vsk-skill-scan-'));
  const discovered = discoverSkills(root);
  // Two skills can share a basename across groups; the report must say which is
  // which, so an ambiguous name is qualified with its parent directory.
  const basenameCounts = {};
  for (const dir of discovered) basenameCounts[basename(dir)] = (basenameCounts[basename(dir)] ?? 0) + 1;

  for (const [index, dir] of discovered.entries()) {
    const bare = basename(dir);
    // Sanitized: this comes from a DIRECTORY NAME on disk, which in a
    // third-party skill tree is attacker-chosen, and it is printed to a terminal
    // and embedded in every block line.
    const name = safe(basenameCounts[bare] > 1 ? `${basename(resolve(dir, '..'))}/${bare}` : bare);
    // Indexed, not named: two-level discovery makes duplicate basenames possible
    // (`<root>/a/foo/` and `<root>/b/foo/`), and a shared report path would let
    // one skill's result stand in for another's — a wrong verdict that looks
    // exactly like a right one. `index` is unique per run by construction.
    const reportPath = join(outDir, `${index}.json`);
    const args = ['scan', dir, '--format', 'json', '--output', reportPath];
    if (!llm) args.push('--no-llm');
    if (baselineUsable) args.push('--baseline', baselinePath);

    try {
      // `env` is passed explicitly, as ship-gate.mjs does: under Bun a mutated
      // process.env is NOT inherited by execFileSync children, so the seam and
      // any scanner configuration (SKILLSPECTOR_PROVIDER, etc.) would be lost.
      execFileSync(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        // A hung or runaway scanner must fail the gate, not hold it open forever.
        timeout: Number(process.env.VSK_SKILLSPECTOR_TIMEOUT_MS) || 300_000,
        maxBuffer: 64 * 1024 * 1024,
      });
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
      base.scanErrors.push({ skill: name, message: safe(error.message) });
      continue;
    }
    // A report whose shape we do not recognise must fail loudly. Reading a
    // missing `issues` key as "no findings" is the exact false-success this
    // guard exists to prevent, and the scanner is upstream software on a fast
    // cadence — a renamed key would otherwise turn every skill green.
    if (!report || typeof report !== 'object' || Array.isArray(report) || !Array.isArray(report.issues)) {
      base.scanErrors.push({
        skill: name,
        message: 'report has no "issues" array — unrecognised shape, refusing to read it as "no findings"',
      });
      continue;
    }

    const assessment = report.risk_assessment ?? {};
    const completeness = report.analysis_completeness ?? {};
    base.skills.push({
      name,
      score: assessment.score ?? null,
      severity: assessment.severity ?? 'UNKNOWN',
      executionSuccessful: report.execution_successful !== false,
      suppressedCount: report.suppressed_count ?? 0,
      // The scanner derives status from: "failed" when a ledger exception was
      // fatal, else "partial" when anything was left uninspected or an analyzer
      // reported a limitation, else "complete". `limitations` is the signal that
      // an ANALYZER did not finish — distinct from the reference-resolution
      // exceptions that make a healthy scan of documentation-heavy skills
      // "partial". See the degradation rules in evaluateScan.
      completeness: {
        status: completeness.status ?? 'unknown',
        // Sanitized: analyzer messages are printed in block lines and can carry
        // text derived from the scanned content.
        limitations: (Array.isArray(completeness.limitations) ? completeness.limitations : []).map(safe),
        entirelyUninspected: completeness.entirely_uninspected_files ?? 0,
        partiallyInspected: completeness.partially_inspected_files ?? 0,
        fullyInspected: completeness.fully_inspected_files ?? 0,
        coveragePercent: completeness.coverage_percent ?? null,
      },
      // The scanner's own list of what the baseline silenced. The Security axis
      // is told to judge whether each suppression was scoped to its cause, which
      // it cannot do from a count — and this evidence is right here in the report.
      suppressed: Array.isArray(report.suppressed) ? report.suppressed : [],
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
  const explicitRoot = Boolean(root);
  let skipped = false;
  let outcome = { blocks: [], warns: [] };
  let facts = { skills: [] };
  let baselinePath = get('--baseline') ?? null;

  if (!explicitRoot) {
    // "Could not read the profile" and "the profile says none" are different
    // answers. Collapsing them let the guard report a clean skip from any
    // directory that simply has no dev.md — a gate that silently disables
    // itself when run from the wrong cwd.
    let devMd = null;
    try {
      devMd = readFileSync(devMdPath, 'utf8');
    } catch (error) {
      outcome.blocks.push(`cannot read ${devMdPath} (${error.code ?? error.message}) — pass --dev-md <path>, or --root to scan a directory directly`);
    }
    if (devMd !== null) {
      const declared = [...new Set(scanRootDeclarations(devMd))];
      if (declared.length > 1) {
        outcome.blocks.push(
          `${devMdPath} declares skill-scan more than once (${declared.join(', ')}) — an example line above the real knob silently disables the gate; leave exactly one`,
        );
      }
      root = resolveScanRoot(devMd);
      skipped = root === null && declared.length <= 1;
      // The project's own suppressions apply to the project's own skills. They
      // are NOT inherited by an ad-hoc `--root` scan of someone else's skill,
      // where a rule written for our content could silence a real finding in
      // theirs.
      if (!skipped && !baselinePath && existsSync(DEFAULT_BASELINE)) baselinePath = DEFAULT_BASELINE;
    }
  }

  if (!skipped && outcome.blocks.length === 0) {
    // An uncaught throw would leave node exiting 1 — which in this guard's own
    // scheme reads as "pass with warnings". A crash is not a pass.
    try {
      facts = gatherFacts({ root, baselinePath, llm: argv.includes('--llm') });
      outcome = evaluateScan(facts);
    } catch (error) {
      facts = { skills: [] };
      outcome = { blocks: [`the scan failed unexpectedly: ${error.message}`], warns: [] };
    }
  }

  const ok = outcome.blocks.length === 0;
  if (json) {
    console.log(JSON.stringify({
      guard: 'skill-scan',
      ok,
      skipped,
      ...outcome,
      // The full normalized issue list, not a count: dev-review's Security axis
      // is told to read the source at each finding's file:line and to judge
      // whether a suppression was scoped to its cause. A count makes both
      // impossible, and this report is the axis's input.
      skills: facts.skills.map(({ name, score, severity, suppressedCount, suppressed, completeness, issues }) => ({
        name, score, severity, suppressedCount, suppressed, completeness, findings: issues.length, issues,
      })),
    }, null, 2));
  } else if (skipped) {
    console.log(`skill-scan: skipped — ${devMdPath} names no scan root (skill-scan: none or absent)`);
  } else if (facts.skills.length === 0 && outcome.blocks.length > 0) {
    console.log('skill-scan: BLOCKED');
    for (const b of outcome.blocks) console.log(`  block: ${b}`);
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
