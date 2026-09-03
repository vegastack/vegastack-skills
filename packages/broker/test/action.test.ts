import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const body = readFileSync(resolve(import.meta.dir, '../action/action.yml'), 'utf8')

describe('factory-token composite action', () => {
  test('declares the contract the broker actually serves', () => {
    expect(body).toContain('using: composite')
    expect(body).toContain('https://factory-token.vegastack.com/token')
    expect(body).toContain('vegastack-factory')
    expect(body).toContain('core.getIDToken')
    expect(body).toContain('::add-mask::')
  })

  test('never writes the token to a log or to an unmasked output', () => {
    expect(body).not.toMatch(/echo\s+.*\$\{?TOKEN/)
    expect(body).not.toContain('set -x')
    expect(body).toMatch(/id-token/)
  })
})
