import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const packageRoot = resolve(import.meta.dir, '..')
const cli = join(packageRoot, 'dist/index.js')
let root = ''
let origin = ''

function git(args: string[], cwd: string) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' }
  const result = Bun.spawnSync(['git', ...args], { cwd, env })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}
const run = (home: string, cwd: string, args: string[]) =>
  Bun.spawnSync(['node', cli, ...args], { cwd, env: { ...process.env, HOME: home } })

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vf-sync-cli-')))
  const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: packageRoot })
  if (build.exitCode !== 0) throw new Error(build.stderr.toString())
  origin = join(root, 'origin')
  await mkdir(join(origin, 'groups/dev'), { recursive: true })
  await writeFile(join(origin, 'org.md'), 'stats: on\n')
  await writeFile(join(origin, 'groups/dev/group.md'), 'review: cross-agent-risky\n')
  git(['init', '--initial-branch=main'], origin)
  git(['add', '-A'], origin)
  git(['commit', '-m', 'seed'], origin)
})
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

async function project(name: string, devMd: string) {
  const home = join(root, name)
  const repo = join(home, 'repo')
  await mkdir(join(repo, '.vegastack'), { recursive: true })
  await mkdir(join(home, '.vegastack'), { recursive: true })
  await writeFile(join(repo, '.vegastack/dev.md'), devMd)
  await writeFile(join(home, '.vegastack/factory.json'), `${JSON.stringify({
    schemaVersion: 1,
    controlRooms: { vegastack: { repo: 'vegastack/vegafactory-control-room', path: join(home, '.vegastack/control-room/vegastack'), branch: 'main', remote: origin, lastSyncedAt: null, sha: null } },
  }, null, 2)}\n`)
  return { home, repo }
}

describe('vegafactory sync', () => {
  test('a repo naming no control room exits 0 and says so', async () => {
    const { home, repo } = await project('none', '## Knobs\nreview: subagent\n')
    const result = run(home, repo, ['sync', '--json'])
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toMatchObject({ command: 'sync', ok: true, action: 'none' })
  })

  test('a first sync clones, records state, and prints the sha', async () => {
    const { home, repo } = await project('first', 'control-room: vegastack/vegafactory-control-room#dev\nsync-max-age: 30m\n')
    const result = run(home, repo, ['sync', '--json'])
    expect(result.exitCode).toBe(0)
    const payload = JSON.parse(result.stdout.toString())
    expect(payload).toMatchObject({ ok: true, action: 'clone', org: 'vegastack' })
    expect(payload.sha).toMatch(/^[0-9a-f]{7}$/)
    expect(await readFile(join(home, '.vegastack/control-room/vegastack/org.md'), 'utf8')).toContain('stats: on')
    const state = JSON.parse(await readFile(join(home, '.vegastack/factory.json'), 'utf8'))
    expect(state.controlRooms.vegastack.sha).toBe(payload.sha)
  })

  test('a second sync inside sync-max-age does nothing; --force refreshes', async () => {
    const { home, repo } = await project('fresh', 'control-room: vegastack/vegafactory-control-room#dev\nsync-max-age: 2h\n')
    expect(run(home, repo, ['sync', '--json']).exitCode).toBe(0)
    expect(JSON.parse(run(home, repo, ['sync', '--json']).stdout.toString()).action).toBe('fresh')
    expect(JSON.parse(run(home, repo, ['sync', '--json', '--force']).stdout.toString()).action).toBe('refresh')
  })

  test('a dry run writes no clone and no state file', async () => {
    const { home, repo } = await project('dry', 'control-room: vegastack/vegafactory-control-room#dev\n')
    const result = run(home, repo, ['sync', '--json', '--dry-run'])
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString()).action).toBe('clone')
    expect(await readFile(join(home, '.vegastack/control-room/vegastack/org.md'), 'utf8').catch((e: Error) => e.message)).toContain('ENOENT')
  })

  test('an unreadable state file is a refusal, not a reset', async () => {
    const { home, repo } = await project('broken', 'control-room: vegastack/vegafactory-control-room#dev\n')
    await writeFile(join(home, '.vegastack/factory.json'), '{ not json')
    const result = run(home, repo, ['sync', '--json'])
    expect(result.exitCode).toBe(2)
    expect(result.stderr.toString() + result.stdout.toString()).toContain('factory.json')
  })

  test('sync is no longer refused as reserved, and dashboard still is', () => {
    const help = run(root, root, ['--help']).stdout.toString()
    expect(help).toContain('vegafactory sync')
    expect(run(root, root, ['dashboard']).stderr.toString()).toContain('dashboard is not available yet')
  })
})
