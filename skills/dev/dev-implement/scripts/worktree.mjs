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
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, renderResult } from './lib/gh.mjs';

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

// --- git plumbing ---------------------------------------------------------

// Every git call goes through execFileSync with an explicit argv: no shell, no
// interpolation, and a failure surfaces as { ok: false, out } for the caller
// to turn into a block or a warn rather than an unhandled throw.
export function git(cwd, args) {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (error) {
    const stderr = error.stderr?.toString().trim() || error.message;
    return { ok: false, out: stderr };
  }
}

// git reports worktree paths through realpath (on macOS /var is a symlink to
// /private/var), so a path off porcelain and a path composed from repoRoot do
// not compare equal. Re-express a porcelain path under the caller's own root
// whenever it names one of our worktrees; otherwise hand it back untouched.
export function rebaseUnderRoot(repoRoot, absPath) {
  if (!absPath) return absPath;
  const marker = sep + WORKTREES_DIR.split('/').join(sep) + sep;
  const index = absPath.indexOf(marker);
  if (index === -1) return absPath;
  return worktreePath(repoRoot, absPath.slice(index + marker.length));
}

const hasRemote = (repoRoot, remote) => git(repoRoot, ['remote', 'get-url', remote]).ok;
const branchExistsIn = (repoRoot, branch) => git(repoRoot, ['rev-parse', '--verify', '--quiet', 'refs/heads/' + branch]).ok;

// The path of the worktree currently holding a branch, straight off porcelain.
export function worktreeHoldingBranch(repoRoot, branch) {
  const listed = git(repoRoot, ['worktree', 'list', '--porcelain']);
  if (!listed.ok) return null;
  const found = parseWorktreeList(listed.out).find((entry) => entry.branch === branch)?.path ?? null;
  return rebaseUnderRoot(repoRoot, found);
}

// --- Codex trust ----------------------------------------------------------

// Codex skips .codex/ hooks, rules and project config for an untrusted path,
// so a fresh worktree has to be added to ~/.codex/config.toml before any run
// there. Idempotent by header match: the entry is appended exactly once.
export function codexTrustToml(configText, absPath) {
  const text = String(configText ?? '');
  const header = '[projects."' + absPath + '"]';
  if (text.includes(header)) return { changed: false, text };
  const prefix = text.length === 0 || text.endsWith('\n') ? text : text + '\n';
  const separator = prefix.length === 0 ? '' : '\n';
  return { changed: true, text: prefix + separator + header + '\n' + 'trust_level = "trusted"\n' };
}

function applyCodexTrust({ home, absPath, write, actions, warns, blocks }) {
  const onPath = (process.env.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir && existsSync(join(dir, 'codex')));
  if (!onPath) {
    warns.push('codex is not on PATH — skipped the ' + absPath + ' trust entry in ~/.codex/config.toml');
    return;
  }
  const configPath = join(home, '.codex', 'config.toml');
  const symlink = symlinkBlock(configPath);
  if (symlink) {
    blocks.push(symlink);
    return;
  }
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  const next = codexTrustToml(existing, absPath);
  if (!next.changed) return;
  actions.push(at(configPath, 'add [projects."' + absPath + '"] trust_level = "trusted"'));
  if (!write) return;
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, next.text);
}

// --- create and restore ---------------------------------------------------

