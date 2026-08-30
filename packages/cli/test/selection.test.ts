import { describe, expect, test } from 'bun:test'
import { selectSkills, type SkillEntry } from '../src/selection.ts'

// A catalog shaped like the real manifest: a grouped family, and a repo-only skill in its own
// group. `--all` is the only selector that filters; a name and a group never do.
const catalog: SkillEntry[] = [
  { name: 'dev-plan', group: 'dev-skills', repoOnly: false },
  { name: 'dev-ship', group: 'dev-skills', repoOnly: false },
  { name: 'skillify', group: 'repo-tooling', repoOnly: true },
]

describe('selectSkills', () => {
  test('a bare skill name selects exactly that skill', () => {
    expect(selectSkills({ skill: 'dev-plan' }, catalog)).toEqual(['dev-plan'])
  })

  test('--group selects every member, sorted, and nothing else', () => {
    expect(selectSkills({ group: 'dev-skills' }, catalog)).toEqual(['dev-plan', 'dev-ship'])
  })

  test('--all skips repo-only skills', () => {
    expect(selectSkills({ all: true }, catalog)).toEqual(['dev-plan', 'dev-ship'])
  })

  test('a repo-only skill is still installable by name and by its group', () => {
    // The marker excludes from a convenience selector; it is never a refusal.
    expect(selectSkills({ skill: 'skillify' }, catalog)).toEqual(['skillify'])
    expect(selectSkills({ group: 'repo-tooling' }, catalog)).toEqual(['skillify'])
  })

  test('no selector at all is an error naming what is available', () => {
    expect(() => selectSkills({}, catalog)).toThrow(/dev-plan/)
  })

  test('two selectors at once is an error naming the conflict', () => {
    expect(() => selectSkills({ skill: 'dev-plan', group: 'dev-skills' }, catalog)).toThrow(/one of/i)
    expect(() => selectSkills({ skill: 'dev-plan', all: true }, catalog)).toThrow(/one of/i)
    expect(() => selectSkills({ group: 'dev-skills', all: true }, catalog)).toThrow(/one of/i)
  })

  test('an unknown skill lists the bundled skills; an unknown group lists the groups', () => {
    expect(() => selectSkills({ skill: 'ghost' }, catalog)).toThrow(/skillify/)
    const unknownGroup = () => selectSkills({ group: 'ghost' }, catalog)
    expect(unknownGroup).toThrow(/dev-skills/)
    expect(unknownGroup).toThrow(/repo-tooling/)
  })

  test('a group with no members is unknown, not a silent empty install', () => {
    expect(() => selectSkills({ group: 'dev-skills' }, [{ name: 'x', group: null, repoOnly: false }]))
      .toThrow(/unknown group/i)
  })

  test('an all-repo-only catalog leaves --all with nothing, and says so', () => {
    const onlyMeta: SkillEntry[] = [{ name: 'skillify', group: 'repo-tooling', repoOnly: true }]
    expect(() => selectSkills({ all: true }, onlyMeta)).toThrow(/repo-only/i)
  })

  test('the result is sorted and free of duplicates regardless of catalog order', () => {
    const shuffled: SkillEntry[] = [
      { name: 'dev-ship', group: 'dev-skills', repoOnly: false },
      { name: 'dev-plan', group: 'dev-skills', repoOnly: false },
    ]
    expect(selectSkills({ group: 'dev-skills' }, shuffled)).toEqual(['dev-plan', 'dev-ship'])
  })
})
