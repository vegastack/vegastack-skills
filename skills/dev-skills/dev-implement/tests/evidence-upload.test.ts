import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { IMAGE_EXTENSIONS, evidenceRepoFrom, plan, timestamp } from '../scripts/evidence-upload.mjs'

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
