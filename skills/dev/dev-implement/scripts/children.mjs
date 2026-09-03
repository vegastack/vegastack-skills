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
export function planParallelRun({ groups, issues, parentBranch, parentHead, repoRoot }) {
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
  return { mode, reason, children, ledger, parentBranch, parentHead };
}
