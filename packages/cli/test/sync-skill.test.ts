import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// sync-skill.mjs runs against a repo layout, so each case builds a miniature one and drives the
// script through the VSK_REPO_ROOT override rather than needing a real checkout.
function repo(build: (skills: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sync-'))
  const skills = join(root, 'skills')
  mkdirSync(join(root, 'packages/cli'), { recursive: true })
  mkdirSync(skills, { recursive: true })
  build(skills)
  return root
}

const writeSkill = (dir: string, name: string, extra: Record<string, string> = {}) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n`)
  for (const [rel, body] of Object.entries(extra)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), body)
  }
}

const writeGroup = (skills: string, name: string, title: string) => {
  mkdirSync(join(skills, name), { recursive: true })
  writeFileSync(join(skills, name, 'GROUP.md'), `# ${title}\n\nA blurb.\n`)
}

const run = (root: string) =>
  Bun.spawnSync(['node', join(import.meta.dir, '../scripts/sync-skill.mjs')], { env: { ...process.env, VSK_REPO_ROOT: root } })

describe('sync-skill with groups', () => {
  test('a grouped and an ungrouped skill both land flat in the bundle', () => {
    const root = repo(skills => {
      writeSkill(join(skills, 'solo'), 'solo')
      writeGroup(skills, 'fam', 'Fam')
      writeSkill(join(skills, 'fam', 'member'), 'member')
    })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ solo: ['SKILL.md'], member: ['SKILL.md'] }))
    expect(run(root).exitCode).toBe(0)
    expect(existsSync(join(root, 'packages/cli/skill/solo/SKILL.md'))).toBe(true)
    expect(existsSync(join(root, 'packages/cli/skill/member/SKILL.md'))).toBe(true)
    expect(existsSync(join(root, 'packages/cli/skill/fam'))).toBe(false)
    const manifest = JSON.parse(readFileSync(join(root, 'packages/cli/skill-integrity.json'), 'utf8'))
    expect(Object.keys(manifest.skills).sort()).toEqual(['member', 'solo'])
    rmSync(root, { recursive: true, force: true })
  })

  test('an @source-skill entry resolves across a group boundary', () => {
    const root = repo(skills => {
      writeGroup(skills, 'fam', 'Fam')
      writeSkill(join(skills, 'fam', 'donor'), 'donor', { 'references/shared.md': 'shared body\n' })
      writeSkill(join(skills, 'taker'), 'taker')
    })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({
      donor: ['SKILL.md', 'references/shared.md'],
      taker: ['SKILL.md', 'references/shared.md@donor'],
    }))
    expect(run(root).exitCode).toBe(0)
    expect(readFileSync(join(root, 'packages/cli/skill/taker/references/shared.md'), 'utf8')).toBe('shared body\n')
    rmSync(root, { recursive: true, force: true })
  })

  test('a skill two levels deep fails the build loudly', () => {
    const root = repo(skills => {
      writeGroup(skills, 'a', 'A')
      writeSkill(join(skills, 'a', 'b', 'deep'), 'deep')
    })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ deep: ['SKILL.md'] }))
    const result = run(root)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toMatch(/nested too deep/i)
    rmSync(root, { recursive: true, force: true })
  })

  test('a duplicate skill name across a group boundary fails the build loudly', () => {
    const root = repo(skills => {
      writeSkill(join(skills, 'twin'), 'twin')
      writeGroup(skills, 'fam', 'Fam')
      writeSkill(join(skills, 'fam', 'twin'), 'twin')
    })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ twin: ['SKILL.md'] }))
    const result = run(root)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toMatch(/duplicate/i)
    rmSync(root, { recursive: true, force: true })
  })

  test('the manifest records each skill group, null when ungrouped', () => {
    const root = repo(skills => {
      writeSkill(join(skills, 'solo'), 'solo')
      writeGroup(skills, 'fam', 'Fam')
      writeSkill(join(skills, 'fam', 'member'), 'member')
    })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ solo: ['SKILL.md'], member: ['SKILL.md'] }))
    expect(run(root).exitCode).toBe(0)
    const manifest = JSON.parse(readFileSync(join(root, 'packages/cli/skill-integrity.json'), 'utf8'))
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.skills.member.group).toBe('fam')
    expect(manifest.skills.solo.group).toBeNull()
    // repoOnly defaults to false and comes only from the explicit list.
    expect(manifest.skills.member.repoOnly).toBe(false)
    expect(manifest.skills.solo.repoOnly).toBe(false)
    // Integrity still compares files only — the new fields must not affect it.
    expect(Object.keys(manifest.skills.member.files)).toEqual(['SKILL.md'])
    rmSync(root, { recursive: true, force: true })
  })

  test('repo-only.json marks the skills it names, and only those', () => {
    const root = repo(skills => {
      writeSkill(join(skills, 'solo'), 'solo')
      writeSkill(join(skills, 'meta'), 'meta')
    })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ solo: ['SKILL.md'], meta: ['SKILL.md'] }))
    writeFileSync(join(root, 'packages/cli/repo-only.json'), JSON.stringify(['meta']))
    expect(run(root).exitCode).toBe(0)
    const manifest = JSON.parse(readFileSync(join(root, 'packages/cli/skill-integrity.json'), 'utf8'))
    expect(manifest.skills.meta.repoOnly).toBe(true)
    expect(manifest.skills.solo.repoOnly).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  test('a repo-only.json naming a skill that does not exist fails the build', () => {
    const root = repo(skills => writeSkill(join(skills, 'solo'), 'solo'))
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ solo: ['SKILL.md'] }))
    writeFileSync(join(root, 'packages/cli/repo-only.json'), JSON.stringify(['ghost']))
    const result = run(root)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toMatch(/ghost/)
    rmSync(root, { recursive: true, force: true })
  })

  test('an ungrouped-only tree still builds, unchanged by group support', () => {
    const root = repo(skills => {
      writeSkill(join(skills, 'one'), 'one')
      writeSkill(join(skills, 'two'), 'two')
    })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ one: ['SKILL.md'], two: ['SKILL.md'] }))
    expect(run(root).exitCode).toBe(0)
    const manifest = JSON.parse(readFileSync(join(root, 'packages/cli/skill-integrity.json'), 'utf8'))
    expect(Object.keys(manifest.skills).sort()).toEqual(['one', 'two'])
    rmSync(root, { recursive: true, force: true })
  })
})
