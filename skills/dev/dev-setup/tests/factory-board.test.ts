import { describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const skillRoot = join(import.meta.dir, '..')
const template = readFileSync(join(skillRoot, 'assets/factory-board.yml.template'), 'utf8')
const workflow = Bun.YAML.parse(template) as any
const step = (id: string) => workflow.jobs.mirror.steps.find((s: any) => s.id === id)

type RunResult = { code: number | null; stdout: string; outputs: string; ghLog: string }

function runBlock(script: string, env: Record<string, string>, ghVersion = 'gh version 2.97.0 (2026-08-01)'): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'vsk-board-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  const ghLog = join(dir, 'gh.log')
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${ghVersion}"; exit 0; fi\nprintf '%s\\n' "$*" >> "${ghLog}"\nif [ -f "${dir}/failfirst" ] && ! grep -q item-add "${ghLog}"; then exit 1; fi\nexit 0\n`,
  )
  chmodSync(join(bin, 'gh'), 0o755)
  const file = join(dir, 'block.sh')
  writeFileSync(file, script)
  const out = join(dir, 'outputs')
  writeFileSync(out, '')
  const proc = Bun.spawnSync(['sh', file], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: out, VSK_DIR: dir, ...env },
  })
  return {
    code: proc.exitCode,
    stdout: proc.stdout.toString() + proc.stderr.toString(),
    outputs: readFileSync(out, 'utf8'),
    ghLog: existsSync(ghLog) ? readFileSync(ghLog, 'utf8') : '',
  }
}

function profile(_dir: string, line: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'vsk-profile-')), 'dev.md')
  writeFileSync(path, `# Dev profile\n\n## Knobs\n\n${line}\nmerge: rebase\n`)
  return path
}

const STATES = 'needs-operator,needs-plan,ready,working,for-operator'
const resolve = () => step('resolve').run as string

describe('factory-board template — triggers and permissions', () => {
  test('fires on the four issue events and never asks for write on contents', () => {
    expect(template).toContain('    types: [labeled, unlabeled, opened, reopened]')
    expect(workflow.permissions).toEqual({ contents: 'read' })
  })

  test('the authoring notes end at the strip marker', () => {
    expect(template.split('\n').indexOf('# ---')).toBeGreaterThan(0)
  })
})

describe('factory-board template — resolve step', () => {
  test('no board number in the profile is a logged skip', () => {
    const r = runBlock(resolve(), { PROFILE: profile('', 'board: none'), APP_ID: '1', LABELS: 'ready', STATE_LABELS: STATES })
    expect(r.code).toBe(0)
    expect(r.outputs).toContain('decision=skip')
    expect(r.stdout).toContain('carries no board number')
    expect(r.ghLog).toBe('')
  })

  test('an unwired App is a logged skip', () => {
    const r = runBlock(resolve(), { PROFILE: profile('', 'board: 7'), APP_ID: '', LABELS: 'ready', STATE_LABELS: STATES })
    expect(r.code).toBe(0)
    expect(r.outputs).toContain('decision=skip')
    expect(r.stdout).toContain('VEGAFACTORY_APP_ID')
  })

  test('gh below the 2.97.0 floor fails loudly', () => {
    const r = runBlock(
      resolve(),
      { PROFILE: profile('', 'board: 7'), APP_ID: '1', LABELS: 'ready', STATE_LABELS: STATES },
      'gh version 2.92.0 (2026-04-28)',
    )
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('::error::')
    expect(r.stdout).toContain('2.97.0')
  })

  test('exactly one state label resolves to a sync', () => {
    const r = runBlock(resolve(), { PROFILE: profile('', 'board: 7   # the mirror'), APP_ID: '1', LABELS: 'risky,working,full-plan', STATE_LABELS: STATES })
    expect(r.code).toBe(0)
    expect(r.outputs).toContain('decision=sync')
    expect(r.outputs).toContain('board=7')
    expect(r.outputs).toContain('status=working')
  })

  test('no state label is a logged skip', () => {
    const r = runBlock(resolve(), { PROFILE: profile('', 'board: 7'), APP_ID: '1', LABELS: 'risky,full-plan', STATE_LABELS: STATES })
    expect(r.code).toBe(0)
    expect(r.outputs).toContain('decision=skip')
    expect(r.stdout).toContain('no state label')
  })

  test('two state labels are ambiguous and skipped', () => {
    const r = runBlock(resolve(), { PROFILE: profile('', 'board: 7'), APP_ID: '1', LABELS: 'ready,working', STATE_LABELS: STATES })
    expect(r.code).toBe(0)
    expect(r.outputs).toContain('decision=skip')
    expect(r.stdout).toContain('ambiguous, skipped')
  })
})
