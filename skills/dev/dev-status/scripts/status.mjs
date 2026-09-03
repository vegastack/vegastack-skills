#!/usr/bin/env node
// dev-status data gatherer: everything the board report needs, deterministically,
// read-only, markers-only. The skill renders; this script never invents state.
//
// Usage: node status.mjs [--repo o/r] [--orphan-hours 6] [--dev-md <path>] --json
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LABELS = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator', 'risky', 'research', 'quick-build', 'full-plan', 'epic'];

// The labels: knob lists names positionally (5 states, risky, 3 scopes, epic —
// the dev-profile template order); a project that renamed labels still parses.
export function readKnobs(devMdText) {
  const labelsLine = /^labels:\s*([^\n#]+)/m.exec(devMdText ?? '')?.[1]?.trim();
  const names = labelsLine ? labelsLine.split(/\s+/) : DEFAULT_LABELS;
  const labels = names.length >= 10 ? names : DEFAULT_LABELS;
  return {
    states: labels.slice(0, 5),
    risky: labels[5],
    scopes: labels.slice(6, 9),
    register: /^decisions:\s*(\S+)/m.exec(devMdText ?? '')?.[1] ?? '.vegastack/decisions.md',
  };
}

function gh(args) {
  // env spread at call time: some runtimes pass a startup env snapshot to
  // children, which would hide the VSK_GH/GH_STUB_DIR test seam.
  const out = execFileSync(process.env.VSK_GH || 'gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
  return JSON.parse(out);
}

// Link markup carries no meaning in a terminal, so the board renders link-free
// variants alongside the raw fields — and register comparison uses them, so a
// linked gist still matches its plain register line. URLs containing `)` are not
// a shape this workflow produces (issue and commit URLs never do).
const LINK = /\[([^\]]*)\]\((?:[^)]*)\)/g;

export function stripLinks(text) {
  if (typeof text !== 'string') return '';
  return text.replace(LINK, '$1');
}

export function ageDays(iso, now = Date.now()) {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

// Ledger liveness is measured in hours, not days: a session that hands back in
// hours can go dark for a fraction of a day, which whole-day granularity cannot
// even represent. The ledger's updated_at is the only liveness proxy an agent
// session exposes — a live session (even a multi-day one) checkpoints and keeps
// this small; a dead one freezes it.
export function ageHours(iso, now = Date.now()) {
  return Math.floor((now - Date.parse(iso)) / 3_600_000);
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

// Register lines are written plain, proposals may carry links — compare link-free
// so a recorded decision does not stay "pending" forever on its markup alone.
function recorded(gist, registerText) {
  return stripLinks(registerText).includes(stripLinks(gist).slice(0, 60));
}

// Decision proposals not yet in the register: marker type=decision comments
// (and evidence **Decision:** lines) whose text isn't in the register file.
export function pendingDecisions(comments, registerText) {
  const pending = [];
  for (const c of comments ?? []) {
    const type = parseMarker(c.body)?.keys?.type;
    if (type === 'decision') {
      const gist = (c.body.split('\n').find((l) => l.trim() && !l.startsWith('<!--') && !l.startsWith('#')) ?? '').trim();
      if (gist && !recorded(gist, registerText)) pending.push(gist);
    }
    if (type === 'evidence') {
      const m = /\*\*Decision:\*\*\s*([^\n]+)/.exec(c.body);
      if (m && !/^none\b/i.test(m[1].trim()) && !recorded(m[1].trim(), registerText)) pending.push(m[1].trim());
    }
  }
  return pending;
}

// CheckRuns carry `conclusion`; StatusContexts carry `state`. An empty rollup
// is "no-checks", never green.
export function checksState(rollup) {
  if (!rollup || rollup.length === 0) return 'no-checks';
  const ok = (c) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.conclusion ?? c.state ?? '');
  return rollup.every(ok) ? 'green' : 'pending-or-red';
}

export function gatherStatus({ repo, orphanHours = 6, devMdPath = '.vegastack/dev.md', chroniclePath = '.vegastack/chronicle.md', now = Date.now() } = {}) {
  const resolvedRepo = repo || gh(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
  const devMdText = existsSync(devMdPath) ? readFileSync(devMdPath, 'utf8') : '';
  const knobs = readKnobs(devMdText);
  const board = {};
  for (const label of knobs.states) {
    board[label] = gh(['issue', 'list', '-R', resolvedRepo, '--label', label, '--state', 'open',
      '--json', 'number,title,url,updatedAt,labels,assignees']).map((i) => ({
      number: i.number, title: i.title, url: i.url,
      ageDays: ageDays(i.updatedAt, now),
      scope: (i.labels ?? []).map((l) => l.name).find((n) => knobs.scopes.includes(n)) ?? null,
      risky: (i.labels ?? []).some((l) => l.name === knobs.risky),
    }));
  }

  // Enrich working + for-operator issues with comment-derived signals.
  const registerText = existsSync(knobs.register) ? readFileSync(knobs.register, 'utf8') : '';
  const decisions = [];
  for (const bucket of [knobs.states[3], knobs.states[4]]) {
    for (const issue of board[bucket]) {
      const comments = gh(['api', `repos/${resolvedRepo}/issues/${issue.number}/comments`, '--paginate']);
      issue.tasks = taskProgress(comments);
      const moved = ledgerMovedAt(comments);
      issue.ledgerAgeHours = moved ? ageHours(moved, now) : null;
      // possiblyOrphaned: a working issue whose ledger has been silent past the
      // orphan threshold — or which never got a ledger comment at all (claimed,
      // then died before its first write). A fact for the operator to act on,
      // never an automatic reclaim: the reset is theirs to run.
      issue.possiblyOrphaned = bucket === knobs.states[3] && (issue.ledgerAgeHours === null || issue.ledgerAgeHours >= orphanHours);
      decisions.push(...pendingDecisions(comments, registerText).map((d) => ({ issue: issue.number, gist: d, gistPlain: stripLinks(d) })));
    }
  }

  const prs = gh(['pr', 'list', '-R', resolvedRepo, '--json', 'number,title,url,statusCheckRollup'])
    .map((p) => ({
      number: p.number, title: p.title, url: p.url,
      checks: checksState(p.statusCheckRollup),
    }));

  let lastChronicle = null;
  if (existsSync(chroniclePath)) {
    const m = /^## (\d{2}-\d{2}-\d{4}) — (.+)$/m.exec(readFileSync(chroniclePath, 'utf8'));
    if (m) lastChronicle = { date: m[1], title: m[2], titlePlain: stripLinks(m[2]) };
  }

  return { repo: resolvedRepo, orphanHours, board, prs, pendingDecisions: decisions, lastChronicle };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const get = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  try {
    const orphanRaw = Number(get('--orphan-hours'));
    const data = gatherStatus({ repo: get('--repo'), orphanHours: Number.isFinite(orphanRaw) && orphanRaw >= 1 ? orphanRaw : 6, devMdPath: get('--dev-md') });
    console.log(JSON.stringify(data, null, argv.includes('--json') ? 2 : 0));
  } catch (error) {
    console.error(`status: cannot verify — ${error.message}`);
    process.exit(2);
  }
}
