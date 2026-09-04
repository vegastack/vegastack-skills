import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FactoryConfig } from '../src/control-room.ts'
import { planSync, resolveTarget, syncControlRoom } from '../src/sync.ts'

const NOW = Date.parse('2026-09-03T12:00:00Z')
let root = ''
let origin = ''

function git(args: string[], cwd: string) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' }
  const result = Bun.spawnSync(['git', ...args], { cwd, env })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}

const configFor = (home: string): FactoryConfig => ({
  schemaVersion: 1,
  controlRooms: {
    vegastack: { repo: 'vegastack/vegafactory-control-room', path: join(home, 'clone'), branch: 'main', remote: origin, lastSyncedAt: null, sha: null },
  },
  settings: {},
})
const DEV_MD = 'control-room: vegastack/vegafactory-control-room#dev\n'

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vf-sync-')))
  origin = join(root, 'origin')
  await mkdir(join(origin, 'groups/dev'), { recursive: true })
  await writeFile(join(origin, 'org.md'), 'stats: on\n')
  await writeFile(join(origin, 'groups/dev/group.md'), 'review: cross-agent-risky\n')
  git(['init', '--initial-branch=main'], origin)
  git(['add', '-A'], origin)
  git(['commit', '-m', 'seed'], origin)
})
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

