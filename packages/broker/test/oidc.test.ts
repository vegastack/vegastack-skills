import { describe, expect, test } from 'bun:test'
import { TokenRejected, verifyOidcToken } from '../src/oidc.ts'

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] as unknown as JsonWebKey[] }

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1', typ: 'JWT' }) {
  const input = `${b64u(new TextEncoder().encode(JSON.stringify(header)))}.${b64u(new TextEncoder().encode(JSON.stringify(payload)))}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input))
  return `${input}.${b64u(new Uint8Array(sig))}`
}
const now = 1_800_000_000
const good = { iss: 'https://token.actions.githubusercontent.com', aud: 'vegastack-factory', exp: now + 300, nbf: now - 10, iat: now - 10, repository: 'acme/widgets', repository_owner: 'acme' }

describe('verifyOidcToken', () => {
  test('accepts a well-formed token and splits the repository claim', async () => {
    const claims = await verifyOidcToken(await sign(good), { jwks, audience: 'vegastack-factory', nowSeconds: now })
    expect(claims).toEqual({ repository: 'acme/widgets', repositoryOwner: 'acme', repositoryName: 'widgets' })
  })

  test('rejects each broken claim with its own reason', async () => {
    const cases: [string, Record<string, unknown>][] = [
      ['issuer', { ...good, iss: 'https://evil.test' }],
      ['audience', { ...good, aud: 'someone-else' }],
      ['expired', { ...good, exp: now - 120 }],
      ['not_yet_valid', { ...good, nbf: now + 120 }],
      ['claims', { ...good, repository: 'other/widgets' }],
      ['claims', { ...good, repository_owner: undefined }],
    ]
    for (const [reason, payload] of cases) {
      const error = await verifyOidcToken(await sign(payload), { jwks, audience: 'vegastack-factory', nowSeconds: now }).catch((e) => e)
      expect(error).toBeInstanceOf(TokenRejected)
      expect((error as TokenRejected).reason).toBe(reason)
    }
  })

  test('rejects alg none, an unknown kid, a tampered signature, and a malformed token', async () => {
    const alg = await verifyOidcToken(await sign(good, { alg: 'none', kid: 'k1' }), { jwks, audience: 'vegastack-factory', nowSeconds: now }).catch((e) => e)
    expect((alg as TokenRejected).reason).toBe('alg')
    const kid = await verifyOidcToken(await sign(good, { alg: 'RS256', kid: 'nope' }), { jwks, audience: 'vegastack-factory', nowSeconds: now }).catch((e) => e)
    expect((kid as TokenRejected).reason).toBe('kid')
    const signed = await sign(good)
    const tampered = `${signed.slice(0, -4)}AAAA`
    const bad = await verifyOidcToken(tampered, { jwks, audience: 'vegastack-factory', nowSeconds: now }).catch((e) => e)
    expect((bad as TokenRejected).reason).toBe('signature')
    const junk = await verifyOidcToken('a.b', { jwks, audience: 'vegastack-factory', nowSeconds: now }).catch((e) => e)
    expect((junk as TokenRejected).reason).toBe('malformed')
  })
})
