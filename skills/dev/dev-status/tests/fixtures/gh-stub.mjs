#!/usr/bin/env node
// Test seam: serves canned gh JSON from GH_STUB_DIR based on argv.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.env.GH_STUB_DIR;
const argv = process.argv.slice(2);
const serve = (f) => { process.stdout.write(readFileSync(join(dir, f), 'utf8')); process.exit(0); };
if (argv[0] === 'repo') serve('repo.json');
if (argv[0] === 'issue' && argv[1] === 'list') {
  const label = argv[argv.indexOf('--label') + 1];
  serve(`issues-${label}.json`);
}
if (argv[0] === 'pr' && argv[1] === 'list') serve('prs.json');
if (argv[0] === 'api' && argv[1] === 'user') serve('user.json');
if (argv[0] === 'api') {
  const m = /issues\/(\d+)\/comments/.exec(argv[1]);
  if (m) serve(`comments-${m[1]}.json`);
}
process.stderr.write(`gh-stub: unmatched argv ${argv.join(' ')}\n`);
process.exit(1);
