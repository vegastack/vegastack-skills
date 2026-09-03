#!/usr/bin/env node
// dev-ship guard, run at Gate 1 before a PR (and re-run before merge): the
// deterministic facts that make a hand-back shippable. Facts block; the
// rationalization scan over the evidence text only warns — regex heuristics
// never block. Self-contained (ships with dev-ship; no cross-skill imports).
//
// Exit codes: 0 pass · 1 pass-with-warnings · 2 blocked (reasons printed).
// Usage: node ship-gate.mjs --issue <n> --branch <name> [--repo o/r] [--dev-md <path>]
//        [--base main] [--worktree <path>] [--allow-no-changelog "<reason>"] --json
//
// One feature, one worktree: the branch under review is normally checked out at
// .vegastack/.worktrees/<n>-<slug>/, not in the main checkout. The gate resolves
// that path itself (--worktree overrides) and runs every git call and the fresh
// check command there, so its checkout test passes by construction rather than
// forcing the operator to switch branches in the main checkout.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATIONALIZATIONS = [
  /skip(ping)? tests? for now/i,
  /pre-existing (issue|bug)/i,
  /fix (this|it) later/i,
  /(tests?|coverage) (is|are) (failing|broken) but/i,
];

function sh(cmd, args, cwd) {
  // VSK_GH is a TEST SEAM (stubs gh in unit tests); git always runs real.
  const bin = cmd === 'gh' ? (process.env.VSK_GH || 'gh') : cmd;
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env }, cwd }).trim();
}

