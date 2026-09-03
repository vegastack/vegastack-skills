#!/usr/bin/env node
// dev-implement reclaim: release an orphaned claim. The operator runs this after
// dev-status flags a working issue as possibly-orphaned — it resets working →
// ready and unassigns, so a fresh session can claim it cleanly. It NEVER claims
// or resumes: a takeover still needs the operator's explicit handover to a new
// session, and it never touches the issue's worktree — the branch and its
// checkout stay exactly where they are, so the session that picks the issue up
// resumes in them (worktree.mjs restore re-adds a checkout that went missing). It fails closed and refuses to release a claim whose ledger is still
// fresh (the session may be alive) unless --force is passed.
//
// Exit codes: 0 released · 2 refused/blocked (reasons printed). Read-verify runs
// before any mutation, so a block never leaves a half-released issue.
// Usage: node reclaim.mjs --issue <n> [--repo o/r] [--orphan-hours 6] [--force] [--json]
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GhUnavailable, findMarkerComment, ghJson, parseFlags, renderResult } from './lib/gh.mjs';

const WORKING = 'working';
const READY = 'ready';

const ageHours = (iso, now) => Math.floor((now - Date.parse(iso)) / 3_600_000);

// Read-verify: the deterministic facts that must hold before a release. Returns
// { blocks, plan } — plan is the mutation to run when blocks is empty.
export function evaluateReclaim({ issue, comments, orphanHours = 6, force = false, now = Date.now() }) {
  const blocks = [];
  const labels = (issue.labels ?? []).map((l) => l.name);

  if (issue.state && issue.state !== 'open') blocks.push(`issue is ${issue.state} — only an open working issue can be reclaimed`);
  if (!labels.includes(WORKING)) blocks.push(`issue is not '${WORKING}' (labels: [${labels.join(', ') || 'none'}]) — nothing to reclaim`);

  const moved = findMarkerComment(comments, 'ledger')?.comment?.updated_at ?? null;
  const ageH = moved ? ageHours(moved, now) : null;
  if (!force && ageH !== null && ageH < orphanHours) {
    blocks.push(`ledger moved ${ageH}h ago (< orphan threshold ${orphanHours}h) — this claim may be live; pass --force to release anyway`);
  }

  const assignees = (issue.assignees ?? []).map((a) => a.login);
  return {
    blocks,
    plan: { removeAssignees: assignees, ledgerAgeHours: ageH },
  };
}

function ghRun(args) {
  try {
    return execFileSync(process.env.VSK_GH || 'gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const stderr = error.stderr?.toString().trim() || error.message;
    throw new GhUnavailable(`gh ${args.join(' ')} failed: ${stderr}`);
  }
}

export function gatherAndReclaim(flags) {
  const repo = flags.repo || ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
  const issueNumber = flags.issue;
  const raw = ghJson(['api', `repos/${repo}/issues/${issueNumber}`]);
  const comments = ghJson(['api', `repos/${repo}/issues/${issueNumber}/comments`, '--paginate']);
  const orphanRaw = Number(flags['orphan-hours']);
  const { blocks, plan } = evaluateReclaim({
    issue: { state: raw.state, labels: raw.labels, assignees: raw.assignees },
    comments,
    orphanHours: Number.isFinite(orphanRaw) && orphanRaw >= 1 ? orphanRaw : 6,
    force: Boolean(flags.force),
  });
  if (blocks.length > 0) return { blocks, warns: [] };

  // Mutations, only past a clean read-verify. Label swap first (frees the
  // claim), then unassign, then the operator-visible note.
  ghRun(['issue', 'edit', String(issueNumber), '-R', repo, '--remove-label', WORKING, '--add-label', READY]);
  for (const login of plan.removeAssignees) {
    ghRun(['issue', 'edit', String(issueNumber), '-R', repo, '--remove-assignee', login]);
  }
  const age = plan.ledgerAgeHours === null ? 'no ledger comment was ever written' : `ledger silent ${plan.ledgerAgeHours}h`;
  const note = `**Claim released.** \`${WORKING}\` → \`${READY}\`, unassigned — ${age}. The prior session did not hand back; its branch and ledger stand. Resume it (dev-implement, the operator's handover) or let a fresh session claim it.`;
  ghRun(['issue', 'comment', String(issueNumber), '-R', repo, '--body', note]);
  return { blocks: [], warns: [`released #${issueNumber}: ${WORKING} → ${READY}, unassigned (${age})`] };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const flags = parseFlags(process.argv.slice(2), ['json', 'force']);
  let outcome;
  if (!flags.issue) {
    outcome = { blocks: ['usage: reclaim.mjs --issue <n> [--repo o/r] [--orphan-hours 6] [--force] [--json]'], warns: [] };
  } else {
    try {
      outcome = gatherAndReclaim(flags);
    } catch (error) {
      outcome = { blocks: [error instanceof GhUnavailable ? `cannot verify: ${error.message}` : `reclaim error: ${error.message}`], warns: [] };
    }
  }
  const { exitCode, text } = renderResult('reclaim', outcome, { json: Boolean(flags.json) });
  console.log(text);
  process.exit(exitCode);
}
