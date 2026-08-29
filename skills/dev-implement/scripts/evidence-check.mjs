#!/usr/bin/env node
// dev-implement guard: the evidence comment's required shape. Structure blocks;
// nothing here warns.
//
// Exit codes: 0 pass · 2 blocked (this guard has no warn class).
// Usage: node evidence-check.mjs --file <evidence.md> --json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, parseMarker, renderResult } from './lib/gh.mjs';

const REQUIRED_SECTIONS = [
  [/\*\*Done:\*\*/, '**Done:** section'],
  [/\*\*Tests:\*\*/, '**Tests:** section (command → fresh result)'],
  [/\*\*Review:\*\*/, '**Review:** section (mode + verdict/adjudications)'],
  [/\*\*Changelog:\*\*/, '**Changelog:** section (entry, or none with a holding reason)'],
  [/\*\*Docs:\*\*/, '**Docs:** section (brief/plan revisions in sync, or unchanged)'],
  [/\*\*Not done/, '**Not done / limits:** section (the honest list)'],
];

export function checkEvidence(text) {
  const blocks = [];

  const marker = parseMarker(text);
  if (!marker || marker.keys.type !== 'evidence') {
    blocks.push('missing evidence marker (<!-- vsk:v1 type=evidence rev=n branch=... sha=... -->)');
  } else {
    if (!marker.keys.branch) blocks.push('evidence marker missing branch=');
    if (!/^[0-9a-f]{7,}$/.test(marker.keys.sha ?? '')) blocks.push('evidence marker missing a real sha=');
  }

  for (const [pattern, label] of REQUIRED_SECTIONS) {
    if (!pattern.test(text)) blocks.push(`missing ${label}`);
  }

  // The sha may be bare (older comments, installs without a remote) or linked to
  // its commit — bare 7-char shas do not reliably auto-link mid-line in a comment.
  // A bracketed sha must carry a real commit URL; a half-written link still blocks.
  const tail = /Branch:\s*\S+\s*@\s*(?:[0-9a-f]{7,}\b|\[[0-9a-f]{7,}\]\(\S+\/commit\/[0-9a-f]{7,}\))/;
  if (!tail.test(text)) blocks.push('missing "Branch: <name> @ <sha7>" tail line (sha bare or linked to /commit/<sha>)');

  return { blocks, warns: [] };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const flags = parseFlags(process.argv.slice(2));
  let outcome;
  if (!flags.file) {
    outcome = { blocks: ['usage: evidence-check.mjs --file <evidence.md> [--json]'], warns: [] };
  } else {
    try {
      outcome = checkEvidence(readFileSync(flags.file, 'utf8'));
    } catch (error) {
      outcome = { blocks: [`cannot read evidence: ${error.message}`], warns: [] };
    }
  }
  const { exitCode, text } = renderResult('evidence-check', outcome, { json: Boolean(flags.json) });
  console.log(text);
  process.exit(exitCode);
}
