#!/usr/bin/env node
// One feature, one worktree. This script owns the whole worktree scenario
// matrix for a VegaFactory project: naming, lifecycle classification, the
// safe-to-remove test, retention, and the git-calling verbs the skills and
// `vegafactory worktree ...` both drive. The main checkout never leaves the
// default branch; every branch is checked out at
// .vegastack/.worktrees/<n>-<slug>/ on <type>/<n>-<slug>.
//
// State is DERIVED from git plus GitHub on every read and never stored — a
// second source of truth is exactly what drifts.
//
// Exit codes: 0 pass · 1 pass with warnings · 2 blocked (reasons printed).
// Anything destructive is dry-run until --write, and a symlinked worktree
// parent or ~/.codex/config.toml is refused outright.
//
// Usage: node worktree.mjs create|restore|remove|list|prune|status [flags] [--json]
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const WORKTREES_DIR = '.vegastack/.worktrees';
const SLUG_MAX = 40;

// Located strings are concatenated, never assigned as template literals:
// SkillSpector's static parser trips on the latter (see skillify's
// trigger-check.mjs) and every file carrying that construct needs its own
// coverage acceptance.
const at = (where, message) => where + ': ' + message;

// --- naming ---------------------------------------------------------------

// A directory- and branch-safe slug: lowercase, every run of non-alphanumerics
// collapsed to one dash, no leading or trailing dash, capped so paths stay sane.
export function slugify(title) {
  const collapsed = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return collapsed.slice(0, SLUG_MAX).replace(/-+$/g, '');
}

// The worktree directory name. An issue number leads it so `ls` sorts by issue
// and reconciliation against open issues is a parse, not a lookup table.
export function worktreeName(issue, slug) {
  return issue === null || issue === undefined ? String(slug) : String(issue) + '-' + slug;
}

// Always under the repo root, never elsewhere: a worktree outside the tree is
// invisible to `git status`, to the ignore line, and to prune.
export function worktreePath(repoRoot, name) {
  return join(repoRoot, WORKTREES_DIR, name);
}

// <type>/<n>-<slug>, or <type>/<slug> for the branches that have no issue
// (a direct chat fix, a release branch).
export function branchName(type, issue, slug) {
  return type + '/' + worktreeName(issue, slug);
}

// --- porcelain ------------------------------------------------------------

// Parse `git worktree list --porcelain`. Records are blank-line separated;
// within a record the keys are `worktree`, `HEAD`, `branch` or `detached`,
// `locked` and `prunable` (the last three valueless or reason-carrying).
export function parseWorktreeList(porcelain) {
  const entries = [];
  let current = null;
  const flush = () => {
    if (current) entries.push(current);
    current = null;
  };
  for (const raw of String(porcelain ?? '').split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);
    if (key === 'worktree') {
      flush();
      current = { path: value, head: null, branch: null, locked: false, prunable: false, detached: false };
      continue;
    }
    if (!current) continue;
    if (key === 'HEAD') current.head = value;
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
    else if (key === 'detached') current.detached = true;
    else if (key === 'locked') current.locked = true;
    else if (key === 'prunable') current.prunable = true;
  }
  flush();
  return entries;
}

// --- lifecycle ------------------------------------------------------------

// The six lifecycle states, derived from git and GitHub facts. Precedence is
// fixed: a broken pairing (orphan-dir, branch-only) is reported before any
// judgement about the work, a held worktree is `active` whatever else is true,
// and `parked` is the residue. Callers only build facts for something that
// exists, so dirExists=false with branchExists=false does not arise.
export function classifyWorktree({ dirExists, branchExists, locked, issueState, mergedIntoDefault }) {
  if (dirExists && !branchExists) return 'orphan-dir';
  if (!dirExists) return 'branch-only';
  if (locked) return 'active';
  if (mergedIntoDefault) return 'merged';
  if (issueState === 'closed') return 'abandoned';
  return 'parked';
}

// --- filesystem safety ----------------------------------------------------

// A symlink anywhere on the worktree parent turns `git worktree remove` into a
// write outside the repo. Refuse rather than resolve.
export function symlinkBlock(path) {
  try {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) return at(path, 'is a symlink — refusing to write through it');
  } catch {
    return null;
  }
  return null;
}

// --- the safe-to-remove test ----------------------------------------------

const DAY_MS = 86_400_000;
const DEFAULT_RETENTION_MS = 14 * DAY_MS;

// All of these must hold before a worktree directory is removed. Each failure
// gets its own sentence so the caller can print exactly why the work is being
// kept. `force` is the operator's word and lifts ONE thing — the not-merged
// block. Uncommitted, unpushed and locked are never lifted: those are the
// three ways real work disappears.
export function evaluateRemoval({ state, dirty, unpushed, remoteMissing, mergedIntoDefault, locked, force = false }) {
  const blocks = [];
  const warns = [];
  const branchGone = state === 'orphan-dir';
  if (dirty) blocks.push('uncommitted changes in the worktree — commit or discard them first');
  if (!branchGone && (unpushed || remoteMissing)) {
    blocks.push('commits not on the remote — push the branch first, then re-check');
  }
  if (!branchGone && !mergedIntoDefault && !force) {
    blocks.push('not merged into the default branch — merge it, or pass --force with the operator\'s word');
  }
  if (locked) blocks.push('the worktree is locked — a session is holding it; unlock it first');
  if (state === 'abandoned') warns.push('the issue is closed and the branch never merged — removing this discards the only checkout of that work');
  return { blocks, warns };
}

// --- retention and the dev.md knobs ---------------------------------------

// "14d" / "48h" / "90m" → milliseconds. Anything else is null, and every
// caller treats null as "use the default" rather than guessing.
export function parseDuration(text) {
  const match = /^(\d+)\s*([dhm])$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const units = { d: DAY_MS, h: 3_600_000, m: 60_000 };
  return Number(match[1]) * units[match[2]];
}

const knobLine = (devMd, knob) => {
  const match = new RegExp('^' + knob + ':[ \\t]*(.*)$', 'm').exec(String(devMd ?? ''));
  if (!match) return null;
  return match[1].split('#')[0].trim();
};

// worktree-retention: how long a parked worktree survives with no session.
// Absent or unparseable falls back to 14 days — a guard never invents a
// shorter window than the documented default.
export function parseRetentionKnob(devMd) {
  return parseDuration(knobLine(devMd, 'worktree-retention')) ?? DEFAULT_RETENTION_MS;
}

// worktree-include: gitignored files a fresh checkout lacks (.env, .dev.vars).
// `none` is the explicit empty list, so a missing knob and "nothing to copy"
// are not confused.
export function parseIncludeKnob(devMd) {
  const value = knobLine(devMd, 'worktree-include');
  if (!value || value === 'none') return [];
  return value.split(/\s+/).filter(Boolean);
}

// The `setup \`...\`` field of dev.md's `commands:` line — what a fresh
// checkout has to run before it can build (bun install, and friends).
export function parseSetupCommand(devMd) {
  const line = knobLine(devMd, 'commands');
  if (!line) return null;
  const match = /\bsetup\s+`([^`]+)`/.exec(line);
  return match ? match[1].trim() : null;
}

// Age is measured from the LATER of the last commit and the last ledger edit:
// a branch that has not moved may still be an issue someone is actively
// working, and the ledger is where that shows.
export function isPastRetention({ lastCommitAt, ledgerUpdatedAt, now, retentionMs }) {
  const stamps = [lastCommitAt, ledgerUpdatedAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (stamps.length === 0) return false;
  return now - Math.max(...stamps) >= retentionMs;
}
