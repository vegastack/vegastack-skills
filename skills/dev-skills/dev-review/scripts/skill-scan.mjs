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
