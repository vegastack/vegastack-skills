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
