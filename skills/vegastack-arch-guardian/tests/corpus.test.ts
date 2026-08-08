import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

const repo = resolve(import.meta.dir, '../../..')

describe('normative skill corpus', () => {
  test('validates lean references, rules, citations, tables, and Mermaid', () => {
    const run = Bun.spawnSync(['bun', 'skills/vegastack-arch-guardian/scripts/verify-corpus.mjs'], { cwd: repo })
    expect(run.exitCode).toBe(0)
    expect(run.stdout.toString()).toContain('18 normative references')
    expect(run.stdout.toString()).toContain('Mermaid mode=formal')
  })
})
