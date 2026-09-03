import { describe, expect, test } from 'bun:test'
import { handleTokenRequest } from '../src/index.ts'
import type { Env } from '../src/env.ts'

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
const appPem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`
const now = 1_800_000_000

async function oidcToken(claims: Record<string, unknown> = {}) {
  const header = { alg: 'RS256', kid: 'k1', typ: 'JWT' }
  const payload = { iss: 'https://token.actions.githubusercontent.com', aud: 'vegastack-factory', exp: now + 300, nbf: now - 10, iat: now - 10, repository: 'acme/widgets', repository_owner: 'acme', ...claims }
  const input = `${b64u(new TextEncoder().encode(JSON.stringify(header)))}.${b64u(new TextEncoder().encode(JSON.stringify(payload)))}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input))
  return `${input}.${b64u(new Uint8Array(sig))}`
}

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    APP_PRIVATE_KEY: { async get() { return appPem } },
    TOKEN_LIMITER: { async limit() { return { success: true } } },
    VEGAFACTORY_APP_ID: '4812956',
    OIDC_AUDIENCE: 'vegastack-factory',
    ...overrides,
  }
}

const jwks = new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
const github = (installation: Response, mint: Response) => (async (url: string) =>
  url.includes('/.well-known/jwks') ? jwks.clone() : url.endsWith('/installation') ? installation.clone() : mint.clone()) as unknown as typeof fetch
const installed = new Response(JSON.stringify({ id: 42 }), { status: 200 })
const cap = { issues: 'write', metadata: 'read', organization_projects: 'write' }
const minted = new Response(JSON.stringify({ token: 'ghs_secret', expires_at: '2026-09-03T12:00:00Z', permissions: cap }), { status: 201 })
const deps = (doFetch: typeof fetch, records: Record<string, unknown>[]) => ({ doFetch, nowSeconds: () => now, log: (r: Record<string, unknown>) => { records.push(r) } })
const never = (async () => { throw new Error('no call expected') }) as unknown as typeof fetch
const post = async (token?: string) => new Request('https://factory-token.vegastack.com/token', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} })

describe('routing', () => {
  test('answers only POST /token and GET /health', async () => {
    const records: Record<string, unknown>[] = []
    expect((await handleTokenRequest(new Request('https://factory-token.vegastack.com/token'), envWith(), deps(never, records))).status).toBe(405)
    // `never` is safe here: routing and the 401 paths are decided before any subrequest
    expect((await handleTokenRequest(new Request('https://factory-token.vegastack.com/', { method: 'POST' }), envWith(), deps(never, records))).status).toBe(404)
  })

  test('GET /health is unauthenticated, reads no credential, and is not audited', async () => {
    const records: Record<string, unknown>[] = []
    const response = await handleTokenRequest(new Request('https://factory-token.vegastack.com/health'), envWith(), deps(never, records))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(records).toHaveLength(0)
  })
})

describe('the happy path', () => {
  test('mints a one-repository token and audits the grant without the credential', async () => {
    const records: Record<string, unknown>[] = []
    const response = await handleTokenRequest(await post(await oidcToken()), envWith(), deps(github(installed, minted), records))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ token: 'ghs_secret', expires_at: '2026-09-03T12:00:00Z', repository: 'acme/widgets', permissions: cap })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ event: 'token_request', decision: 'granted', repository: 'acme/widgets', owner: 'acme', installation_id: 42, status: 200 })
    expect(JSON.stringify(records)).not.toContain('ghs_')
  })
})

describe('the refusals', () => {
  test('401s a missing or unusable bearer token and audits the denial without the credential', async () => {
    const records: Record<string, unknown>[] = []
    expect((await handleTokenRequest(await post(), envWith(), deps(never, records))).status).toBe(401)
    const response = await handleTokenRequest(await post('a.b.c'), envWith(), deps(never, records))
    expect(response.status).toBe(401)
    expect(records.at(-1)).toMatchObject({ event: 'token_request', decision: 'denied' })
    expect(JSON.stringify(records)).not.toContain('a.b.c')
  })

  test('429s over the rate limit and 503s when the limiter is unavailable', async () => {
    const records: Record<string, unknown>[] = []
    const denied = await handleTokenRequest(await post(await oidcToken()), envWith({ TOKEN_LIMITER: { async limit() { return { success: false } } } }), deps(github(installed, minted), records))
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('60')
    const down = await handleTokenRequest(await post(await oidcToken()), envWith({ TOKEN_LIMITER: { async limit() { throw new Error('down') } } }), deps(github(installed, minted), records))
    expect(down.status).toBe(503)
  })

  test('403s a repository the App is not installed on and 502s an upstream failure', async () => {
    const records: Record<string, unknown>[] = []
    const notInstalled = github(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }), minted)
    expect((await handleTokenRequest(await post(await oidcToken()), envWith(), deps(notInstalled, records))).status).toBe(403)
    const upstream = github(new Response('{}', { status: 500 }), minted)
    expect((await handleTokenRequest(await post(await oidcToken()), envWith(), deps(upstream, records))).status).toBe(502)
    expect(records.at(-1)).toMatchObject({ decision: 'denied' })
  })

  test('500s a widened permission echo and never returns or logs the token', async () => {
    const records: Record<string, unknown>[] = []
    const wide = new Response(JSON.stringify({ token: 'ghs_secret', expires_at: '2026-09-03T12:00:00Z', permissions: { ...cap, contents: 'write' } }), { status: 201 })
    const response = await handleTokenRequest(await post(await oidcToken()), envWith(), deps(github(installed, wide), records))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('ghs_')
    expect(JSON.stringify(records)).not.toContain('ghs_')
  })
})
