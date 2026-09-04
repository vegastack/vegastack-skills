import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dir, '../assets/workflows/implement-children.js'), 'utf8')

describe('the implement-children workflow asset', () => {
  test('it parses as a module and opens with a pure-literal meta', () => {
    expect(() => new Bun.Transpiler({ loader: 'js' }).scan(source)).not.toThrow()
    expect(source.startsWith('export const meta = {')).toBe(true)
    expect(source).toContain("name: 'implement-children'")
    expect(source).toContain("title: 'Build children'")
  })
  test('it pipelines one isolated agent per child and returns the join contract', () => {
    expect(source).toMatch(/pipeline\(\s*args\.children/)
    expect(source).toContain("isolation: 'worktree'")
    expect(source).toContain('schema: CHILD_RESULT')
    for (const field of ['issue', 'status', 'branch', 'head', 'files', 'message']) expect(source).toContain(field)
  })
  test('it uses nothing a workflow script cannot have', () => {
    expect(source).not.toMatch(/require\(|from '(node:|fs|path)|Date\.now\(|new Date\(|Math\.random\(/)
  })
})
