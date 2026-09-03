import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Person {
  login: string
  name: string
  role: string
  slack: string
  timezone: string
  groups: string[]
}

const HEADER = 'login,name,role,slack,timezone,groups'

// One header, exactly. A people.csv with any other shape returns no people rather than guessing
// which column is the login — and a people view with no rows is a visibly empty page, while a
// mis-parsed one would quietly attribute a person's runs to the wrong name.
export function parsePeopleCsv(text: string): Person[] {
  const lines = (text ?? '').split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line.trim() !== '')
  const header = lines.shift()
  if (!header || header.trim() !== HEADER) return []
  const people: Person[] = []
  for (const line of lines) {
    const cells = line.split(',').map((cell) => cell.trim())
    const login = cells[0]
    if (!login) continue
    people.push({
      login,
      name: cells[1] ?? '',
      role: cells[2] ?? '',
      slack: cells[3] ?? '',
      timezone: cells[4] ?? '',
      groups: (cells[5] ?? '').split(/[;|]/).map((g) => g.trim()).filter(Boolean),
    })
  }
  return people
}

// Layered the way CLAUDE.md and AGENTS.md layer: the nearer file wins. A group row replaces the
// org row for the same login outright rather than merging field by field, so a group can demote
// as well as promote — a half-merged person would be neither file's answer.
export function mergePeople(org: Person[], group: Person[]): Person[] {
  const merged = new Map(org.map((person) => [person.login, person]))
  for (const person of group) merged.set(person.login, person)
  return [...merged.values()]
}

const readOrEmpty = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export async function readPeople(controlRoom: string, group: string | null): Promise<Person[]> {
  const org = parsePeopleCsv(await readOrEmpty(join(controlRoom, 'people.csv')))
  if (!group) return org
  return mergePeople(org, parsePeopleCsv(await readOrEmpty(join(controlRoom, 'groups', group, 'people.csv'))))
}

export interface Gate {
  allowed: boolean
  reason: string | null
}

const REFUSAL = 'people-level stats are visible to the person themselves and to a lead'

// The privacy rule #112 recorded, in one function. Own row always; anyone else's needs both the
// org's `stats-people: on` and a viewer whose people.csv role is `lead`. An unknown viewer — no
// VEGAFACTORY_VIEWER, so no `gh` login — is nobody, and sees nobody.
export function canViewPerson(input: {
  viewer: string | null
  subject: string
  people: Person[]
  statsPeople: 'on' | 'off'
}): Gate {
  if (!input.viewer) return { allowed: false, reason: REFUSAL }
  if (input.viewer === input.subject) return { allowed: true, reason: null }
  if (input.statsPeople !== 'on') return { allowed: false, reason: REFUSAL }
  const role = input.people.find((person) => person.login === input.viewer)?.role
  if (role !== 'lead') return { allowed: false, reason: REFUSAL }
  return { allowed: true, reason: null }
}
