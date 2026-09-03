import { describe, expect, test } from 'bun:test'
import { RateLimiterUnavailable, checkRate, rateKey } from '../src/ratelimit.ts'
import type { RateLimiter } from '../src/env.ts'

const limiterReturning = (success: boolean, seen: string[]): RateLimiter => ({
  async limit({ key }) { seen.push(key); return { success } },
})

describe('checkRate', () => {
  test('keys the limiter by owner and repository and passes the binding verdict through', async () => {
    const seen: string[] = []
    expect(rateKey('acme', 'widgets')).toBe('acme/widgets')
    expect(await checkRate(limiterReturning(true, seen), rateKey('acme', 'widgets'))).toBe(true)
    expect(await checkRate(limiterReturning(false, seen), rateKey('acme', 'other'))).toBe(false)
    expect(seen).toEqual(['acme/widgets', 'acme/other'])
  })

  test('fails closed when the binding throws or answers with a non-boolean', async () => {
    const broken: RateLimiter = { async limit() { throw new Error('binding down') } }
    await expect(checkRate(broken, 'acme/widgets')).rejects.toBeInstanceOf(RateLimiterUnavailable)
    const junk = { async limit() { return {} } } as unknown as RateLimiter
    await expect(checkRate(junk, 'acme/widgets')).rejects.toBeInstanceOf(RateLimiterUnavailable)
  })
})
