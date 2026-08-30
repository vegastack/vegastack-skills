import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
// Untyped repo-shared validator; bun resolves the .mjs at runtime.
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillDir = resolve(import.meta.dir, '..')
const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')

function relativeLinks(content: string): string[] {
  const links: string[] = []
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s#]+)[^)]*\)/g)) {
    const target = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue // http:, https:, mailto:, ...
    links.push(target)
  }
  return links
}

describe('dev-architect skill contract', () => {
  test('SKILL.md passes the repo validator', () => {
    const { ok, message } = validateSkill(skillDir)
    expect(message).toBe('Skill is valid!')
    expect(ok).toBe(true)
  })

  test('SKILL.md stays within the lean budget', () => {
    const body = skillMd.replace(/^---\n[\s\S]*?\n---/, '')
    expect(body.split('\n').length).toBeLessThan(150)
  })

  test('references stay under the total line budget', () => {
    // Ratchet, not target: the 2026-08 rebuild landed ~800 lines (from 1,016).
    // Headroom allows refresh PRs to grow pinned-facts without breaking CI.
    let total = 0
    for (const name of readdirSync(join(skillDir, 'references'))) {
      total += readFileSync(join(skillDir, 'references', name), 'utf8').split('\n').length
    }
    expect(total).toBeLessThan(850)
  })

  test('every relative link in SKILL.md resolves to a real file', () => {
    for (const link of relativeLinks(skillMd)) {
      expect(existsSync(join(skillDir, link))).toBe(true)
    }
  })

  test('every reference file is routed from SKILL.md', () => {
    const routed = new Set(relativeLinks(skillMd).filter((l) => l.startsWith('references/')))
    for (const name of readdirSync(join(skillDir, 'references'))) {
      expect(routed.has(`references/${name}`)).toBe(true)
    }
  })

  test('reference cross-links resolve', () => {
    for (const name of readdirSync(join(skillDir, 'references'))) {
      const content = readFileSync(join(skillDir, 'references', name), 'utf8')
      for (const link of relativeLinks(content)) {
        expect(existsSync(resolve(join(skillDir, 'references'), link))).toBe(true)
      }
      // Plain-text mentions like "(see security.md)" must also point at real files.
      // dev.md and decisions.md live in the consuming project (.vegastack/), not here.
      const external = new Set(['dev.md', 'decisions.md'])
      for (const match of content.matchAll(/\b([a-z-]+\.md)\b/g)) {
        const target = match[1]
        if (target === name || external.has(target)) continue
        expect(existsSync(join(skillDir, 'references', target)) || existsSync(join(skillDir, target))).toBe(true)
      }
    }
  })

  test('trigger query fixture is well-formed with near-miss negatives', () => {
    const fixture = JSON.parse(
      readFileSync(join(skillDir, 'tests', 'fixtures', 'trigger-queries.json'), 'utf8'),
    )
    expect(Array.isArray(fixture)).toBe(true)
    expect(fixture.length).toBeGreaterThanOrEqual(10)
    expect(fixture.some((q: { should_trigger: boolean }) => q.should_trigger)).toBe(true)
    expect(fixture.some((q: { should_trigger: boolean }) => !q.should_trigger)).toBe(true)
    for (const entry of fixture) {
      expect(typeof entry.query).toBe('string')
      expect(typeof entry.should_trigger).toBe('boolean')
    }
  })

  test('refresh registry parses and affected paths exist', () => {
    const registry = JSON.parse(readFileSync(join(skillDir, 'refresh', 'sources.json'), 'utf8'))
    expect(registry.schemaVersion).toBe(1)
    expect(registry.sources.length).toBeGreaterThan(0)
    for (const source of registry.sources) {
      expect(source.id).toMatch(/^[A-Z0-9-]+$/)
      expect(source.urls.primary).toMatch(/^https:\/\//)
      for (const affected of source.affected) {
        expect(existsSync(join(skillDir, affected))).toBe(true)
      }
    }
  })

  test('pinned facts carry verification dates and sources', () => {
    const facts = readFileSync(join(skillDir, 'references', 'pinned-facts.md'), 'utf8')
    expect(facts).toMatch(/verified 2026-/)
    expect(facts.match(/\[[a-z0-9.-]+\.[a-z]+/gi)?.length ?? 0).toBeGreaterThan(5)
  })
})
