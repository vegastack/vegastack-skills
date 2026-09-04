import { describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GhUnavailable, ghJson, ghText } from '../src/gh.ts'

// The stub lives in a temp directory rather than under test/fixtures/: every test here rewrites
// it, and a fixture the suite overwrites would leave the working tree dirty on every run.
const stub = join(mkdtempSync(join(tmpdir(), 'vsk-gh-')), 'gh-stub.sh')

function writeStub(body: string): void {
  writeFileSync(stub, body)
  chmodSync(stub, 0o755)
}

const passing = '#!/bin/sh\nif [ "$1" = "boom" ]; then echo "HTTP 403: Forbidden" >&2; exit 1; fi\nprintf \'{"args":"%s"}\' "$*"\n'

describe('ghJson', () => {
  test('passes argv through untouched and parses stdout as JSON', async () => {
    writeStub(passing)
    const out = await ghJson<{ args: string }>(['api', 'user'], { gh: stub })
    expect(out.args).toBe('api user')
  })

  test('a failing gh is GhUnavailable carrying the parsed HTTP status', async () => {
    writeStub(passing)
    await expect(ghJson(['boom'], { gh: stub })).rejects.toBeInstanceOf(GhUnavailable)
    await expect(ghJson(['boom'], { gh: stub })).rejects.toMatchObject({ httpStatus: 403 })
  })

  test('unparseable stdout is GhUnavailable, never an empty result', async () => {
    writeStub('#!/bin/sh\nprintf \'not json\'\n')
    await expect(ghJson(['api', 'user'], { gh: stub })).rejects.toBeInstanceOf(GhUnavailable)
  })

  test('stdin is fed only when input is a string', async () => {
    writeStub('#!/bin/sh\ncat > /dev/null\nprintf \'{"args":"%s"}\' "$*"\n')
    expect((await ghJson<{ args: string }>(['api', 'x'], { gh: stub, input: '{}' })).args).toBe('api x')
  })

  test('a missing gh binary is GhUnavailable with a null status, never a crash', async () => {
    await expect(ghJson(['api', 'user'], { gh: '/nonexistent/gh' })).rejects.toMatchObject({ httpStatus: null })
  })
})

describe('ghText', () => {
  test('returns stdout verbatim, without parsing it', async () => {
    writeStub('#!/bin/sh\nprintf \'plain text\'\n')
    expect(await ghText(['api', 'user'], { gh: stub })).toBe('plain text')
  })
})
