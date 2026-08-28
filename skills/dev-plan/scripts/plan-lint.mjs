#!/usr/bin/env node
// dev-plan guard: deterministic checks on a drafted plan comment. Placeholders
// and structural gaps block; nothing here warns. The banned-placeholder list's
// single home is this file — brief-lint defers inline-plan checks to it.
//
// Usage: node plan-lint.mjs --file <plan.md> --json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Self-contained on purpose: plan-lint ships with dev-plan and must run on a
// standalone install, so it carries its own tiny flag/result helpers instead of
// importing dev-implement's lib.

export const bannedPlaceholders = [
  /\bTBD\b/,
  /\bTODO\b/,
  /implement later/i,
  /fill in details/i,
  /add appropriate error handling/i,
  /\badd validation\b/i,
  /handle edge cases/i,
  /write tests for the above/i,
  /similar to task \d+/i,
];

export function lintPlan(text) {
  const blocks = [];

  if (!/<!--\s*vsk:v1\s+type=plan\b/.test(text)) blocks.push('missing plan marker (<!-- vsk:v1 type=plan rev=n -->)');

  for (const pattern of bannedPlaceholders) {
    const hit = pattern.exec(text);
    if (hit) blocks.push(`banned placeholder: "${hit[0]}" — plans carry the actual content`);
  }

  const tasks = text.split(/^- \[[ x]\] \*\*Task /m).slice(1);
  if (tasks.length === 0) blocks.push('no checkbox tasks found (- [ ] **Task N: ...**)');
  tasks.forEach((task, index) => {
    const n = index + 1;
    if (!/Files\s*—/.test(task)) blocks.push(`task ${n}: missing "Files —" line with exact paths`);
    if (!/Interfaces\s*—/.test(task)) blocks.push(`task ${n}: missing "Interfaces —" block (consumes/produces)`);
    if (!/Steps[:\s]/.test(task)) blocks.push(`task ${n}: missing "Steps" line`);
  });

  return { blocks, warns: [] };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const fileIndex = argv.indexOf('--file');
  let outcome;
  if (fileIndex === -1 || !argv[fileIndex + 1]) {
    outcome = { blocks: ['usage: plan-lint.mjs --file <plan.md> [--json]'], warns: [] };
  } else {
    try {
      outcome = lintPlan(readFileSync(argv[fileIndex + 1], 'utf8'));
    } catch (error) {
      outcome = { blocks: [`cannot read plan: ${error.message}`], warns: [] };
    }
  }
  const ok = outcome.blocks.length === 0;
  if (json) {
    console.log(JSON.stringify({ guard: 'plan-lint', ok, ...outcome }, null, 2));
  } else {
    console.log(`plan-lint: ${ok ? 'pass' : 'BLOCKED'}`);
    for (const b of outcome.blocks) console.log(`  block: ${b}`);
  }
  process.exit(ok ? 0 : 2);
}
