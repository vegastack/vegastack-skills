import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
// Untyped repo-shared validator; bun resolves the .mjs at runtime.
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillDir = resolve(import.meta.dir, '..')
const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
const referenceFiles = readdirSync(join(skillDir, 'references'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => join(skillDir, 'references', name))

const REGISTRY_IDS = ['AGENTSKILLS-SPEC', 'CLAUDE-CODE-SKILLS', 'CODEX-SKILLS', 'HERMES-SKILLS']

function frontmatterKeys(content: string): string[] {
  const match = /^---\n([\s\S]*?)\n---/.exec(content)
  expect(match).not.toBeNull()
  const keys: string[] = []
  for (const line of match![1].split('\n')) {
    const key = /^([A-Za-z0-9-]+):/.exec(line)
    if (key) keys.push(key[1])
  }
  return keys
}

function relativeLinks(content: string): string[] {
  const links: string[] = []
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue // http:, https:, mailto:, ...
    if (target.startsWith('#')) continue
    links.push(target.split('#')[0])
  }
  return links
}

describe('skill-maintainer obeys the standards it teaches', () => {
  test('passes the repo structural validator', () => {
    const result = validateSkill(skillDir)
    expect(result.message).toBe('Skill is valid!')
    expect(result.ok).toBe(true)
  })

  test('SKILL.md stays under 500 lines', () => {
    expect(skillMd.split('\n').length).toBeLessThan(500)
  })

  test('frontmatter contains exactly name and description', () => {
    expect(frontmatterKeys(skillMd).sort()).toEqual(['description', 'name'])
  })

  test('name equals the directory name and description is within limits', () => {
    const name = /^name:\s*(.+)$/m.exec(skillMd)![1].trim()
    expect(name).toBe(basename(skillDir))
    expect(name).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(name.includes('--')).toBe(false)
    expect(name.endsWith('-')).toBe(false)
    expect(name.length).toBeLessThanOrEqual(64)
    const description = /^description:\s*(.+)$/m.exec(skillMd)![1].trim()
    expect(description.length).toBeGreaterThan(0)
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(description).not.toMatch(/[<>]/)
  })

  test('every relative link in SKILL.md and references resolves', () => {
    const documents = [join(skillDir, 'SKILL.md'), ...referenceFiles]
    for (const document of documents) {
      const content = readFileSync(document, 'utf8')
      for (const target of relativeLinks(content)) {
        const resolved = resolve(dirname(document), decodeURI(target))
        expect(existsSync(resolved), `${document} -> ${target}`).toBe(true)
      }
    }
  })

  test('SKILL.md carries no Claude-only body syntax', () => {
    expect(skillMd.includes('${CLAUDE_')).toBe(false)
    expect(skillMd.includes('$ARGUMENTS')).toBe(false)
    expect(skillMd.includes('!`')).toBe(false)
  })

  test('refresh registry parses with exactly the four standards sources', () => {
    const registry = JSON.parse(readFileSync(join(skillDir, 'refresh', 'sources.json'), 'utf8'))
    expect(registry.schemaVersion).toBe(1)
    expect(registry.policy.defaultChecksumScope).toBe('html-text-v1')
    const ids = registry.sources.map((source: { id: string }) => source.id).sort()
    expect(ids).toEqual([...REGISTRY_IDS].sort())
    for (const source of registry.sources) {
      expect(source.thresholdDays).toBe(14)
      expect(source.critical).toBe(true)
      expect(source.topics).toContain('skills-standard')
      expect(source.versionDetection.type).toBe('manual-review')
      expect(typeof source.urls.primary).toBe('string')
      expect(source.affected).toContain('ref:standards')
    }
  })

  test('every source marker maps to a registry ID, and every registry ID is cited', () => {
    const cited = new Set<string>()
    for (const document of referenceFiles) {
      const content = readFileSync(document, 'utf8')
      for (const match of content.matchAll(/<!--\s*source:\s*([A-Za-z0-9-]+)\s*-->/g)) {
        expect(REGISTRY_IDS, `unknown marker ${match[1]} in ${document}`).toContain(match[1])
        cited.add(match[1])
      }
    }
    expect([...cited].sort()).toEqual([...REGISTRY_IDS].sort())
  })
})
