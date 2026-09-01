#!/usr/bin/env node
// Everything about the SkillSpector CLI itself — where it is, installing it,
// upgrading it, reading its version. `skill-scan.mjs` keeps owning the scan and
// the verdict and calls in here once, before scanning.
//
// Named for the tool, not for its role: this repo's own machinery is "skill
// scan", and the third-party binary is always "skillspector" by its exact name,
// so the generic word stays free (operator's rule, 01-09-2026).
//
// Every command runs through an injected `run`, and every path check through an
// injected `exists`, so unit tests never install software or touch the disk.
// Self-contained (ships with dev-review; no cross-skill imports, no dependencies).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Upstream's own documented quick install, verified 01-09-2026 against the
// SkillSpector README, which documents uv and no other package manager. The git
// URL is not optional: the package is NOT published to PyPI (HTTP 404), so a
// bare `pip install skillspector` can never work.
export const INSTALL_COMMAND = ['uv', ['tool', 'install', 'git+https://github.com/NVIDIA/skillspector.git']];

// Per channel, in probe order. `detect` proves the tool is actually installed;
// `locate` turns that into an absolute executable path.
const UPGRADE = {
  uv: ['uv', ['tool', 'upgrade', 'skillspector']],
  brew: ['brew', ['upgrade', 'skillspector']],
  pipx: ['pipx', ['upgrade', 'skillspector']],
};

// A command runner that never throws: a non-zero exit is data, not an
// exception, because "brew is not installed here" is an ordinary answer to
// "where is skillspector". stderr is folded into stdout so a failure message
// survives for the report.
export function defaultRun(cmd, args, { timeoutMs = 300_000 } = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // `env` is passed explicitly, as skill-scan.mjs does: under Bun a mutated
      // process.env is NOT inherited by execFileSync children.
      env: { ...process.env },
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, stdout };
  } catch (error) {
    const out = `${error.stdout?.toString() ?? ''}${error.stderr?.toString() ?? ''}`.trim();
    return { ok: false, stdout: out || error.message || '' };
  }
}

// `uv tool list --show-paths` prints one line per tool and one indented line per
// executable it installed:
//   skillspector v2.11.0 (/home/x/.local/share/uv/tools/skillspector)
//   - skillspector (/home/x/.local/bin/skillspector)
// The executable line is the one that matters — the first is the venv, which is
// not runnable. Anchored on both sides so `skillspector-extra` cannot match.
export function parseUvToolList(text) {
  for (const line of String(text ?? '').split('\n')) {
    const match = /^-\s+skillspector\s+\((.+)\)\s*$/.exec(line.trim());
    if (match) return match[1];
  }
  return null;
}

// `pipx list --short` exits 0 whether or not anything is installed (verified
// 01-09-2026 — it prints "nothing has been installed with pipx" and succeeds),
// so the exit code proves nothing and the listing has to be read.
export function parsePipxList(text) {
  return String(text ?? '')
    .split('\n')
    .some((line) => /^skillspector(\s|$)/.test(line.trim()));
}

// Ask each channel where it put the executable, in order, and believe only a
// path that is actually on disk.
//
// The existence check is not defensive padding: `brew --prefix <formula>` exits
// 0 and prints a path for any formula it KNOWS, installed or not — verified
// 01-09-2026, where it named /opt/homebrew/opt/skillspector while nothing was
// installed there. Detection therefore runs `brew list --versions` first, and
// the check below is the backstop for every channel.
export function locateSkillspector({ run = defaultRun, exists = existsSync } = {}) {
  const believe = (channel, path) => (path && exists(path) ? { channel, path } : null);

  const uv = run('uv', ['tool', 'list', '--show-paths']);
  if (uv.ok) {
    const found = believe('uv', parseUvToolList(uv.stdout));
    if (found) return found;
  }

  if (run('brew', ['list', '--versions', 'skillspector']).ok) {
    const prefix = run('brew', ['--prefix', 'skillspector']);
    if (prefix.ok && prefix.stdout.trim()) {
      const found = believe('brew', join(prefix.stdout.trim(), 'bin', 'skillspector'));
      if (found) return found;
    }
  }

  const pipx = run('pipx', ['list', '--short']);
  if (pipx.ok && parsePipxList(pipx.stdout)) {
    const dir = run('pipx', ['environment', '--value', 'PIPX_BIN_DIR']);
    if (dir.ok && dir.stdout.trim()) {
      const found = believe('pipx', join(dir.stdout.trim(), 'skillspector'));
      if (found) return found;
    }
  }

  return null;
}

export const UPGRADE_COMMANDS = UPGRADE;
