import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverGroups, discoverSkills, nameError, readGroupDoc } from '../scripts/lib/skills.mjs'

let root = ''
const skill = (path: string, name: string) => {
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n`)
}
const group = (path: string, title: string) => {
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'GROUP.md'), `# ${title}\n\nA blurb.\n`)
}

beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'skills-lib-')) })
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

const tree = (label: string) => {
  const skills = join(root, label, 'skills')
  mkdirSync(skills, { recursive: true })
  return skills
}

describe('discoverSkills', () => {
  test('finds ungrouped and grouped skills in one mixed tree', () => {
    const skills = tree('mixed')
    skill(join(skills, 'solo'), 'solo')
    group(join(skills, 'fam'), 'Fam')
    skill(join(skills, 'fam', 'member'), 'member')
    const found = discoverSkills(skills)
    expect([...found.keys()].sort()).toEqual(['member', 'solo'])
    expect(found.get('solo')!.group).toBeNull()
    expect(found.get('member')!.group).toBe('fam')
    expect(found.get('member')!.path).toBe(join(skills, 'fam', 'member'))
  })

  test('an ungrouped-only tree needs no groups at all', () => {
    const skills = tree('flat')
    skill(join(skills, 'one'), 'one')
    skill(join(skills, 'two'), 'two')
    expect([...discoverSkills(skills).keys()].sort()).toEqual(['one', 'two'])
    expect(discoverGroups(skills).size).toBe(0)
  })

  test('raises on a skill nested two levels deep', () => {
    const skills = tree('deep')
    group(join(skills, 'a'), 'A')
    skill(join(skills, 'a', 'b', 'c'), 'c')
    expect(() => discoverSkills(skills)).toThrow(/nested too deep/i)
  })

  test('raises when the same skill name appears twice', () => {
    const skills = tree('dupe')
    skill(join(skills, 'twin'), 'twin')
    group(join(skills, 'fam'), 'Fam')
    skill(join(skills, 'fam', 'twin'), 'twin')
    expect(() => discoverSkills(skills)).toThrow(/duplicate/i)
  })

  test('raises when a group name equals a skill name living elsewhere', () => {
    const skills = tree('collide')
    group(join(skills, 'foo'), 'Foo')
    skill(join(skills, 'foo', 'inner'), 'inner')
    group(join(skills, 'bar'), 'Bar')
    skill(join(skills, 'bar', 'foo'), 'foo')
    expect(() => discoverSkills(skills)).toThrow(/group name .*foo.* also names a skill/i)
  })

  test('raises on a group name that breaks the shared grammar', () => {
    const skills = tree('badname')
    group(join(skills, 'Bad--Group'), 'B')
    skill(join(skills, 'Bad--Group', 'inner'), 'inner')
    expect(() => discoverSkills(skills)).toThrow(/group name/i)
  })
})

describe('discoverGroups', () => {
  test('returns every group directory in a mixed tree, and none of the skills', () => {
    const skills = tree('groups')
    skill(join(skills, 'solo'), 'solo')
    group(join(skills, 'fam'), 'Fam')
    skill(join(skills, 'fam', 'member'), 'member')
    const groups = discoverGroups(skills)
    expect([...groups.keys()]).toEqual(['fam'])
    expect(groups.get('fam')!.path).toBe(join(skills, 'fam'))
  })
})

describe('readGroupDoc', () => {
  test('reads the H1 title and the blurb line', () => {
    const skills = tree('doc')
    group(join(skills, 'fam'), 'Dev workflow')
    expect(readGroupDoc(join(skills, 'fam'))).toEqual({ title: 'Dev workflow', blurb: 'A blurb.' })
  })

  test('returns null for a GROUP.md with no blurb under the heading', () => {
    const skills = tree('noblurb')
    mkdirSync(join(skills, 'fam'), { recursive: true })
    writeFileSync(join(skills, 'fam', 'GROUP.md'), '# Only a title\n')
    expect(readGroupDoc(join(skills, 'fam'))).toBeNull()
  })

  test('returns null when GROUP.md is absent', () => {
    const skills = tree('nodoc')
    mkdirSync(join(skills, 'fam'), { recursive: true })
    expect(readGroupDoc(join(skills, 'fam'))).toBeNull()
  })
})

describe('nameError', () => {
  test('accepts a legal name and rejects each grammar break', () => {
    expect(nameError('dev-skills')).toBeNull()
    expect(nameError('Dev')).toContain('lowercase')
    expect(nameError('a--b')).toContain('consecutive')
    expect(nameError('a-')).toContain('hyphen')
    expect(nameError('1abc')).toContain('lowercase letter')
  })
})
