#!/usr/bin/env node
// The parallel-children planner, launcher and join. A parent session whose plan
// declares independent groups runs one child per group at the same time, each in
// its own checkout branched from the parent's HEAD commit, then merges the
// children back in plan order and verifies once.
//
// Every deterministic decision lives here — parallel or sequential, the
// concurrency cap, child branch and worktree names, the per-harness launch
// shape, the post-run scope check, and the join order — while the two harness
// mechanisms stay native: a saved Claude workflow, or one `codex exec -C` per
// child. The group grammar is NOT re-parsed here: `plan-lint --groups` is the
// one parser, and this script consumes its validated JSON.
//
// Exit codes: 0 pass · 1 pass with warnings · 2 blocked (reasons printed).
// Every verb is dry-run until --write and refuses to write through a symlink.
//
// Usage: node children.mjs plan|launch|join|remove --parent <n> --groups <file.json|-> [--harness claude|codex] [--repo <o/r>] [--json] [--write]
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childWorktreePlan } from './worktree.mjs';
import { ghJson, parseFlags, renderResult } from './lib/gh.mjs';

// Located strings are concatenated, never assigned as template literals:
// SkillSpector's static parser trips on the latter (see skillify's
// trigger-check.mjs) and every file carrying that construct needs its own
// coverage acceptance.
const at = (where, message) => where + ': ' + message;
const quoted = (value) => '"' + value + '"';

// A dynamic workflow may run at most 16 agents at once, whatever the machine
// or the config says (claude-code 2.1.247, verified 03-09-2026).
export const WORKFLOW_AGENT_CEILING = 16;

// --- reading the groups report -------------------------------------------

// plan-lint --groups output, validated. Anything else fails closed: a run that
// cannot prove what its children may touch does not start.
export function readGroupsReport(report) {
  const groups = report && typeof report === 'object' ? report.groups : undefined;
  if (!Array.isArray(groups)) throw new Error('groups report is not plan-lint --groups output');
  for (const group of groups) {
    const shaped = group && typeof group === 'object' && typeof group.id === 'string'
      && Array.isArray(group.members) && Array.isArray(group.files);
    if (!shaped) throw new Error('groups report is not plan-lint --groups output');
    if (group.files.length === 0) throw new Error('group ' + quoted(group.id) + ' declares no files');
  }
  return groups;
}

// --- how many run at once -------------------------------------------------

// The smallest of the configured cap, what the machine can carry, and the
// workflow ceiling — never below one, because one child still has to run.
export function effectiveConcurrency({ configured, cpus: cpuCount }) {
  const cap = configured === null || configured === undefined ? WORKFLOW_AGENT_CEILING : Number(configured);
  return Math.max(1, Math.min(WORKFLOW_AGENT_CEILING, Number(cpuCount) - 2, cap));
}

// --- the run plan ---------------------------------------------------------

const issueNumber = (member) => {
  const match = /^#(\d+)$/.exec(String(member).trim());
  return match ? Number(match[1]) : null;
};

// One child per group member, in the order the groups appear in the plan.
// Parallel needs two groups that carry members; anything less runs in plan
// order, and the reason goes in the parent's ledger rather than nowhere.
export function planParallelRun({ groups, issues, parentBranch, parentHead, repoRoot, parentIssue = null }) {
  const children = [];
  for (const group of groups) {
    for (const member of group.members) {
      const number = issueNumber(member);
      const issue = number === null ? undefined : issues[number];
      if (!issue) {
        throw new Error('group ' + quoted(group.id) + ' names ' + String(member) + ', which is not a child of this parent');
      }
      const type = issue.type || 'feat';
      const plan = childWorktreePlan({ repoRoot, issue: issue.number, title: issue.title, type, baseSha: parentHead });
      children.push({
        group: group.id,
        issue: issue.number,
        title: issue.title,
        type,
        branch: plan.branch,
        path: plan.path,
        files: group.files,
        baseSha: plan.baseSha,
      });
    }
  }
  const carrying = groups.filter((group) => group.members.length > 0);
  let mode = 'parallel';
  let reason = '';
  if (carrying.length === 0) {
    mode = 'sequential';
    reason = 'the plan declares no independent group with members';
  } else if (carrying.length === 1) {
    mode = 'sequential';
    reason = 'the plan declares one independent group, and parallel needs two disjoint ones';
  }
  const ledger = mode === 'sequential' ? '- Parallel: no — ' + reason + '; children run in plan order' : '';
  return { mode, reason, children, ledger, parentBranch, parentHead, repoRoot, parentIssue };
}

// --- the launch shapes ----------------------------------------------------