function prepareCheckout({ repoRoot, path, devMd, home, write, actions, warns, blocks }) {
  for (const file of parseIncludeKnob(devMd)) {
    const source = join(repoRoot, file);
    if (!existsSync(source)) {
      warns.push(at(file, 'listed in worktree-include: but absent from the main checkout — not copied'));
      continue;
    }
    if (symlinkBlock(source)) {
      warns.push(at(file, 'is a symlink in the main checkout — not copied'));
      continue;
    }
    actions.push(at(file, 'copy into the worktree'));
    if (!write) continue;
    const target = join(path, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  const setup = parseSetupCommand(devMd);
  if (setup) {
    actions.push(at('setup', 'run `' + setup + '` in the worktree'));
    if (write) {
      try {
        execFileSync('sh', ['-c', setup], { cwd: path, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        warns.push(at('setup', '`' + setup + '` failed: ' + (error.stderr?.toString().trim() || error.message)));
      }
    }
  }
  applyCodexTrust({ home, absPath: path, write, actions, warns, blocks });
}

// Create the checkout for a branch. With `parent` set this is an epic's child:
// it does NOT get its own directory — it branches off the parent branch inside
// the parent's worktree, one child at a time, which is what keeps a stack
// linear. Without `parent` it is a fresh worktree cut from origin/<base>.
export function createWorktree({ repoRoot, issue, slug, type, base, parent, devMd, home, write = false }) {
  const blocks = [];
  const warns = [];
  const actions = [];
  const branch = branchName(type, issue, slug);
  const name = worktreeName(issue, slug);

  if (parent) {
    const parentPath = worktreeHoldingBranch(repoRoot, parent);
    if (!parentPath) {
      blocks.push(at(parent, 'no worktree holds the parent branch — create the parent worktree before its first child'));
      return { blocks, warns, actions, path: '', branch };
    }
    actions.push(at(parentPath, 'git switch -c ' + branch + ' from ' + parent));
    if (write) {
      const switched = git(parentPath, ['switch', '-c', branch]);
      if (!switched.ok) blocks.push(at(branch, 'could not branch from ' + parent + ': ' + switched.out));
    }
    return { blocks, warns, actions, path: parentPath, branch };
  }

  const path = worktreePath(repoRoot, name);
  for (const candidate of [join(repoRoot, '.vegastack'), join(repoRoot, WORKTREES_DIR), path]) {
    const symlink = symlinkBlock(candidate);
    if (symlink) blocks.push(symlink);
  }
  if (blocks.length > 0) return { blocks, warns, actions, path, branch };

  if (branchExistsIn(repoRoot, branch)) {
    blocks.push(at(branch, 'the branch already exists — use restore to re-add its worktree'));
    return { blocks, warns, actions, path, branch };
  }

  let startPoint = base;
  if (hasRemote(repoRoot, 'origin')) {
    actions.push(at('origin', 'git fetch origin ' + base));
    if (write) {
      const fetched = git(repoRoot, ['fetch', 'origin', base]);
      if (!fetched.ok) warns.push(at('origin', 'fetch of ' + base + ' failed, cutting from the local ref instead: ' + fetched.out));
      else startPoint = 'origin/' + base;
    } else {
      startPoint = 'origin/' + base;
    }
  } else {
    warns.push('no origin remote — cutting the branch from the local ' + base);
  }

  actions.push(at(path, 'git worktree add -b ' + branch + ' from ' + startPoint));
  if (write) {
    const added = git(repoRoot, ['worktree', 'add', path, '-b', branch, startPoint]);
    if (!added.ok) {
      blocks.push(at(path, 'git worktree add failed: ' + added.out));
      return { blocks, warns, actions, path, branch };
    }
    prepareCheckout({ repoRoot, path, devMd, home, write, actions, warns, blocks });
  } else {
    prepareCheckout({ repoRoot, path, devMd, home, write: false, actions, warns, blocks });
  }
  return { blocks, warns, actions, path, branch };
}

// Re-add the checkout for a branch that still exists but whose directory is
// gone — the corrections and reclaim path. It never creates a branch: a
// missing branch means the work is somewhere else, and guessing would be worse
// than stopping.
export function restoreWorktree({ repoRoot, issue, slug, type, devMd, home, write = false }) {
  const blocks = [];
  const warns = [];
  const actions = [];
  const branch = branchName(type, issue, slug);
  const name = worktreeName(issue, slug);
  const path = worktreePath(repoRoot, name);

  for (const candidate of [join(repoRoot, '.vegastack'), join(repoRoot, WORKTREES_DIR), path]) {
    const symlink = symlinkBlock(candidate);
    if (symlink) blocks.push(symlink);
  }
  if (blocks.length > 0) return { blocks, warns, actions, path, branch };

  if (!branchExistsIn(repoRoot, branch)) {
    blocks.push(at(branch, 'no branch of that name — nothing to restore; create it instead'));
    return { blocks, warns, actions, path, branch };
  }
  const held = worktreeHoldingBranch(repoRoot, branch);
  if (held) {
    warns.push(at(held, 'already holds ' + branch + ' — nothing to restore'));
    return { blocks, warns, actions, path: held, branch };
  }

  actions.push(at(path, 'git worktree add ' + branch));
  if (write) {
    const added = git(repoRoot, ['worktree', 'add', path, branch]);
    if (!added.ok) {
      blocks.push(at(path, 'git worktree add failed: ' + added.out));
      return { blocks, warns, actions, path, branch };
    }
  }
  prepareCheckout({ repoRoot, path, devMd, home, write, actions, warns, blocks });
  return { blocks, warns, actions, path, branch };
}

// --- dev.md defaults ------------------------------------------------------

// dev.md's `repo:` line carries the default branch after a middot. Absent or
// unparseable falls back to `main` rather than guessing from the checkout,
// which in a worktree is never the default branch by construction.
export function parseDefaultBranch(devMd) {
  const line = knobLine(devMd, 'repo');
  const match = line ? /default branch\s+(\S+)/.exec(line) : null;
  return match ? match[1] : 'main';
}

// --- CLI ------------------------------------------------------------------

function renderWorktree(result, { json }) {
  const { exitCode, text } = renderResult('worktree', result, { json });
  if (!json) {
    const lines = [text];
    for (const action of result.actions ?? []) lines.push('  action: ' + action);
    for (const candidate of result.candidates ?? []) {
      lines.push('  candidate: ' + candidate.name + ' (' + candidate.state + ', ' + candidate.ageDays + 'd) — '
        + (candidate.removable ? 'removable' : 'kept: ' + candidate.reason));
    }
    for (const entry of result.entries ?? []) {
      lines.push('  worktree: ' + entry.name + ' [' + entry.state + '] ' + (entry.branch ?? 'detached'));
    }
    return { exitCode, text: lines.join('\n') };
  }
  const payload = JSON.parse(text);
  for (const key of ['actions', 'path', 'branch', 'entries', 'candidates', 'reconciled']) {
    if (result[key] !== undefined) payload[key] = result[key];
  }
  return { exitCode, text: JSON.stringify(payload, null, 2) };
}

function runVerb(verb, flags) {
  const repoRoot = flags['repo-root'] || git(process.cwd(), ['rev-parse', '--show-toplevel']).out;
  const devMdPath = flags['dev-md'] || join(repoRoot, '.vegastack', 'dev.md');
  const devMd = existsSync(devMdPath) ? readFileSync(devMdPath, 'utf8') : '';
  const base = flags.base || parseDefaultBranch(devMd);
  const home = flags.home || homedir();
  const issue = flags.issue === undefined ? null : Number(flags.issue);
  const slug = flags.slug ? slugify(flags.slug) : null;
  const shared = { repoRoot, devMd, home, base, write: Boolean(flags.write) };

  if (verb === 'create' || verb === 'restore') {
    if (!slug) return { blocks: ['--slug is required for ' + verb], warns: [] };
    const options = { ...shared, issue, slug, type: flags.type || 'feat', parent: flags.parent };
    return verb === 'create' ? createWorktree(options) : restoreWorktree(options);
  }
  return { blocks: [at(verb, 'unknown verb — expected create|restore|remove|list|prune|status')], warns: [] };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const verb = argv.find((arg) => !arg.startsWith('--')) ?? '';
  const flags = parseFlags(argv, ['json', 'write', 'force', 'push', 'all']);
  let outcome;
  try {
    outcome = runVerb(verb, flags);
  } catch (error) {
    outcome = { blocks: [at('worktree', error.message)], warns: [] };
  }
  const { exitCode, text } = renderWorktree(outcome, { json: Boolean(flags.json) });
  console.log(text);
  process.exit(exitCode);
}
