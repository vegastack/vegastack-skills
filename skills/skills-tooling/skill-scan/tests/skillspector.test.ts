import { describe, expect, test } from 'bun:test'
import {
  latestRelease,
  locateSkillspector,
  parsePipxList,
  parseUvToolList,
  provisionSkillspector,
  readVersion,
} from '../scripts/lib/skillspector.mjs'

const UV_OUT =
  'skillspector v2.11.0 (/Users/x/.local/share/uv/tools/skillspector)\n- skillspector (/Users/x/.local/bin/skillspector)\n'

type Result = { ok: boolean; stdout: string }

const runner =
  (table: Record<string, Result>) =>
  (cmd: string, args: string[]): Result =>
    table[`${cmd} ${args.join(' ')}`] ?? { ok: false, stdout: '' }

// Unit tests never touch the filesystem: every located path is treated as real
// unless a test says otherwise.
const present = () => true

describe('parseUvToolList', () => {
  test('reads the executable path', () => {
    expect(parseUvToolList(UV_OUT)).toBe('/Users/x/.local/bin/skillspector')
  })

  test('returns null when skillspector is absent', () => {
    expect(parseUvToolList('ruff v0.1.0 (/tmp/ruff)\n- ruff (/tmp/bin/ruff)\n')).toBeNull()
  })

  test('does not match a tool whose name merely starts with skillspector', () => {
    expect(parseUvToolList('- skillspector-extra (/tmp/bin/skillspector-extra)\n')).toBeNull()
  })
})

describe('parsePipxList', () => {
  // Verified 01-09-2026 against a real pipx: `pipx list --short` exits 0 even
  // with nothing installed, so the exit code proves nothing and the output is
  // what must be read.
  test('is false for the empty message pipx prints when nothing is installed', () => {
    expect(parsePipxList('nothing has been installed with pipx \u{1F634}\n')).toBe(false)
  })

  test('is true when skillspector is listed', () => {
    expect(parsePipxList('ruff 0.1.0\nskillspector 2.11.0\n')).toBe(true)
  })
})

describe('locateSkillspector', () => {
  test('prefers uv and reports the channel', () => {
    const run = runner({ 'uv tool list --show-paths': { ok: true, stdout: UV_OUT } })
    expect(locateSkillspector({ run, exists: present })).toEqual({
      channel: 'uv',
      path: '/Users/x/.local/bin/skillspector',
    })
  })

  test('falls through to brew', () => {
    const run = runner({
      'brew list --versions skillspector': { ok: true, stdout: 'skillspector 2.11.0\n' },
      'brew --prefix skillspector': { ok: true, stdout: '/opt/homebrew/opt/skillspector\n' },
    })
    expect(locateSkillspector({ run, exists: present })).toEqual({
      channel: 'brew',
      path: '/opt/homebrew/opt/skillspector/bin/skillspector',
    })
  })

  test('falls through to pipx', () => {
    const run = runner({
      'pipx list --short': { ok: true, stdout: 'skillspector 2.11.0\n' },
      'pipx environment --value PIPX_BIN_DIR': { ok: true, stdout: '/Users/x/.local/bin\n' },
    })
    expect(locateSkillspector({ run, exists: present })).toEqual({
      channel: 'pipx',
      path: '/Users/x/.local/bin/skillspector',
    })
  })

  // Regression: `brew --prefix <known-formula>` exits 0 and prints a path even
  // when the formula is NOT installed — verified 01-09-2026, where it named
  // /opt/homebrew/opt/skillspector, a directory that does not exist. Detection
  // therefore reads `brew list --versions`, and every channel's path is checked
  // on disk before it is believed.
  test('a channel naming a path that does not exist is not believed', () => {
    const run = runner({
      'brew list --versions skillspector': { ok: true, stdout: 'skillspector 2.11.0\n' },
      'brew --prefix skillspector': { ok: true, stdout: '/opt/homebrew/opt/skillspector\n' },
    })
    expect(locateSkillspector({ run, exists: () => false })).toBeNull()
  })

  test('brew is skipped entirely when the formula is not installed', () => {
    const run = runner({
      'brew --prefix skillspector': { ok: true, stdout: '/opt/homebrew/opt/skillspector\n' },
    })
    expect(locateSkillspector({ run, exists: present })).toBeNull()
  })

  test('returns null when no channel has it', () => {
    expect(locateSkillspector({ run: runner({}), exists: present })).toBeNull()
  })
})

