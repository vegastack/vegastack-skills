// The rate-limit binding wrapper, and an honest description of what the binding is.
//
// Two documented properties of Cloudflare's GA rate-limiting binding (verified against the Workers
// rate-limiting docs on 03-09-2026) shape everything here:
//   1. the counter is local to the Cloudflare location the Worker runs in, not global; and
//   2. `simple.period` accepts only 10 or 60 seconds.
// So this is an abuse brake sized in requests per minute per repository, never an authorization
// decision — authorization is the OIDC claims and the installation lookup, both of which run
// regardless of what the limiter says. What the brake does guarantee is that one repository cannot
// pour requests through a single location unbounded.
//
// It fails closed: an unavailable limiter is an error the handler turns into 503, never a grant.

import type { RateLimiter } from './env.ts'

export class RateLimiterUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimiterUnavailable'
  }
}

export function rateKey(owner: string, repo: string): string {
  return `${owner}/${repo}`
}

export async function checkRate(limiter: RateLimiter, key: string): Promise<boolean> {
  let verdict: { success: boolean }
  try {
    verdict = await limiter.limit({ key })
  } catch (error) {
    throw new RateLimiterUnavailable(`the rate limiter is unavailable: ${(error as Error).name}`)
  }
  if (typeof verdict?.success !== 'boolean') throw new RateLimiterUnavailable('the rate limiter returned no verdict')
  return verdict.success
}
