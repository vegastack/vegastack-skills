// The one home for "where do authored skills live". The build (sync-skill.mjs), the skill
// validator (validate-skill.mjs), and the structure checker (structure.mjs) all read the layout
// from here, so the rule cannot drift between three implementations.
//
// Two layouts are legal and equal in standing:
//   skills/<name>/            an ungrouped skill
//   skills/<group>/<name>/    a skill in a group, with skills/<group>/GROUP.md beside it
//
// Anything deeper raises. Only invariants that would corrupt the flat bundle raise here —
// illegal depth, duplicate skill names, a group name that also names a skill, an ungrammatical
// group name. Documentation-level rules (GROUP.md shape, README rows, per-skill meta files)
// belong to structure.mjs, which reports them without breaking the build.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Synchronous on purpose: validate-skill.mjs exposes a sync validateSkill() that twelve skill
// test files import, and mixing an async discovery into it would ripple through all of them.

const MAX_NAME_LENGTH = 64

// The grammar shared by skill names and group names. Intersection of the agentskills.io spec and
// every target harness: a leading lowercase letter, then lowercase letters, digits, and hyphens,
// no leading/trailing hyphen, no consecutive hyphens.
export function nameError(name) {
  if (typeof name !== 'string' || name.length === 0) return 'a name is required'
  if (name.length > MAX_NAME_LENGTH) return `name is ${name.length} characters; the maximum is ${MAX_NAME_LENGTH}`
  if (!/^[a-z]/.test(name)) return 'name must start with a lowercase letter'
  if (!/^[a-z0-9-]+$/.test(name)) return 'name may contain only lowercase letters, digits, and hyphens'
  if (name.includes('--')) return 'name must not contain consecutive hyphens'
  if (name.endsWith('-')) return 'name must not end with a hyphen'
  return null
}

const isSkillDir = (path) => existsSync(join(path, 'SKILL.md'))

// Dot-directories are never skills or groups: they are tool leftovers (a crashed scaffolder's
// `.<name>.scaffold-XXXX` staging directory) or VCS/editor state. Treating one as a group made
// every repo command fail with "Invalid group name" until it was found and deleted by hand.
function childDirectories(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

// Every directory under skills/ is either a skill (it holds SKILL.md) or a group (it does not).
// A group's children must all be skills; a SKILL.md below that depth is a layout error.
function assertNoDeeperSkill(groupPath, groupName) {
  for (const child of childDirectories(groupPath)) {
    const path = join(groupPath, child)
    if (isSkillDir(path)) continue
    for (const grandchild of childDirectories(path)) {
      if (isSkillDir(join(path, grandchild))) {
        throw new Error(`Skill nested too deep: skills/${groupName}/${child}/${grandchild} — only skills/<name>/ and skills/<group>/<name>/ are legal`)
      }
    }
    throw new Error(`Not a skill and not a legal group child: skills/${groupName}/${child} — a group directory holds only skills and its GROUP.md`)
  }
}

export function discoverSkills(skillsRoot) {
  const found = new Map()
  const groupNames = []

  const add = (name, path, group) => {
    const existing = found.get(name)
    if (existing) {
      throw new Error(`Duplicate authored skill name "${name}": ${existing.path} and ${path} — the packaged bundle is flat, so two skills may never share a name`)
    }
    found.set(name, { name, path, group })
  }

  for (const entry of childDirectories(skillsRoot)) {
    const path = join(skillsRoot, entry)
    if (isSkillDir(path)) {
      add(entry, path, null)
      continue
    }
    const invalid = nameError(entry)
    if (invalid) throw new Error(`Invalid group name "${entry}": ${invalid}`)
    groupNames.push(entry)
    assertNoDeeperSkill(path, entry)
    for (const child of childDirectories(path)) add(child, join(path, child), entry)
  }

  // A group named like a skill makes every path-shaped reference ambiguous — README rows,
  // packaging keys, and prose all stop being able to say which one they mean.
  for (const group of groupNames) {
    if (found.has(group)) {
      throw new Error(`Group name "${group}" also names a skill at ${found.get(group).path} — group and skill names share one namespace`)
    }
  }

  return found
}

export function discoverGroups(skillsRoot) {
  const groups = new Map()
  for (const entry of childDirectories(skillsRoot)) {
    const path = join(skillsRoot, entry)
    if (isSkillDir(path)) continue
    groups.set(entry, { name: entry, path })
  }
  return groups
}

// GROUP.md is the group's contract: an H1 that is its display name, then one non-empty blurb
// line. Both feed the root README section, so a malformed file returns null rather than a
// half-parsed shape the README would silently inherit.
export function readGroupDoc(groupPath) {
  const path = join(groupPath, 'GROUP.md')
  if (!existsSync(path) || !statSync(path).isFile()) return null
  const lines = readFileSync(path, 'utf8').split('\n')
  const headingIndex = lines.findIndex((line) => /^#\s+\S/.test(line))
  if (headingIndex === -1) return null
  const title = lines[headingIndex].replace(/^#\s+/, '').trim()
  const blurb = lines.slice(headingIndex + 1).find((line) => line.trim() !== '')?.trim()
  if (!title || !blurb || blurb.startsWith('#')) return null
  return { title, blurb }
}

