import { describe, expect, test } from 'bun:test'
import { CAPPED_PERMISSIONS, PermissionCapViolation, UpstreamFailure, mintRepoToken, permissionsMatchCap } from '../src/github.ts'

const cap = { issues: 'write', metadata: 'read', organization_projects: 'write' }

describe('permissionsMatchCap', () => {
  test('accepts exactly the cap and rejects every deviation', () => {
    expect(CAPPED_PERMISSIONS).toEqual(cap)
    expect(permissionsMatchCap({ ...cap })).toBe(true)
    expect(permissionsMatchCap({ ...cap, contents: 'write' })).toBe(false)
    expect(permissionsMatchCap({ ...cap, issues: 'read' })).toBe(false)
    expect(permissionsMatchCap({ issues: 'write', metadata: 'read' })).toBe(false)
    expect(permissionsMatchCap(null)).toBe(false)
    expect(permissionsMatchCap('write')).toBe(false)
  })
})

describe('mintRepoToken', () => {
  test('asks for one repository and the capped permissions, and returns the echo', async () => {
    let body: Record<string, unknown> = {}
    let seen = ''
    const spy = (async (url: string, init: RequestInit) => {
      seen = url
      body = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ token: 'ghs_secret', expires_at: '2026-09-03T12:00:00Z', permissions: cap }), { status: 201 })
    }) as unknown as typeof fetch
    const minted = await mintRepoToken({ installationId: 42, repo: 'widgets', jwt: 'jwt', doFetch: spy })
    expect(seen).toBe('https://api.github.com/app/installations/42/access_tokens')
    expect(body).toEqual({ repositories: ['widgets'], permissions: cap })
    expect(minted).toEqual({ token: 'ghs_secret', expiresAt: '2026-09-03T12:00:00Z', permissions: cap })
  })

  test('refuses a widened echo without leaking the token, and maps a failed mint to UpstreamFailure', async () => {
    const wide = (async () => new Response(JSON.stringify({ token: 'ghs_secret', expires_at: '2026-09-03T12:00:00Z', permissions: { ...cap, contents: 'write' } }), { status: 201 })) as unknown as typeof fetch
    const error = await mintRepoToken({ installationId: 42, repo: 'widgets', jwt: 'jwt', doFetch: wide }).catch((e) => e)
    expect(error).toBeInstanceOf(PermissionCapViolation)
    expect((error as Error).message).not.toContain('ghs_secret')
    const refused = (async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })) as unknown as typeof fetch
    await expect(mintRepoToken({ installationId: 42, repo: 'widgets', jwt: 'jwt', doFetch: refused })).rejects.toBeInstanceOf(UpstreamFailure)
  })
})
