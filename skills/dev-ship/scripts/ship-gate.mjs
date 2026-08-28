#!/usr/bin/env node
// dev-ship guard, run at Gate 1 before a PR (and re-run before merge): the
// deterministic facts that make a hand-back shippable. Facts block; the
// rationalization scan over the evidence text only warns — regex heuristics
// never block. Self-contained (ships with dev-ship; no cross-skill imports).
//
// Usage: node ship-gate.mjs --issue <n> --branch <name> [--repo o/r] [--dev-md <path>]
//        [--base main] [--allow-no-changelog "<reason>"] --json
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATIONALIZATIONS = [
  /skip(ping)? tests? for now/i,
  /pre-existing (issue|bug)/i,
  /fix (this|it) later/i,
  /(tests?|coverage) (is|are) (failing|broken) but/i,
];

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function parseMarker(body) {
  const match = /<!--\s*vsk:v1\s+([^>]*?)\s*-->/.exec(body ?? '');
  if (!match) return null;
  const keys = {};
  for (const pair of match[1].split(/\s+/)) {
    const eq = pair.indexOf('=');
    if (eq > 0) keys[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { keys };
}

// Pure evaluation over gathered facts — unit tests drive this directly.
export function evaluateShipGate(facts) {
  const blocks = [];
  const warns = [];
  const {
    evidence,            // { body } | null
    reviewVerdict,       // 'clean' | 'needs-fixes' | null
    adjudicated,         // boolean: evidence Review section carries adjudication rulings
    headSha,             // short sha of the branch head
    diffText,            // full diff vs base
    changelogTouched,    // boolean: diff adds a changelog/changeset entry
    allowNoChangelog,    // reason string | undefined
    checkExit,           // number | null (null = no check command configured)
  } = facts;

  if (!evidence) {
    blocks.push('no evidence comment (marker type=evidence) on the issue');
    return { blocks, warns };
  }
  const marker = parseMarker(evidence.body);
  const evidenceSha = marker?.keys?.sha ?? '';

  if (!/^[0-9a-f]{7,40}$/.test(evidenceSha)) {
    blocks.push(`evidence marker carries no valid sha= (found "${evidenceSha || 'nothing'}") — the shipped revision must be named`);
  } else if (!headSha.startsWith(evidenceSha) && !evidenceSha.startsWith(headSha)) {
    // Strict equality, no reconciliation window: the corrections loop updates
    // the evidence comment (Docs line AND sha) after every change, so a
    // mismatched sha means unrecorded work. An "edited since the commit"
    // window was spoofable by any comment edit and was removed.
    blocks.push(`branch head ${headSha} moved past evidence sha ${evidenceSha} — the corrections loop must re-verify and update the evidence comment (Docs line + new sha) before shipping`);
  }

  if (!changelogTouched && !allowNoChangelog) {
    blocks.push('no changelog/changeset entry in the diff and no --allow-no-changelog reason given');
  }

  if (facts.chronicleOn && !facts.chronicleTouched && !allowNoChangelog) {
    blocks.push('dev.md says chronicle: on but the diff adds no .vegastack/chronicle.md entry (the same --allow-no-changelog reason covers docs/test-only branches)');
  }

  if (reviewVerdict !== 'clean' && !adjudicated) {
    blocks.push(`latest review verdict is ${reviewVerdict ?? 'absent'} and the evidence Review section carries no adjudication`);
  }

  if (facts.checkoutMismatch) {
    blocks.push(facts.checkoutMismatch);
  }
  if (checkExit !== null && checkExit !== 0) {
    blocks.push(`the project check command exited ${checkExit} on a fresh run — a claim is never trusted, always re-proven`);
  }

  // Added lines only: context/removed lines and docs that merely mention the
  // tag (dev-debug's own SKILL.md) must not false-block.
  if (/^\+(?!\+\+).*\[DEBUG-/m.test(diffText)) {
    blocks.push('the diff adds [DEBUG- tagged instrumentation — dev-debug cleanup was skipped');
  }

  for (const pattern of RATIONALIZATIONS) {
    const hit = pattern.exec(evidence.body);
    if (hit) warns.push(`rationalization wording in evidence: "${hit[0]}" — heuristics never block, but read it twice`);
  }

  return { blocks, warns };
}

export function gatherFacts(flags) {
  const repo = flags.repo || sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  const base = flags.base || 'main';
  const branch = flags.branch;
  const comments = JSON.parse(sh('gh', ['api', `repos/${repo}/issues/${flags.issue}/comments`, '--paginate']));

  let evidence = null;
  let reviewVerdict = null;
  for (const comment of comments) {
    const marker = parseMarker(comment.body);
    if (marker?.keys?.type === 'evidence') evidence = { body: comment.body, updatedAt: comment.updated_at };
    if (marker?.keys?.type === 'review') reviewVerdict = marker.keys.verdict ?? null;
  }
  const reviewSection = /\*\*Review:\*\*[\s\S]*?(?=\n\*\*[A-Z]|\nBranch:|$)/.exec(evidence?.body ?? '')?.[0] ?? '';
  const adjudicated = /(adjudicat|parked|ruling)/i.test(reviewSection);

  const headSha = sh('git', ['rev-parse', '--short=7', branch]);
  const diffText = sh('git', ['diff', `${base}...${branch}`]);
  // The fresh check run and dev.md read use the WORKING TREE — they prove
  // nothing unless the checkout is the branch under review.
  const checkoutSha = sh('git', ['rev-parse', 'HEAD']);
  const branchSha = sh('git', ['rev-parse', branch]);
  const checkoutMismatch = checkoutSha === branchSha
    ? null
    : `the current checkout (${checkoutSha.slice(0, 7)}) is not the branch under review (${branch} @ ${branchSha.slice(0, 7)}) — run ship-gate from that branch so the fresh check proves the right code`;

  const devMd = readFileSync(flags['dev-md'] || '.vegastack/dev.md', 'utf8');
  const changelogKnob = (/^changelog:\s*(\S+)/m.exec(devMd) || [])[1] ?? 'none';
  // Added files/lines only — a deleted changeset or the +++ diff header must
  // not count as an entry.
  const changelogTouched = changelogKnob === 'none'
    ? true
    : changelogKnob === 'changesets'
      ? /^\+\+\+ b\/\.changeset\/(?!config)/m.test(diffText)
      : /^\+(?!\+\+)[^\n]*\S/m.test(sh('git', ['diff', `${base}...${branch}`, '--', 'CHANGELOG.md']) || '');

  const chronicleOn = /^chronicle:\s*on\b/m.test(devMd);
  const chronicleTouched = /^\+\+\+ b\/\.vegastack\/chronicle\.md/m.test(diffText)
    || /^\+(?!\+\+)[^\n]*\S/m.test(sh('git', ['diff', `${base}...${branch}`, '--', '.vegastack/chronicle.md']) || '');

  let checkExit = null;
  const checkCmd = (/^commands:.*?check\s+`([^`]+)`/m.exec(devMd) || [])[1];
  if (checkCmd) {
    try {
      execFileSync('sh', ['-c', checkCmd], { stdio: ['ignore', 'pipe', 'pipe'] });
      checkExit = 0;
    } catch (error) {
      checkExit = error.status ?? 1;
    }
  }

  return {
    evidence, reviewVerdict, adjudicated, headSha, diffText,
    changelogTouched, chronicleOn, chronicleTouched,
    allowNoChangelog: flags['allow-no-changelog'], checkExit, checkoutMismatch,
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const get = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const flags = {
    issue: get('--issue'), branch: get('--branch'), repo: get('--repo'), base: get('--base'),
    'dev-md': get('--dev-md'), 'allow-no-changelog': get('--allow-no-changelog'), json,
  };
  let outcome;
  if (!flags.issue || !flags.branch) {
    outcome = { blocks: ['usage: ship-gate.mjs --issue <n> --branch <name> [--json]'], warns: [] };
  } else {
    try {
      outcome = evaluateShipGate(gatherFacts(flags));
    } catch (error) {
      outcome = { blocks: [`cannot verify: ${error.message}`], warns: [] };
    }
  }
  const ok = outcome.blocks.length === 0;
  const exitCode = ok ? (outcome.warns.length ? 1 : 0) : 2;
  if (json) {
    console.log(JSON.stringify({ guard: 'ship-gate', ok, ...outcome }, null, 2));
  } else {
    console.log(`ship-gate: ${ok ? (outcome.warns.length ? 'pass with warnings' : 'pass') : 'BLOCKED'}`);
    for (const b of outcome.blocks) console.log(`  block: ${b}`);
    for (const w of outcome.warns) console.log(`  warn: ${w}`);
  }
  process.exit(exitCode);
}
