#!/usr/bin/env node
// dev-implement preflight guard: the deterministic facts that must hold before
// an agent may claim an issue. Facts block (exit 2 with reasons); nothing here
// warns — judgment checks stay in the skill prose.
//
// Exit codes: 0 pass · 1 pass-with-warnings · 2 blocked (reasons printed).
// Usage: node preflight.mjs --issue <n> [--repo owner/name] [--me <login>] [--dev-md <path>] --json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GhUnavailable, findMarkerComment, ghJson, parseFlags, renderResult } from './lib/gh.mjs';

export function evaluatePreflight({ issue, comments, devMd, me, expect = 'ready' }) {
  const blocks = [];
  const warns = [];
  const labels = (issue.labels ?? []).map((l) => l.name);

  if (issue.state && issue.state !== 'open') blocks.push(`issue is ${issue.state} — only open issues are workable`);
  const STATE_LABELS = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator'];
  const state = STATE_LABELS.filter((s) => labels.includes(s));
  if (!state.includes(expect)) {
    blocks.push(`issue state label is [${state.join(', ') || 'none'}], expected ${expect} (fresh start: ready · resume: working with the operator's handover · corrections: for-operator)`);
  }

  const approval = findMarkerComment(comments, 'approval');
  if (!approval) blocks.push('no recorded approval comment (marker type=approval) on the issue');

  const scope = ['research', 'quick-build', 'full-plan'].filter((s) => labels.includes(s));
  if (scope.length !== 1) blocks.push(`issue needs exactly one scope label (research | quick-build | full-plan), found: ${scope.join(', ') || 'none'}`);

  if (scope[0] === 'full-plan') {
    const planApproved = (comments ?? []).some((c) => {
      const m = findMarkerComment([c], 'approval');
      return m && ['plan', 'brief+plan'].includes(m.keys.scope);
    });
    if (!planApproved) blocks.push('full-plan issue without a recorded plan approval (marker type=approval scope=plan or brief+plan)');
  }

  // The brief-template rule: a resolved Assumptions section is deleted, so the
  // heading's presence at all means unresolved entries remain.
  if (/^##\s+Assumptions\b/m.test(issue.body ?? '')) {
    blocks.push('the brief still carries a "## Assumptions" section — resolve every entry (the section is deleted once resolved) before starting');
  }

  const openBlockers = issue.blockedBy ?? [];
  if (openBlockers.length > 0) blocks.push(`open blockers: ${openBlockers.map((b) => `#${b.number}`).join(', ')}`);

  // Who the assignee is depends on the state (conventions' Labels table): `ready`
  // is unassigned, `working` is the claimant, `for-operator` is the operator. So a
  // foreign assignee blocks on the first two — someone else's claim — and is the
  // expected shape on a corrections run, where the hand-back moved the assignee to
  // the operator and the runner's gh login need not be that person. On `ready`,
  // an assignee that is you is a fact worth naming, not a stop — a human may have
  // picked it up by hand, and a block would strand a claimable issue.
  const assigned = (issue.assignees ?? []).map((a) => a.login);
  const others = assigned.filter((l) => l !== me);
  if (others.length > 0 && expect !== 'for-operator') {
    const why = expect === 'working'
      ? 'a working issue belongs to its claimant'
      : "a ready issue is unassigned by convention, so another assignee is someone else's claim";
    blocks.push(`already assigned to ${others.join(', ')} — ${why}`);
  }
  if (expect === 'ready' && assigned.length > 0) {
    warns.push(`a ready issue is unassigned by convention; this one is assigned to ${assigned.join(', ')} — confirm nobody else is mid-claim before taking it`);
  }

  const repoLine = /^repo:\s*(\S+)/m.exec(devMd ?? '');
  if (!repoLine) {
    warns.push('dev.md has no repo: line — the issue-repo match could not be verified');
  } else if (issue.repo && repoLine[1] !== issue.repo) {
    blocks.push(`issue repo ${issue.repo} does not match dev.md repo ${repoLine[1]}`);
  }

  return { blocks, warns };
}

export function gatherAndEvaluate(flags) {
  const repo = flags.repo || ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
  const issueNumber = flags.issue;
  // Interpolated paths and messages are concatenated, not template literals: a backtick at a
  // shell-word start whose first inner token carries the interpolation trips SkillSpector's
  // bounded parser for the whole skill (skill-maintainer's standards.md, known behaviours).
  const raw = ghJson(['api', 'repos/' + repo + '/issues/' + issueNumber]);
  const comments = ghJson(['api', 'repos/' + repo + '/issues/' + issueNumber + '/comments', '--paginate']);
  let blockedBy = [];
  try {
    blockedBy = ghJson(['api', 'repos/' + repo + '/issues/' + issueNumber + '/dependencies/blocked_by'])
      .filter((b) => b.state === 'open');
  } catch (error) {
    // Only an HTTP 404 (host without the dependencies API) means "none
    // recorded" — matched on the parsed status, never the message text, so a
    // path containing "404" can't masquerade. Every other failure — auth,
    // network, rate limit — is unverifiable state and fails closed.
    if (error.httpStatus !== 404) throw error;
    blockedBy = [];
  }
  const devMd = readFileSync(flags['dev-md'] || '.vegastack/dev.md', 'utf8');
  const me = flags.me || ghJson(['api', 'user']).login;
  return evaluatePreflight({
    issue: { body: raw.body, state: raw.state, labels: raw.labels, assignees: raw.assignees, repo, blockedBy },
    comments,
    devMd,
    me,
    expect: flags.expect || 'ready',
  });
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const flags = parseFlags(process.argv.slice(2));
  let outcome;
  try {
    outcome = gatherAndEvaluate(flags);
  } catch (error) {
    outcome = { blocks: [error instanceof GhUnavailable ? `cannot verify: ${error.message}` : `preflight error: ${error.message}`], warns: [] };
  }
  const { exitCode, text } = renderResult('preflight', outcome, { json: Boolean(flags.json) });
  console.log(text);
  process.exit(exitCode);
}
