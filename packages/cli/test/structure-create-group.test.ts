import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkStructure, createGroup } from '../scripts/structure.mjs'

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'create-group-'))
  mkdirSync(join(root, 'skills'), { recursive: true })
  writeFileSync(join(root, 'README.md'), [
    '## Skills', '',
    '| Skill | What it does | Docs |', '|---|---|---|',
    '| [solo](skills/solo/) | s | [SKILL.md](skills/solo/SKILL.md) |', '',
    'Install any skill by name:', '',
    '## Repository structure', '',
  ].join('\n'))
  return root
}
const clean = (root: string) => rmSync(root, { recursive: true, force: true })

describe('createGroup', () => {
  test('dry run reports the plan and writes nothing', () => {
    const root = repo()
    const result = createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: 'The blurb.' })
    expect(result.wrote).toBe(false)
    expect(result.files).toContain('GROUP.md')
    expect(result.wiring.map(w => w.status)).toEqual(['planned', 'planned'])
    expect(existsSync(join(root, 'skills/fam'))).toBe(false)
    expect(readFileSync(join(root, 'README.md'), 'utf8')).not.toContain('### Fam')
    clean(root)
  })

  test('--write creates GROUP.md and the README section above the install snippet', () => {
    const root = repo()
    createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: 'The blurb.', write: true })
    expect(readFileSync(join(root, 'skills/fam/GROUP.md'), 'utf8')).toBe('# Fam\n\nThe blurb.\n')
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    expect(readme).toContain('### Fam')
    expect(readme).toContain('The blurb.')
    expect(readme.indexOf('### Fam')).toBeLessThan(readme.indexOf('Install any skill by name:'))
    expect(readme.indexOf('| [solo](skills/solo/) |')).toBeLessThan(readme.indexOf('### Fam'))
    clean(root)
  })

  test('a second group lands after the first, not inside it', () => {
    const root = repo()
    createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: 'First blurb.', write: true })
    createGroup({ name: 'kin', repoRoot: root, title: 'Kin', blurb: 'Second blurb.', write: true })
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    expect(readme.indexOf('### Fam')).toBeLessThan(readme.indexOf('### Kin'))
    expect(readme.indexOf('### Kin')).toBeLessThan(readme.indexOf('Install any skill by name:'))
    clean(root)
  })

  test('a second run is idempotent and reports it', () => {
    const root = repo()
    createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: 'The blurb.', write: true })
    const again = createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: 'The blurb.', write: true })
    expect(again.wiring.map(w => w.status).join()).toMatch(/already exists/)
    expect(readFileSync(join(root, 'README.md'), 'utf8').match(/### Fam/g)).toHaveLength(1)
    clean(root)
  })

  test('refuses an invalid group name before touching the filesystem', () => {
    const root = repo()
    expect(() => createGroup({ name: 'Bad--Name', repoRoot: root, title: 'B', blurb: 'b', write: true })).toThrow(/name/i)
    expect(existsSync(join(root, 'skills/Bad--Name'))).toBe(false)
    clean(root)
  })

  test('refuses a group with no title or no blurb', () => {
    const root = repo()
    expect(() => createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: '', write: true })).toThrow(/blurb/i)
    expect(existsSync(join(root, 'skills/fam'))).toBe(false)
    clean(root)
  })

  test('refuses when the target group path is a symlink', () => {
    const root = repo()
    symlinkSync(join(root, 'skills'), join(root, 'skills/fam'))
    expect(() => createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: 'b', write: true })).toThrow()
    clean(root)
  })

  test('refuses to turn an existing skill directory into a group', () => {
    const root = repo()
    mkdirSync(join(root, 'skills/solo'), { recursive: true })
    writeFileSync(join(root, 'skills/solo/SKILL.md'), '---\nname: solo\ndescription: d\n---\n')
    expect(() => createGroup({ name: 'solo', repoRoot: root, title: 'Solo', blurb: 'b', write: true })).toThrow(/skill already lives there/i)
    clean(root)
  })

  test('the section it writes is the one checkStructure expects', () => {
    const root = repo()
    // Build a complete, valid repo around a group created by the command itself.
    const meta = (dir: string, name: string) => {
      mkdirSync(join(dir, 'agents'), { recursive: true })
      mkdirSync(join(dir, 'refresh'), { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n`)
      writeFileSync(join(dir, 'README.md'), `# ${name}\n`)
      writeFileSync(join(dir, 'agents/openai.yaml'), 'name: x\n')
      writeFileSync(join(dir, 'refresh/REFRESH.md'), '# r\n')
      writeFileSync(join(dir, 'refresh/sources.json'), '{"sources":[]}\n')
    }
    meta(join(root, 'skills/solo'), 'solo')
    createGroup({ name: 'fam', repoRoot: root, title: 'Fam', blurb: 'The blurb.', write: true })
    meta(join(root, 'skills/fam/one'), 'one')
    meta(join(root, 'skills/fam/two'), 'two')
    mkdirSync(join(root, 'packages/cli'), { recursive: true })
    writeFileSync(join(root, 'packages/cli/packaging.json'), JSON.stringify({ solo: ['SKILL.md'], one: ['SKILL.md'], two: ['SKILL.md'] }))
    const body = readFileSync(join(root, 'README.md'), 'utf8')
    writeFileSync(join(root, 'README.md'), body.replace('|---|---|---|\n\nInstall', [
      '|---|---|---|',
      '| [one](skills/fam/one/) | o | [SKILL.md](skills/fam/one/SKILL.md) |',
      '| [two](skills/fam/two/) | t | [SKILL.md](skills/fam/two/SKILL.md) |',
      '', 'Install',
    ].join('\n')))
    expect(checkStructure(root)).toEqual({ blocks: [], warns: [] })
    clean(root)
  })
})
