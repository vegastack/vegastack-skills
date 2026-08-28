#!/usr/bin/env node
// dev-status data gatherer: everything the board report needs, deterministically,
// read-only, markers-only. The skill renders; this script never invents state.
//
// Usage: node status.mjs [--repo o/r] [--stale-days 3] [--dev-md <path>] --json
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE_LABELS = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator'];

function gh(args) {
  const out = execFileSync(process.env.VSK_GH || 'gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

export function ageDays(iso, now = Date.now()) {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
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

// Count plan-comment checkboxes: [done, total]. No plan comment → null.
export function taskProgress(comments) {
  for (const c of comments ?? []) {
    if (parseMarker(c.body)?.keys?.type === 'plan') {
      const done = (c.body.match(/^- \[x\]/gim) ?? []).length;
      const total = done + (c.body.match(/^- \[ \]/gm) ?? []).length;
      return total > 0 ? [done, total] : null;
    }
  }
  return null;
}

// Latest ledger comment's updated_at → staleness signal for working issues.
export function ledgerMovedAt(comments) {
  let at = null;
  for (const c of comments ?? []) {
    if (parseMarker(c.body)?.keys?.type === 'ledger') at = c.updated_at;
  }
  return at;
}

// Decision proposals not yet in the register: marker type=decision comments
// (and evidence **Decision:** lines) whose text isn't in the register file.
export function pendingDecisions(comments, registerText) {
  const pending = [];
  for (const c of comments ?? []) {
    const type = parseMarker(c.body)?.keys?.type;
    if (type === 'decision') {
      const gist = (c.body.split('\n').find((l) => l.trim() && !l.startsWith('<!--') && !l.startsWith('#')) ?? '').trim();
      if (gist && !(registerText ?? '').includes(gist.slice(0, 60))) pending.push(gist);
    }
    if (type === 'evidence') {
      const m = /\*\*Decision:\*\*\s*([^\n]+)/.exec(c.body);
      if (m && !/^none\b/i.test(m[1].trim()) && !(registerText ?? '').includes(m[1].trim().slice(0, 60))) pending.push(m[1].trim());
    }
  }
  return pending;
}

export function gatherStatus({ repo, staleDays = 3, devMdPath = '.vegastack/dev.md', now = Date.now() } = {}) {
  const resolvedRepo = repo || gh(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
  const board = {};
  for (const label of STATE_LABELS) {
    board[label] = gh(['issue', 'list', '-R', resolvedRepo, '--label', label, '--state', 'open',
      '--json', 'number,title,url,updatedAt,labels,assignees']).map((i) => ({
      number: i.number, title: i.title, url: i.url,
      ageDays: ageDays(i.updatedAt, now),
      scope: (i.labels ?? []).map((l) => l.name).find((n) => ['research', 'quick-build', 'full-plan'].includes(n)) ?? null,
      risky: (i.labels ?? []).some((l) => l.name === 'risky'),
    }));
  }

  // Enrich working + for-operator issues with comment-derived signals.
  const registerText = existsSync('.vegastack/decisions.md') ? readFileSync('.vegastack/decisions.md', 'utf8') : '';
  const decisions = [];
  for (const bucket of ['working', 'for-operator']) {
    for (const issue of board[bucket]) {
      const comments = gh(['api', `repos/${resolvedRepo}/issues/${issue.number}/comments`, '--paginate']);
      issue.tasks = taskProgress(comments);
      const moved = ledgerMovedAt(comments);
      issue.ledgerAgeDays = moved ? ageDays(moved, now) : null;
      issue.stale = bucket === 'working' && (issue.ledgerAgeDays === null || issue.ledgerAgeDays >= staleDays);
      decisions.push(...pendingDecisions(comments, registerText).map((d) => ({ issue: issue.number, gist: d })));
    }
  }

  const prs = gh(['pr', 'list', '-R', resolvedRepo, '--json', 'number,title,url,statusCheckRollup'])
    .map((p) => ({
      number: p.number, title: p.title, url: p.url,
      checks: (p.statusCheckRollup ?? []).every((c) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.conclusion ?? '')) ? 'green' : 'pending-or-red',
    }));

  let lastChronicle = null;
  if (existsSync('.vegastack/chronicle.md')) {
    const m = /^## (\d{2}-\d{2}-\d{4}) — (.+)$/m.exec(readFileSync('.vegastack/chronicle.md', 'utf8'));
    if (m) lastChronicle = { date: m[1], title: m[2] };
  }

  return { repo: resolvedRepo, staleDays, board, prs, pendingDecisions: decisions, lastChronicle };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const get = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  try {
    const data = gatherStatus({ repo: get('--repo'), staleDays: Number(get('--stale-days') ?? 3), devMdPath: get('--dev-md') });
    console.log(JSON.stringify(data, null, argv.includes('--json') ? 2 : 0));
  } catch (error) {
    console.error(`status: cannot verify — ${error.message}`);
    process.exit(2);
  }
}
