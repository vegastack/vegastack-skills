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


// Strip C0/C1 controls (ANSI escapes included) from anything a command printed:
// this text reaches a terminal report, and package-manager output carries names
// from outside the repo. Mirrors skill-scan.mjs's own `safe()`.
function safe(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');
}

// `skillspector --version` prints "SkillSpector v2.11.0" on STDOUT while its
// missing-API-key warnings go to stderr (verified 01-09-2026). `run` hands back
// stdout alone on success, so the warnings can never contaminate the match.
export function readVersion({ path, run = defaultRun }) {
  const result = run(path, ['--version']);
  if (!result.ok) return null;
  const match = /SkillSpector\s+v?(\d+\.\d+\.\d+\S*)/i.exec(result.stdout);
  return match ? match[1] : null;
}

// The lines a package manager reported moving. uv prints one `+ pkg==x` /
// `- pkg==y` line per dependency it changed; anything else simply yields none.
function changedLines(stdout) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => safe(line.trim()))
    .filter((line) => /^[+-]\s*\S/.test(line));
}

// Install when absent, upgrade when present — and never throw: a machine
// without a network, without uv, or with a locked package manager must fall
// back to whatever is already installed and let the scan proceed. Only a
// SkillSpector that cannot be found at all blocks, and that is skill-scan's
// call, not this function's.
//
// No version check runs first, deliberately. `uv tool upgrade` moves the whole
// dependency tree while the version string can hold steady (verified
// 01-09-2026: langsmith 0.11.2 -> 0.12.0 under an unchanged v2.11.0), so
// comparing versions would report "current" about a tool that just changed.
export function provisionSkillspector({ mode, located, run = defaultRun }) {
  const idle = { action: 'none', before: null, after: null, changed: [], message: '' };

  // `notify` reports; it never touches the machine. The release lookup that
  // makes it useful belongs to the caller, which owns the network policy.
  if (mode !== 'auto') return located ? { ...idle, before: readVersion({ path: located.path, run }) } : idle;

  if (!located) {
    const [cmd, args] = INSTALL_COMMAND;
    const result = run(cmd, args);
    if (!result.ok) {
      return { ...idle, action: 'failed', message: safe(result.stdout), changed: changedLines(result.stdout) };
    }
    // `after` stays null: reading it needs the path, and only a fresh locate
    // knows where the install landed. The caller re-locates and fills it in.
    return { action: 'installed', before: null, after: null, changed: changedLines(result.stdout), message: '' };
  }

  const upgrade = UPGRADE[located.channel];
  if (!upgrade) {
    return { ...idle, message: `no upgrade command is known for the ${safe(String(located.channel))} channel` };
  }

  const before = readVersion({ path: located.path, run });
  const result = run(upgrade[0], upgrade[1]);
  if (!result.ok) {
    return { action: 'failed', before, after: before, changed: [], message: safe(result.stdout) };
  }
  return {
    action: 'upgraded',
    before,
    after: readVersion({ path: located.path, run }),
    changed: changedLines(result.stdout),
    message: '',
  };
}


// Upstream's releases feed. Unauthenticated and rate-limited to 60 requests an
// hour per IP (verified 01-09-2026), which `notify` stays far inside because it
// asks once per guard run and only in that mode.
export const RELEASES_URL = 'https://api.github.com/repos/NVIDIA/SkillSpector/releases/latest';

async function fetchReleaseJson(url) {
  // GitHub rejects requests without a User-Agent.
  const response = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'vegastack-skill-scan' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// The newest published release, or null. EVERY failure path is null and never a
// throw: `notify` is a courtesy line in a report, and a guard must not turn a
// flaky network into a verdict. A tag that is not a plain version (a nightly, a
// moved pointer) is rejected rather than reported as a version.
export async function latestRelease({ fetchJson = fetchReleaseJson, url = RELEASES_URL } = {}) {
  let body;
  try {
    body = await fetchJson(url);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const tag = typeof body.tag_name === 'string' ? body.tag_name.trim() : '';
  const match = /^v?(\d+\.\d+\.\d+\S*)$/.exec(tag);
  return match ? match[1] : null;
}

export const UPGRADE_COMMANDS = UPGRADE;
