import { describe, expect, test } from 'bun:test'
import { ALLOWED_HOSTS, EgressRefused, allowedFetch } from '../src/egress.ts'

describe('allowedFetch', () => {
  const seen: RequestInit[] = []
  const stub = (async (_url: string, init: RequestInit) => { seen.push(init); return new Response('{}') }) as unknown as typeof fetch

  test('allows exactly the two GitHub hosts and never follows a redirect', async () => {
    expect([...ALLOWED_HOSTS]).toEqual(['api.github.com', 'token.actions.githubusercontent.com'])
    await allowedFetch('https://api.github.com/app', { method: 'GET' }, stub)
    await allowedFetch('https://token.actions.githubusercontent.com/.well-known/jwks', {}, stub)
    expect(seen).toHaveLength(2)
    for (const init of seen) expect(init.redirect).toBe('error')
  })

  test('refuses a lookalike host, an unrelated host, plain http, and a non-URL', async () => {
    for (const url of ['https://api.github.com.evil.test/x', 'https://evil.test/x', 'http://api.github.com/x', 'not a url']) {
      await expect(allowedFetch(url, {}, stub)).rejects.toBeInstanceOf(EgressRefused)
    }
    expect(seen).toHaveLength(2)
  })
})
