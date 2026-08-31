#!/usr/bin/env node
// Test double for the `skillspector` binary, wired in through skill-scan's
// VSK_SKILLSPECTOR seam. Records the argv it was called with and emits a report,
// so the guard's invocation contract is asserted without installing the scanner.
//
//   VSK_FAKE_ARGV    path to append the received argv to (one JSON array per line)
//   VSK_FAKE_REPORT  raw report body to write (default: a clean single-skill report)
//   VSK_FAKE_EXIT    exit code to return (default: 0)
import { appendFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);

if (process.env.VSK_FAKE_ARGV) {
  appendFileSync(process.env.VSK_FAKE_ARGV, `${JSON.stringify(argv)}\n`);
}

const outputIndex = argv.indexOf('--output');
if (outputIndex !== -1 && argv[outputIndex + 1]) {
  const body =
    process.env.VSK_FAKE_REPORT ??
    JSON.stringify({
      risk_assessment: { score: 17, severity: 'LOW', recommendation: 'SAFE' },
      issues: [],
      suppressed_count: 0,
      execution_successful: true,
    });
  writeFileSync(argv[outputIndex + 1], body);
}

process.exit(Number(process.env.VSK_FAKE_EXIT ?? 0));
