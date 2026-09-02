import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { IMAGE_EXTENSIONS, evidenceRepoFrom, plan, retryPath, timestamp } from '../scripts/evidence-upload.mjs'

const skillRoot = resolve(import.meta.dir, '..')
const NOW = new Date('2026-09-03T04:05:06Z')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const png = () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsk-evidence-'))
  const file = join(dir, 'login.png')
  writeFileSync(file, PNG)
  return { dir, file }
}
const base = (file: string) => ({ repo: 'vegastack/app', issue: '12', file, devMd: 'evidence-repo: vegastack/dev-review-evidence   # shared\n', now: NOW })

describe('evidence-upload plan(): metadata only, never the bytes', () => {
  test('evidenceRepoFrom reads the knob and ignores the trailing comment', () => {
    expect(evidenceRepoFrom('ui-evidence: playwright\nevidence-repo: o/evidence   # note\n')).toBe('o/evidence')
    expect(evidenceRepoFrom('ui-evidence: none\n')).toBeNull()
  })
  test('timestamp is UTC YYYYMMDD-HHMMSS', () => {
    expect(timestamp(NOW)).toBe('20260903-040506')
  })
  test('a readable png plans the PUT under <repo-name>/<issue>/<timestamp>-<name>', () => {
    const { file } = png()
    const r = plan(base(file))
    expect(r.blocks).toEqual([])
    expect(r.put).toEqual({
      evidenceRepo: 'vegastack/dev-review-evidence',
      path: 'app/12/20260903-040506-login.png',
      bytes: 4,
      apiPath: 'repos/vegastack/dev-review-evidence/contents/app/12/20260903-040506-login.png',
      message: 'evidence #12',
    })
  })
  test('--evidence-repo overrides the knob', () => {
    const { file } = png()
    expect(plan({ ...base(file), evidenceRepo: 'o/override' }).put?.evidenceRepo).toBe('o/override')
  })
  test('no knob and no flag blocks, naming both', () => {
    const { file } = png()
    const r = plan({ ...base(file), devMd: 'ui-evidence: none\n' })
    expect(r.put).toBeNull()
    expect(r.blocks.join(' ')).toContain('evidence-repo')
    expect(r.blocks.join(' ')).toContain('--evidence-repo')
  })
  test('a missing file blocks', () => {
    const r = plan(base('/nonexistent/vsk/x.png'))
    expect(r.put).toBeNull()
    expect(r.blocks.join(' ')).toContain('cannot read')
  })
  test('a symlink is refused even when its target is a png', () => {
    const { dir, file } = png()
    const link = join(dir, 'link.png')
    symlinkSync(file, link)
    expect(plan(base(link)).blocks.join(' ')).toContain('symlink')
  })
  test('a non-image extension is refused', () => {
    const { dir } = png()
    const txt = join(dir, 'notes.txt')
    writeFileSync(txt, 'x')
    expect(plan(base(txt)).blocks.join(' ')).toContain('.txt')
    expect(IMAGE_EXTENSIONS).toContain('.png')
  })
  test('an empty file is refused', () => {
    const { dir } = png()
    const empty = join(dir, 'empty.png')
    writeFileSync(empty, '')
    expect(plan(base(empty)).blocks.join(' ')).toContain('empty')
  })
})

const stub = join(skillRoot, 'tests/fixtures/gh-put-stub.sh')
const devMdFile = (body = 'evidence-repo: vegastack/dev-review-evidence\n') => {
  const p = join(mkdtempSync(join(tmpdir(), 'vsk-devmd-')), 'dev.md')
  writeFileSync(p, body)
  return p
}
const cli = (args: string[], env: Record<string, string> = {}) => {
  const r = spawnSync('node', [join(skillRoot, 'scripts/evidence-upload.mjs'), ...args, '--json'], {
    env: { ...process.env, VSK_GH: stub, ...env }, encoding: 'utf8',
  })
  return { status: r.status, out: JSON.parse(r.stdout), raw: r.stdout + r.stderr }
}
const B64 = PNG.toString('base64')