describe('control-room sync', () => {
  test('a profile naming no control room resolves to no target', () => {
    expect(resolveTarget({ devMdText: '## Knobs\nreview: subagent\n', config: configFor(root), home: root })).toBeNull()
  })

  test('a profile with no knob resolves from an org name to the conventional control-room repo — the bootstrap case', () => {
    const target = resolveTarget({ devMdText: '## Knobs\nreview: subagent\n', config: configFor(root), home: root, org: 'vegastack' })
    expect(target).toMatchObject({ org: 'vegastack', repo: 'vegastack/vegafactory-control-room', group: null, recordedSha: null, remote: origin, clonePath: join(root, 'clone') })
    // An org the machine has never synced falls back to the GitHub URL by convention.
    const fresh = resolveTarget({ devMdText: '', config: { schemaVersion: 1, controlRooms: {}, settings: {} }, home: root, org: 'acme' })
    expect(fresh).toMatchObject({ org: 'acme', repo: 'acme/vegafactory-control-room', remote: 'https://github.com/acme/vegafactory-control-room.git', clonePath: join(root, '.vegastack/control-room/acme') })
    // The profile's own knob wins over a matching --org, and a different --org is refused rather than guessed.
    expect(resolveTarget({ devMdText: DEV_MD, config: configFor(root), home: root, org: 'vegastack' })).toMatchObject({ group: 'dev' })
    expect(() => resolveTarget({ devMdText: DEV_MD, config: configFor(root), home: root, org: 'acme' })).toThrow(/acme/)
  })

  test('a target takes its path and remote from the machine config, its group from the profile', () => {
    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(root), home: root })
    expect(target).toMatchObject({ org: 'vegastack', group: 'dev', branch: 'main', clonePath: join(root, 'clone'), remote: origin })
  })

  test('the plan: no clone clones, a stale clone refreshes, a fresh one is left alone unless forced', () => {
    expect(planSync({ cloneExists: false, lastSyncedAt: null, now: NOW, maxAgeMinutes: 30, force: false }).action).toBe('clone')
    expect(planSync({ cloneExists: true, lastSyncedAt: '2026-09-03T11:00:00Z', now: NOW, maxAgeMinutes: 30, force: false }).action).toBe('refresh')
    expect(planSync({ cloneExists: true, lastSyncedAt: '2026-09-03T11:45:00Z', now: NOW, maxAgeMinutes: 30, force: false }).action).toBe('fresh')
    expect(planSync({ cloneExists: true, lastSyncedAt: '2026-09-03T11:45:00Z', now: NOW, maxAgeMinutes: 30, force: true }).action).toBe('refresh')
  })

  test('a first run clones shallow, records the sha, and leaves the files readable', async () => {
    const home = join(root, 'first')
    await mkdir(home, { recursive: true })
    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(home), home })!
    const result = await syncControlRoom({ target, config: configFor(home), now: NOW })
    expect(result.ok).toBe(true)
    expect(result.action).toBe('clone')
    expect(result.sha).toMatch(/^[0-9a-f]{7}$/)
    expect(result.config.controlRooms.vegastack!.lastSyncedAt).toBe(new Date(NOW).toISOString())
    expect(await readFile(join(home, 'clone/groups/dev/group.md'), 'utf8')).toContain('review: cross-agent-risky')
  })

  test('a dry run reports the action and writes nothing', async () => {
    const home = join(root, 'dry')
    await mkdir(home, { recursive: true })
    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(home), home })!
    const result = await syncControlRoom({ target, config: configFor(home), now: NOW, dryRun: true })
    expect(result.action).toBe('clone')
    expect(result.ok).toBe(true)
    expect(await readFile(join(home, 'clone/org.md'), 'utf8').catch((e: Error) => e.message)).toContain('ENOENT')
  })

  test('a second run fast-forwards to the new commit', async () => {
    const home = join(root, 'refresh')
    await mkdir(home, { recursive: true })
    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(home), home })!
    const first = await syncControlRoom({ target, config: configFor(home), now: NOW })
    await writeFile(join(origin, 'groups/dev/group.md'), 'review: cross-agent\n')
    git(['add', '-A'], origin)
    git(['commit', '-m', 'knob moved'], origin)
    const second = await syncControlRoom({ target, config: first.config, now: NOW + 60 * 60_000, force: true })
    expect(second.ok).toBe(true)
    expect(second.action).toBe('refresh')
    expect(second.sha).not.toBe(first.sha)
    expect(await readFile(join(home, 'clone/groups/dev/group.md'), 'utf8')).toContain('review: cross-agent')
  })

  test('editing remote in the machine config repoints the next refresh, and editing branch follows a different branch', async () => {
    const home = join(root, 'repoint')
    await mkdir(home, { recursive: true })
    const other = join(root, 'origin-other')
    await mkdir(join(other, 'groups/dev'), { recursive: true })
    await writeFile(join(other, 'org.md'), 'stats: off\n')
    await writeFile(join(other, 'groups/dev/group.md'), 'review: subagent\n')
    git(['init', '--initial-branch=main'], other)
    git(['add', '-A'], other)
    git(['commit', '-m', 'seed other'], other)
    git(['checkout', '-b', 'edge'], other)
    await writeFile(join(other, 'org.md'), 'stats: edge\n')
    git(['add', '-A'], other)
    git(['commit', '-m', 'edge'], other)
    git(['checkout', 'main'], other)

    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(home), home })!
    const first = await syncControlRoom({ target, config: configFor(home), now: NOW })
    expect(await readFile(join(home, 'clone/org.md'), 'utf8')).toContain('stats: on')

    const repointed = await syncControlRoom({ target: { ...target, remote: other }, config: first.config, now: NOW + 60 * 60_000, force: true })
    expect(repointed.ok).toBe(true)
    expect(repointed.action).toBe('refresh')
    expect(await readFile(join(home, 'clone/org.md'), 'utf8')).toContain('stats: off')
    expect(repointed.config.controlRooms.vegastack!.remote).toBe(other)

    const branched = await syncControlRoom({ target: { ...target, remote: other, branch: 'edge' }, config: repointed.config, now: NOW + 2 * 60 * 60_000, force: true })
    expect(branched.ok).toBe(true)
    expect(await readFile(join(home, 'clone/org.md'), 'utf8')).toContain('stats: edge')
    expect(branched.config.controlRooms.vegastack!.branch).toBe('edge')
  })

  test('a clone with local modifications is refused by name and never reset', async () => {
    const home = join(root, 'dirty')
    await mkdir(home, { recursive: true })
    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(home), home })!
    const first = await syncControlRoom({ target, config: configFor(home), now: NOW })
    await writeFile(join(home, 'clone/org.md'), 'hand edited\n')
    const result = await syncControlRoom({ target, config: first.config, now: NOW + 60 * 60_000, force: true })
    expect(result.ok).toBe(false)
    expect(result.action).toBe('refused')
    expect(result.message).toContain(join(home, 'clone'))
    expect(await readFile(join(home, 'clone/org.md'), 'utf8')).toBe('hand edited\n')
  })

  test('a symlinked clone path is refused before any git call', async () => {
    const home = join(root, 'link')
    await mkdir(join(home, 'real'), { recursive: true })
    await symlink(join(home, 'real'), join(home, 'clone'))
    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(home), home })!
    const result = await syncControlRoom({ target, config: configFor(home), now: NOW })
    expect(result.ok).toBe(false)
    expect(result.action).toBe('refused')
    expect(result.message).toMatch(/symlink/i)
  })

  test('a failed fetch keeps the old clone and reports when it last synced', async () => {
    const home = join(root, 'offline')
    await mkdir(home, { recursive: true })
    const target = resolveTarget({ devMdText: DEV_MD, config: configFor(home), home })!
    const first = await syncControlRoom({ target, config: configFor(home), now: NOW })
    const result = await syncControlRoom({ target: { ...target, remote: join(root, 'gone') }, config: first.config, now: NOW + 2 * 60 * 60_000, force: true })
    expect(result.ok).toBe(false)
    expect(result.action).toBe('stale')
    expect(result.lastSyncedAt).toBe(first.lastSyncedAt)
    expect(result.ageMinutes).toBe(120)
    expect(await readFile(join(home, 'clone/org.md'), 'utf8')).toContain('stats: on')
  })
})
