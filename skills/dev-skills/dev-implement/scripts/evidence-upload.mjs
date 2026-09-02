#!/usr/bin/env node
// dev-implement evidence-upload: put one screenshot into the shared evidence
// repo through the GitHub contents API. Dry-run by default — it prints the PUT
// it would make (path and size, never the bytes) — and sends only under
// --write. The request body ({message, content}) travels over gh's stdin
// (`--input -`), so the base64 payload never touches argv or any output line.
// A 409 on the first PUT (a concurrent upload chose the same name) is retried
// once under a fresh name. Symlinks, non-image extensions, and empty files are
// refused before any network call.
//
// Exit codes: 0 planned or sent · 1 sent after a 409 retry (warn) · 2 refused
// (reasons printed). Usage:
//   node evidence-upload.mjs --repo <o/r> --issue <n> --file <png>
//     [--evidence-repo <o/r>] [--dev-md <path>] [--write] [--json]
// The evidence repo comes from dev.md's `evidence-repo:` knob; --evidence-repo
// overrides it. The uploaded path is <repo-name>/<issue>/<timestamp>-<name>.
import { lstatSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GhUnavailable, ghJson, parseFlags, renderResult } from './lib/gh.mjs';

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

// First `evidence-repo:` knob line in dev.md; a trailing `# comment` is ignored
// because the value stops at whitespace.
export function evidenceRepoFrom(devMd) {
  const match = /^evidence-repo:\s*(\S+)/m.exec(devMd ?? '');
  return match ? match[1] : null;
}

// UTC YYYYMMDD-HHMMSS — the collision-avoiding prefix on every evidence file.
export function timestamp(now) {
  return now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

// Pure plan: file checks by metadata only (lstat — the file's contents are
// never read here), evidence repo resolution, target path and size. `put` is
// null whenever anything blocks.
export function plan({ repo, issue, file, evidenceRepo, devMd, now = new Date() }) {
  const blocks = [];
  if (!repo) blocks.push('--repo <o/r> is required (the repo the evidence belongs to)');
  if (!issue) blocks.push('--issue <n> is required');
  if (!file) blocks.push('--file <png> is required');

  let bytes = 0;
  if (file) {
    let stat = null;
    try {
      stat = lstatSync(file);
    } catch (error) {
      blocks.push(`cannot read ${file}: ${error.code || error.message}`);
    }
    if (stat) {
      if (stat.isSymbolicLink()) {
        blocks.push(`${file} is a symlink — evidence is uploaded from a regular file so the bytes sent are the bytes named`);
      } else if (!stat.isFile()) {
        blocks.push(`${file} is not a regular file`);
      } else {
        const ext = extname(file).toLowerCase();
        if (!IMAGE_EXTENSIONS.includes(ext)) {
          blocks.push(`${ext || '(no extension)'} is not an image extension (png, jpg, jpeg, webp, gif)`);
        }
        if (stat.size === 0) blocks.push(`${file} is empty (0 bytes)`);
        bytes = stat.size;
      }
    }
  }

  const target = evidenceRepo || evidenceRepoFrom(devMd);
  if (!target) blocks.push('no evidence repo: dev.md has no evidence-repo: line and --evidence-repo was not passed');

  if (blocks.length > 0) return { blocks, put: null };

  const repoName = repo.includes('/') ? repo.slice(repo.indexOf('/') + 1) : repo;
  const path = `${repoName}/${issue}/${timestamp(now)}-${basename(file)}`;
  return {
    blocks,
    put: {
      evidenceRepo: target,
      path,
      bytes,
      apiPath: `repos/${target}/contents/${path}`,
      message: `evidence #${issue}`,
    },
  };
}
