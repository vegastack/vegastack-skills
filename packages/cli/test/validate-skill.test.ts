import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverSkillDirs, validateSkill } from '../scripts/validate-skill.mjs'

describe('discoverSkillDirs', () => {
  test('returns grouped and ungrouped skill dirs and never a group dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'validate-'))
    const skills = join(root, 'skills')
    mkdirSync(join(skills, 'solo'), { recursive: true })
    writeFileSync(join(skills, 'solo', 'SKILL.md'), '---\nname: solo\ndescription: d\n---\n')
    mkdirSync(join(skills, 'fam', 'member'), { recursive: true })
    writeFileSync(join(skills, 'fam', 'GROUP.md'), '# Fam\n\nA blurb.\n')
    writeFileSync(join(skills, 'fam', 'member', 'SKILL.md'), '---\nname: member\ndescription: d\n---\n')
    const found = discoverSkillDirs(skills).sort()
    expect(found).toEqual([join(skills, 'fam', 'member'), join(skills, 'solo')])
    for (const dir of found) expect(validateSkill(dir).ok).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  test('an ungrouped-only tree is discovered exactly as before', () => {
    const root = mkdtempSync(join(tmpdir(), 'validate-flat-'))
    const skills = join(root, 'skills')
    for (const name of ['one', 'two']) {
      mkdirSync(join(skills, name), { recursive: true })
      writeFileSync(join(skills, name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n`)
    }
    expect(discoverSkillDirs(skills).sort()).toEqual([join(skills, 'one'), join(skills, 'two')])
    rmSync(root, { recursive: true, force: true })
  })

  test('validateSkill still requires name to equal the directory name inside a group', () => {
    const root = mkdtempSync(join(tmpdir(), 'validate-mismatch-'))
    const skills = join(root, 'skills')
    mkdirSync(join(skills, 'fam', 'member'), { recursive: true })
    writeFileSync(join(skills, 'fam', 'GROUP.md'), '# Fam\n\nA blurb.\n')
    // The group name must never be what the frontmatter is checked against.
    writeFileSync(join(skills, 'fam', 'member', 'SKILL.md'), '---\nname: fam\ndescription: d\n---\n')
    const result = validateSkill(join(skills, 'fam', 'member'))
    expect(result.ok).toBe(false)
    expect(result.message).toContain("must match the skill directory name 'member'")
    rmSync(root, { recursive: true, force: true })
  })
})
