import { describe, expect, test } from 'bun:test'
import { locateSkillspector, parsePipxList, parseUvToolList } from '../scripts/lib/skillspector.mjs'

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
