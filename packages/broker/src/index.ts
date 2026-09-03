// The Worker itself: one route that mints, one route that answers a probe, and nothing else.
//
// Tenancy lives in a single fact — the repository a caller receives a token for comes from the
// verified OIDC `repository` and `repository_owner` claims and from nothing the caller sends. There
// is no request body, no repository parameter, and no way for one org's workflow to name another
// org's repository.
//
// Every failure is closed: an unverifiable token is 401, a spent rate limit is 429, an unavailable
// limiter is 503 (never a grant), an uninstalled repository is 403, an upstream GitHub failure is
// 502, and a token that comes back wider than the cap is 500 with the token discarded. One audit
// record per request carries the decision and never a credential.

import type { Env } from './env.ts'
import { readSecret } from './env.ts'
import { TokenRejected, loadJwks, parseJwtHeader, verifyOidcToken } from './oidc.ts'
import { AppKeyRejected, NotInstalled, UpstreamFailure, appJwt, findInstallationId, importAppKey } from './github.ts'
import { PermissionCapViolation, mintRepoToken } from './github.ts'
import { RateLimiterUnavailable, checkRate, rateKey } from './ratelimit.ts'

export interface Deps {
  doFetch: typeof fetch
  nowSeconds: () => number
  log: (record: Record<string, unknown>) => void
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } })
}

export async function handleTokenRequest(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url)

  // The probe runs before any credential is read: it exercises the Worker and nothing else, so an
  // uptime check never touches the App key, the limiter, or GitHub, and is never audited.
  if (url.pathname === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' })
    }
    return json({ status: 'ok' }, 200)
  }

  const audit = {
    event: 'token_request',
    decision: 'denied' as 'granted' | 'denied',
    reason: 'unknown',
    repository: null as string | null,
    owner: null as string | null,
    installation_id: null as number | null,
    status: 500,
    ts: new Date(deps.nowSeconds() * 1000).toISOString(),
  }
  const settle = (status: number, reason: string, body: unknown, extraHeaders: Record<string, string> = {}): Response => {
    audit.status = status
    audit.reason = reason
    audit.decision = status === 200 ? 'granted' : 'denied'
    deps.log({ ...audit })
    return json(body, status, extraHeaders)
  }

  if (url.pathname !== '/token') return settle(404, 'no_such_route', { error: 'not_found' })
  if (request.method !== 'POST') return settle(405, 'method_not_allowed', { error: 'method_not_allowed' }, { Allow: 'POST' })

  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
  if (!bearer) {
    return settle(401, 'no_bearer_token', {
      error: 'unauthorized',
      reason: 'no_bearer_token',
      detail: 'send the GitHub Actions OIDC token as `Authorization: Bearer <token>`',
    })
  }

  try {
    parseJwtHeader(bearer)
  } catch (error) {
    const reason = error instanceof TokenRejected ? error.reason : 'malformed'
    return settle(401, reason, { error: 'unauthorized', reason })
  }

  let claims
  try {
    const jwks = await loadJwks(deps.doFetch, deps.nowSeconds())
    claims = await verifyOidcToken(bearer, { jwks, audience: env.OIDC_AUDIENCE, nowSeconds: deps.nowSeconds() })
  } catch (error) {
    if (error instanceof TokenRejected) return settle(401, error.reason, { error: 'unauthorized', reason: error.reason })
    return settle(502, 'jwks_unavailable', { error: 'bad_gateway', reason: 'jwks_unavailable' })
  }
  audit.repository = claims.repository
  audit.owner = claims.repositoryOwner

  try {
    const allowed = await checkRate(env.TOKEN_LIMITER, rateKey(claims.repositoryOwner, claims.repositoryName))
    if (!allowed) {
      return settle(429, 'rate_limited', { error: 'too_many_requests', reason: 'rate_limited' }, { 'Retry-After': '60' })
    }
  } catch (error) {
    if (error instanceof RateLimiterUnavailable) {
      return settle(503, 'rate_limiter_unavailable', { error: 'service_unavailable', reason: 'rate_limiter_unavailable' })
    }
    throw error
  }

  try {
    const key = await importAppKey(await readSecret(env.APP_PRIVATE_KEY))
    const jwt = await appJwt(env.VEGAFACTORY_APP_ID, key, deps.nowSeconds())
    const installationId = await findInstallationId(claims.repositoryOwner, claims.repositoryName, jwt, deps.doFetch)
    audit.installation_id = installationId
    const minted = await mintRepoToken({ installationId, repo: claims.repositoryName, jwt, doFetch: deps.doFetch })
    return settle(200, 'granted', {
      token: minted.token,
      expires_at: minted.expiresAt,
      repository: claims.repository,
      permissions: minted.permissions,
    })
  } catch (error) {
    if (error instanceof NotInstalled) {
      return settle(403, 'not_installed', {
        error: 'forbidden',
        reason: 'not_installed',
        detail: 'the VegaStack Factory App is not installed on this repository',
      })
    }
    if (error instanceof UpstreamFailure) return settle(502, 'upstream_failure', { error: 'bad_gateway', reason: 'upstream_failure' })
    if (error instanceof AppKeyRejected) return settle(500, 'app_key_rejected', { error: 'internal_error', reason: 'app_key_rejected' })
    if (error instanceof PermissionCapViolation) {
      // The minted token is dropped here: it never reaches the caller, the response, or the log.
      return settle(500, 'permission_cap_violation', { error: 'internal_error', reason: 'permission_cap_violation' })
    }
    return settle(500, 'internal_error', { error: 'internal_error' })
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleTokenRequest(request, env, {
      doFetch: fetch,
      nowSeconds: () => Math.floor(Date.now() / 1000),
      log: (record) => console.log(JSON.stringify(record)),
    })
  },
}
