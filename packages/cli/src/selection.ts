// Which skills does a set of flags mean?
//
// Kept in its own module, deliberately free of side effects: index.ts calls main() at load, so
// anything exported from there cannot be imported by a test without running the CLI.
//
// Two independent axes, and they must stay independent:
//   group    — where a skill is authored (skills/<group>/<name>/). A selection concept only:
//              the packaged bundle is flat, so an install path never carries a group.
//   repoOnly — who should install it. skill-maintainer and skillify operate ON this monorepo
//              and do nothing useful elsewhere, so `--all` skips them. Naming one explicitly,
//              or selecting its group, still installs it: this is an exclusion from a
//              convenience selector, never a refusal.

export type SkillEntry = { name: string; group: string | null; repoOnly: boolean }

export type Selector = { skill?: string; group?: string; all?: boolean }

const sorted = (names: string[]) => [...new Set(names)].sort()

function groupsIn(catalog: SkillEntry[]): string[] {
  return sorted(catalog.map(entry => entry.group).filter((group): group is string => group !== null))
}

export function selectSkills(selector: Selector, catalog: SkillEntry[], verb = 'install'): string[] {
  const chosen = [
    selector.skill ? 'a skill name' : null,
    selector.group ? '--group' : null,
    selector.all ? '--all' : null,
  ].filter(Boolean) as string[]

  if (chosen.length > 1) {
    throw new Error(`Use only one of ${chosen.join(', ')} — they select different things and are not combined`)
  }

  if (selector.all) {
    const installable = sorted(catalog.filter(entry => !entry.repoOnly).map(entry => entry.name))
    if (!installable.length) {
      throw new Error('Nothing to install: every bundled skill is repo-only. Name one explicitly, or use --group, to install it anyway.')
    }
    return installable
  }

  if (selector.group) {
    const members = sorted(catalog.filter(entry => entry.group === selector.group).map(entry => entry.name))
    if (!members.length) {
      const groups = groupsIn(catalog)
      throw new Error(`Unknown group: ${selector.group}. Available groups: ${groups.length ? groups.join(', ') : '(none)'}`)
    }
    return members
  }

  if (selector.skill) {
    if (!catalog.some(entry => entry.name === selector.skill)) {
      throw new Error(`Unknown skill: ${selector.skill}. Bundled skills: ${sorted(catalog.map(entry => entry.name)).join(', ')}`)
    }
    return [selector.skill]
  }

  const groups = groupsIn(catalog)
  throw new Error(
    `Specify what to ${verb}: a skill name (${sorted(catalog.map(entry => entry.name)).join(', ')})` +
    `${groups.length ? `, --group (${groups.join(', ')})` : ''}, or --all`,
  )
}