// The path of the worktree holding a branch, read from
// `git worktree list --porcelain`. Null when no worktree holds it — which is a
// fact the caller reports, never one it papers over.
export function resolveWorktree(branch, porcelain) {
  let path = null;
  for (const raw of String(porcelain ?? '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length);
    else if (line === '') path = null;
    else if (line === 'branch refs/heads/' + branch && path) return path;
  }
  return null;
}

// Adjudication means OPEN FINDINGS were ruled on at the loop cap. Routine
// ledger vocabulary ("Ruling:", a mid-build "parked", "nothing parked") must
// not lift a needs-fixes block — only "adjudicat*" or a finding-tied park
// ("Finding [N] ... parked") counts.
export function reviewAdjudicated(evidenceBody) {
  const section = /\*\*Review:\*\*[\s\S]*?(?=\n\*\*[A-Z]|\nBranch:|$)/.exec(evidenceBody ?? '')?.[0] ?? '';
  return /adjudicat/i.test(section) || /finding \[\d+\][^\n]*parked/i.test(section);
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

// An entry means an ADDED "## " heading in the file-scoped diff — a deleted
// file or a typo edit to an old entry is not a new entry.
export function chronicleEntryAdded(fileDiff) {
  return /^\+## /m.test(fileDiff ?? '');
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
    // chronicleOn/chronicleTouched (via facts.*): dev.md chronicle knob and
    // whether the diff adds a "## " chronicle entry heading
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
  if (allowNoChangelog && (!changelogTouched || (facts.chronicleOn && !facts.chronicleTouched))) {
    warns.push(`--allow-no-changelog exercised ("${allowNoChangelog}") — it excused: ${[!changelogTouched ? 'changelog' : null, facts.chronicleOn && !facts.chronicleTouched ? 'chronicle' : null].filter(Boolean).join(' + ')}`);
  }

  if (reviewVerdict !== 'clean' && !adjudicated) {
    blocks.push(`latest review verdict is ${reviewVerdict ?? 'absent'} and the evidence Review section carries no adjudication`);
  }

  if (facts.checkoutMismatch) {
    blocks.push(facts.checkoutMismatch);
  }
  if (facts.checkMissing) {
    warns.push('dev.md has no check command on its commands: line — the fresh-run gate could not run; verify by hand');
  }
  if (checkExit !== null && checkExit !== 0) {
    blocks.push(`the project check command exited ${checkExit} on a fresh run — a claim is never trusted, always re-proven`);
  }

  // Added lines only, and only the REAL tag shape ([DEBUG- + hex): docs that
  // document the tag write placeholders like [DEBUG-<4hex>] and must not block.
  if (/^\+(?!\+\+).*\[DEBUG-[0-9a-f]{4}\]/m.test(diffText)) {
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
  // An explicit --worktree wins; otherwise the branch's own worktree, if one
  // holds it; otherwise the current directory, and the checkout test decides.
  let listed = '';
  try {
    listed = sh('git', ['worktree', 'list', '--porcelain']);
  } catch {
    listed = '';
  }
  const cwd = flags.worktree || resolveWorktree(branch, listed) || undefined;
  const comments = JSON.parse(sh('gh', ['api', `repos/${repo}/issues/${flags.issue}/comments`, '--paginate']));

  let evidence = null;
  let reviewVerdict = null;
  for (const comment of comments) {
    const marker = parseMarker(comment.body);
    if (marker?.keys?.type === 'evidence') evidence = { body: comment.body, updatedAt: comment.updated_at };
    if (marker?.keys?.type === 'review') reviewVerdict = marker.keys.verdict ?? null;
  }
  const adjudicated = reviewAdjudicated(evidence?.body);

  const headSha = sh('git', ['rev-parse', '--short=7', branch], cwd);
  const diffText = sh('git', ['diff', `${base}...${branch}`], cwd);
  // The fresh check run and dev.md read use the WORKING TREE — they prove
  // nothing unless the checkout is the branch under review.
  const checkoutSha = sh('git', ['rev-parse', 'HEAD'], cwd);
  const branchSha = sh('git', ['rev-parse', branch], cwd);
  const checkoutMismatch = checkoutSha === branchSha
    ? null
    : `the current checkout (${checkoutSha.slice(0, 7)}) is not the branch under review (${branch} @ ${branchSha.slice(0, 7)}) and no worktree holds it — run ship-gate from that branch or pass --worktree <path>`;

  // dev.md is read from the worktree too: the knobs that gate this branch are
  // the ones on this branch, not whatever the main checkout happens to hold.
  const devMd = readFileSync(flags['dev-md'] || join(cwd ?? '.', '.vegastack', 'dev.md'), 'utf8');
  const changelogKnob = (/^changelog:\s*(\S+)/m.exec(devMd) || [])[1] ?? 'none';
  // Added files/lines only — a deleted changeset or the +++ diff header must
  // not count as an entry.
  const changelogTouched = changelogKnob === 'none'
    ? true
    : changelogKnob === 'changesets'
      ? /^\+\+\+ b\/\.changeset\/(?!config)/m.test(diffText)
      : /^\+(?!\+\+)[^\n]*\S/m.test(sh('git', ['diff', `${base}...${branch}`, '--', 'CHANGELOG.md'], cwd) || '');

  const chronicleOn = /^chronicle:\s*on\s*(#|$)/m.test(devMd);
  const chronicleTouched = chronicleEntryAdded(sh('git', ['diff', `${base}...${branch}`, '--', '.vegastack/chronicle.md'], cwd) || '');

  let checkExit = null;
  const checkCmd = (/^commands:.*?check\s+`([^`]+)`/m.exec(devMd) || [])[1];
  const checkMissing = !checkCmd;
  if (checkCmd) {
    try {
      execFileSync('sh', ['-c', checkCmd], { stdio: ['ignore', 'pipe', 'pipe'], cwd });
      checkExit = 0;
    } catch (error) {
      checkExit = error.status ?? 1;
    }
  }

  return {
    evidence, reviewVerdict, adjudicated, headSha, diffText,
    changelogTouched, chronicleOn, chronicleTouched,
    allowNoChangelog: flags['allow-no-changelog'], checkExit, checkMissing, checkoutMismatch,
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const get = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const flags = {
    issue: get('--issue'), branch: get('--branch'), repo: get('--repo'), base: get('--base'),
    'dev-md': get('--dev-md'), worktree: get('--worktree'), 'allow-no-changelog': get('--allow-no-changelog'), json,
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
