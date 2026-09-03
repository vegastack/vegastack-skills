import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { discoverSkills } from '../scripts/lib/skills.mjs'

// validate-skill.mjs resolves a skill's relative markdown links against its own authored
// directory, which says nothing about a shared reference packaged into another skill: a link
// that resolves in dev-setup's tree is dead in dev-intake's installed copy when the target is not
// packaged there too. This walks every packaged markdown file per consumer and resolves its
// relative links against that consumer's packaged file set.
const repoRoot = resolve(import.meta.dir, '../../..')
const packaging = JSON.parse(readFileSync(join(repoRoot, 'packages/cli/packaging.json'), 'utf8')) as Record<string, string[]>
const skillDirs = new Map<string, string>()
for (const [name, skill] of discoverSkills(join(repoRoot, 'skills')) as Map<string, { path: string }>) skillDirs.set(name, skill.path)

function sourceOf(skill: string, entry: string): { rel: string; path: string } {
  const at = entry.indexOf('@')
  const rel = at === -1 ? entry : entry.slice(0, at)
  const owner = at === -1 ? skill : entry.slice(at + 1)
  return { rel, path: join(skillDirs.get(owner)!, rel) }
}

describe('packaged markdown links resolve inside the consumer bundle', () => {
  for (const [skill, entries] of Object.entries(packaging)) {
    test(`${skill}: every relative link in a packaged .md targets a file packaged into ${skill}`, () => {
      const shipped = new Set(entries.map((entry) => sourceOf(skill, entry).rel))
      const dead: string[] = []
      for (const entry of entries) {
        const { rel, path } = sourceOf(skill, entry)
        if (!rel.endsWith('.md') || !existsSync(path)) continue
        const text = readFileSync(path, 'utf8')
        for (const match of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
          const target = match[1]!
          if (/^[a-z]+:/i.test(target) || target.startsWith('/')) continue
          const resolved = posix.normalize(posix.join(dirname(rel), target))
          if (!shipped.has(resolved)) dead.push(`${entry} → ${target} (${resolved} is not packaged into ${skill})`)
        }
      }
      expect(dead).toEqual([])
    })
  }
})