// One child's whole first turn. It is self-contained on purpose: the child runs
// in its own checkout with no memory of this session, so the branch, its base
// commit and its declared file set have to be in the words themselves.
export function childPrompt(child, { parentIssue, parentBranch }) {
  const lines = [
    'You are operating autonomously on issue #' + child.issue + ' (' + child.title + '), '
      + 'one of several children of #' + parentIssue + ' running at the same time. '
      + 'The operator is not watching and cannot answer mid-run.',
    'Your checkout is ' + child.path + ' and nothing outside it is yours: '
      + 'create your branch ' + child.branch + ' from ' + child.baseSha
      + ' before your first commit. That commit is the tip of ' + parentBranch
      + ', so your branch fast-forwards back into it.',
    'The plan declares exactly which files this child may touch:\n'
      + child.files.map((file) => '- ' + file).join('\n'),
    'Touching any file outside that set is a stop, not a judgement call: '
      + 'the parent checks your diff against the set before merging, and a child that wandered '
      + 'is not merged. If the work genuinely needs a file outside the set, hand back and say so.',
    'Follow dev-implement end to end for #' + child.issue + ': claim, build the plan task by task '
      + 'with a ledger checkpoint after each, verify, review, post the evidence comment on your own '
      + 'issue, and stop. Do not merge anything — the parent joins the branches.',
  ];
  return lines.join('\n\n');
}

// The Claude path: one saved-workflow call by name. The workflow itself has no
// filesystem access, so everything it needs travels in these args.
export function claudeWorkflowCall(run, { concurrency, parentIssue = null } = {}) {
  const parent = parentIssue === null || parentIssue === undefined ? run.parentIssue : parentIssue;
  return {
    name: 'implement-children',
    args: {
      repoRoot: run.repoRoot,
      parentIssue: parent,
      parentBranch: run.parentBranch,
      parentHead: run.parentHead,
      concurrency,
      children: run.children.map((child) => ({
        issue: child.issue,
        title: child.title,
        branch: child.branch,
        baseSha: child.baseSha,
        files: child.files,
        prompt: childPrompt(child, { parentIssue: parent, parentBranch: run.parentBranch }),
      })),
    },
  };
}

// The Codex path: one cwd-pinned `codex exec` per child. `spawn_agent` takes no
// cwd (codex-cli 0.149.1, verified 03-09-2026), so an in-session agent would
// share the parent's writable root and could not write to a sibling worktree.
// The flag sequence is #114's launch table's, verbatim — dispatch.test.ts pins
// the two together so they cannot drift.
export function codexChildLaunch(child, { codex = 'codex', model, effort, parentIssue, parentBranch }) {
  const prompt = childPrompt(child, { parentIssue, parentBranch });
  return {
    command: codex,
    args: [
      'exec', '-C', child.path, '--sandbox', 'workspace-write', '-a', 'never',
      '--dangerously-bypass-hook-trust', '-c', 'model=' + model,
      '-c', 'model_reasoning_effort=' + effort, '--json', prompt,
    ],
    prompt,
  };
}

// --- the join -------------------------------------------------------------

const normalized = (path) => String(path).replace(/^\.\//, '').replace(/\/{2,}/g, '/');

// The declared file set is the contract, checked after the fact against what
// the child's diff actually touched. A path is in scope when it equals a
// declared path, or sits under a declared path ending in `/`.
export function scopeViolations(changed, declared) {
  const sets = (declared ?? []).map(normalized);
  return (changed ?? []).map(normalized).filter((path) => {
    for (const entry of sets) {
      if (path === entry) return false;
      if (entry.endsWith('/') && path.startsWith(entry)) return false;
    }
    return true;
  });
}

// A child branched from the parent HEAD fast-forwards or is not a clean child:
// anything else means its base moved, and a merge commit would hide that.
export function mergeArgs(child) {
  return ['merge', '--ff-only', child.branch];
}

// What the parent does with each child's result, in plan order. A failed child
// WARNS — the parent continues with the others and hands back — while a child
// that wrote outside its declared set BLOCKS: the contract the plan declared is
// the only reason the parallel run was allowed at all.
export function evaluateJoin({ children, results, changed }) {
  const merge = [];
  const stop = [];
  const blocks = [];
  const warns = [];
  const order = children.map((child) => '#' + child.issue).join(', ');
  const ledger = ['- Parallel: ' + children.length + ' children — join order ' + order];
  for (const child of children) {
    const result = (results ?? {})[child.issue] ?? {};
    const label = '#' + child.issue;
    if (result.status !== 'done') {
      const why = result.message ? result.status + ' — ' + result.message : String(result.status ?? 'no result');
      warns.push('child ' + label + ' failed and was not merged — its branch ' + child.branch
        + ' and worktree are left in place (' + why + ')');
      stop.push({ issue: child.issue, reason: why });
      ledger.push('- Join: ' + label + ' not merged (' + why + ')');
      continue;
    }
    const wandered = scopeViolations((changed ?? {})[child.issue], child.files);
    if (wandered.length > 0) {
      for (const path of wandered) blocks.push('child ' + label + ' touched ' + path + ', outside its declared set');
      const reason = 'touched ' + wandered.join(', ') + ' outside its declared set';
      stop.push({ issue: child.issue, reason });
      ledger.push('- Join: ' + label + ' not merged (' + reason + ')');
      continue;
    }
    merge.push({ issue: child.issue, branch: child.branch });
    ledger.push('- Join: ' + label + ' merged ' + String(result.head ?? '').slice(0, 7));
  }
  return { merge, stop, blocks, warns, ledger };
}
