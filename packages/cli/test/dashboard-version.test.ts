import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('the CLI and the dashboard ship one version, so the first-use fetch always resolves', () => {
  const read = (p: string) => JSON.parse(readFileSync(join(import.meta.dirname, '..', p), 'utf8')).version
  expect(read('../dashboard/package.json')).toBe(read('package.json'))
})