describe('readVersion', () => {
  // Verified 01-09-2026: `skillspector --version` prints "SkillSpector v2.11.0"
  // on stdout while its missing-API-key warnings go to stderr, so the combined
  // stream must never be what gets parsed.
  test('parses the version from stdout', () => {
    expect(readVersion({ path: '/u/skillspector', run: () => ({ ok: true, stdout: 'SkillSpector v2.11.0\n' }) })).toBe(
      '2.11.0',
    )
  })

  test('is null when the command fails', () => {
    expect(readVersion({ path: '/u/skillspector', run: () => ({ ok: false, stdout: 'boom' }) })).toBeNull()
  })

  test('is null for output it does not recognise', () => {
    expect(readVersion({ path: '/u/skillspector', run: () => ({ ok: true, stdout: 'wat\n' }) })).toBeNull()
  })
})

describe('provisionSkillspector', () => {
  const recorder = (result: Result = { ok: true, stdout: '' }) => {
    const calls: string[] = []
    const run = (cmd: string, args: string[]) => {
      calls.push(`${cmd} ${args.join(' ')}`)
      return result
    }
    return { calls, run }
  }

  test('off does nothing at all', () => {
    const { calls, run } = recorder()
    expect(provisionSkillspector({ mode: 'off', located: null, run }).action).toBe('none')
    expect(calls).toEqual([])
  })

  test('notify changes nothing on the machine', () => {
    const { calls, run } = recorder()
    expect(provisionSkillspector({ mode: 'notify', located: null, run }).action).toBe('none')
    expect(calls).toEqual([])
  })

  test('auto installs when nothing is present, using upstream git URL', () => {
    const { calls, run } = recorder()
    expect(provisionSkillspector({ mode: 'auto', located: null, run }).action).toBe('installed')
    expect(calls[0]).toBe('uv tool install git+https://github.com/NVIDIA/skillspector.git')
  })

  test('auto upgrades through the channel that installed it', () => {
    const { calls, run } = recorder()
    provisionSkillspector({ mode: 'auto', located: { channel: 'brew', path: '/b/skillspector' }, run })
    expect(calls).toContain('brew upgrade skillspector')
    expect(calls).not.toContain('uv tool upgrade skillspector')
  })

  test('a failed upgrade falls back instead of throwing', () => {
    const out = provisionSkillspector({
      mode: 'auto',
      located: { channel: 'uv', path: '/u/skillspector' },
      run: () => ({ ok: false, stdout: 'network unreachable' }),
    })
    expect(out.action).toBe('failed')
    expect(out.message).toContain('network unreachable')
  })

  test('reports the dependency lines an upgrade moved', () => {
    // Verified 01-09-2026: `uv tool upgrade` moves the whole dependency tree,
    // so a run can change behaviour while the version string holds steady.
    const out = provisionSkillspector({
      mode: 'auto',
      located: { channel: 'uv', path: '/u/skillspector' },
      run: (_cmd: string, args: string[]) =>
        args.includes('--version')
          ? { ok: true, stdout: 'SkillSpector v2.11.0\n' }
          : { ok: true, stdout: ' - langsmith==0.11.2\n + langsmith==0.12.0\n' },
    })
    expect(out.action).toBe('upgraded')
    expect(out.before).toBe('2.11.0')
    expect(out.after).toBe('2.11.0')
    expect(out.changed).toEqual(['- langsmith==0.11.2', '+ langsmith==0.12.0'])
  })

  test('control characters in command output cannot repaint the terminal', () => {
    const out = provisionSkillspector({
      mode: 'auto',
      located: { channel: 'uv', path: '/u/skillspector' },
      run: () => ({ ok: false, stdout: 'boom\u001b[31mRED' }),
    })
    expect(out.message).not.toContain('\u001b')
  })
})

describe('latestRelease', () => {
  test('reads the tag and strips the v', async () => {
    expect(await latestRelease({ fetchJson: async () => ({ tag_name: 'v2.13.0' }) })).toBe('2.13.0')
  })

  test('offline is null, never a throw', async () => {
    expect(
      await latestRelease({
        fetchJson: async () => {
          throw new Error('offline')
        },
      }),
    ).toBeNull()
  })

  test('an unrecognised body is null', async () => {
    expect(await latestRelease({ fetchJson: async () => ({}) })).toBeNull()
  })

  test('a tag that is not a version is rejected rather than reported', async () => {
    expect(await latestRelease({ fetchJson: async () => ({ tag_name: 'nightly' }) })).toBeNull()
  })
})