describe('evidence-upload CLI: dry-run default, stdin payload, one 409 retry', () => {
  test('dry-run prints the PUT path and size, sends nothing, prints no payload', () => {
    const { dir, file } = png()
    const log = join(dir, 'log')
    const { status, out, raw } = cli(['--repo', 'vegastack/app', '--issue', '12', '--file', file, '--dev-md', devMdFile()], { VSK_STUB_LOG: log })
    expect(status).toBe(0)
    expect(out.ok).toBe(true)
    expect(out.upload.mode).toBe('dry-run')
    expect(out.upload.path).toMatch(/^app\/12\/\d{8}-\d{6}-login\.png$/)
    expect(out.upload.bytes).toBe(4)
    expect(out.upload.evidenceRepo).toBe('vegastack/dev-review-evidence')
    expect(existsSync(log)).toBe(false)
    expect(raw).not.toContain(B64)
  })
  test('--write sends {message, content} over stdin, keeps argv clean, reports html_url', () => {
    const { dir, file } = png()
    const log = join(dir, 'log')
    const { status, out, raw } = cli(['--repo', 'vegastack/app', '--issue', '12', '--file', file, '--dev-md', devMdFile(), '--write'], { VSK_STUB_LOG: log })
    expect(status).toBe(0)
    expect(out.upload.mode).toBe('sent')
    expect(out.upload.attempts).toBe(1)
    expect(out.upload.url).toContain('https://github.com/o/evidence/blob/main/')
    const argv = readFileSync(log, 'utf8')
    expect(argv).toContain('-X PUT repos/vegastack/dev-review-evidence/contents/app/12/')
    expect(argv).toContain('--input -')
    expect(argv).not.toContain(B64)
    expect(JSON.parse(readFileSync(`${log}.stdin`, 'utf8'))).toEqual({ message: 'evidence #12', content: B64 })
    expect(raw).not.toContain(B64)
  })
  test('a 409 on the first PUT retries once under a new name → exit 1 with the warn', () => {
    const { dir, file } = png()
    const log = join(dir, 'log')
    const { status, out } = cli(['--repo', 'vegastack/app', '--issue', '12', '--file', file, '--dev-md', devMdFile(), '--write'], { VSK_STUB_LOG: log, VSK_STUB_409_FIRST: '1' })
    expect(status).toBe(1)
    expect(out.upload.mode).toBe('sent')
    expect(out.upload.attempts).toBe(2)
    expect(out.upload.path).toMatch(/-r2-login\.png$/)
    expect(out.warns.join(' ')).toContain('409')
    const lines = readFileSync(log, 'utf8').trim().split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).not.toBe(lines[1])
  })
  test('a non-409 failure blocks without a retry → exit 2', () => {
    const { dir, file } = png()
    const log = join(dir, 'log')
    const { status, out } = cli(['--repo', 'vegastack/app', '--issue', '12', '--file', file, '--dev-md', devMdFile(), '--write'], { VSK_STUB_LOG: log, VSK_STUB_FAIL: '1' })
    expect(status).toBe(2)
    expect(out.upload).toBeNull()
    expect(out.blocks.join(' ')).toContain('HTTP 500')
    expect(readFileSync(log, 'utf8').trim().split('\n').length).toBe(1)
  })
  test('no evidence-repo knob and no flag → exit 2 naming the knob and the flag', () => {
    const { file } = png()
    const { status, out } = cli(['--repo', 'vegastack/app', '--issue', '12', '--file', file, '--dev-md', devMdFile('ui-evidence: none\n')])
    expect(status).toBe(2)
    expect(out.blocks.join(' ')).toContain('evidence-repo')
  })
  test('a symlinked file → exit 2 before any gh call', () => {
    const { dir, file } = png()
    const link = join(dir, 'link.png')
    symlinkSync(file, link)
    const log = join(dir, 'log')
    const { status } = cli(['--repo', 'vegastack/app', '--issue', '12', '--file', link, '--dev-md', devMdFile(), '--write'], { VSK_STUB_LOG: log })
    expect(status).toBe(2)
    expect(existsSync(log)).toBe(false)
  })
  test('usage without --file → exit 2', () => {
    const { status, out } = cli(['--repo', 'vegastack/app', '--issue', '12'])
    expect(status).toBe(2)
    expect(out.blocks.join(' ')).toContain('--file')
  })
  test('retryPath inserts -r2 after the timestamp', () => {
    expect(retryPath('app/12/20260903-040506-login.png')).toBe('app/12/20260903-040506-r2-login.png')
  })
})
