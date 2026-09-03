// GitHub Actions OIDC verification. Nothing here trusts the request body: the repository a caller
// eventually receives a token for is read from the *signed* `repository` and `repository_owner`
// claims and from nowhere else, which is the whole of the broker's tenancy model.
//
// The signing keys are GitHub's public JWKS document, cached twice and cheaply: a module-scope memo
// inside the isolate, and the Cloudflare edge, because the subrequest carries
// `cf: { cacheTtl: 3600, cacheEverything: true }` (a JSON body is not a default-cached type, so the
// hint is what makes the edge hold it). Both caches are per-Cloudflare-location — the same reach a
// KV read had — and a miss costs one HTTPS call to a public endpoint, so the broker needs no store.

import { allowedFetch } from './egress.ts'

export const ISSUER = 'https://token.actions.githubusercontent.com'
export const JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks'
const JWKS_TTL_SECONDS = 3600
const DEFAULT_SKEW_SECONDS = 60

export type RejectionReason =
  | 'malformed'
  | 'alg'
  | 'kid'
  | 'signature'
  | 'issuer'
  | 'audience'
  | 'expired'
  | 'not_yet_valid'
  | 'claims'

export class TokenRejected extends Error {
  readonly reason: string
  constructor(reason: RejectionReason, detail: string) {
    super(`token rejected (${reason}): ${detail}`)
    this.name = 'TokenRejected'
    this.reason = reason
  }
}

export interface OidcClaims {
  repository: string
  repositoryOwner: string
  repositoryName: string
}

export interface Jwks {
  keys: JsonWebKey[]
}

function decodeSegment(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function decodeJson(segment: string, what: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(decodeSegment(segment)))
  } catch {
    throw new TokenRejected('malformed', `${what} is not base64url JSON`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TokenRejected('malformed', `${what} is not a JSON object`)
  }
  return parsed as Record<string, unknown>
}

// Structural parse only: three segments, RS256, a kid. The handler runs this before it fetches
// anything, so a malformed or unusable bearer token is a 401 that costs no subrequest.
export function parseJwtHeader(token: string): { kid: string } {
  const parts = token.split('.')
  if (parts.length !== 3) throw new TokenRejected('malformed', 'a JWT has three segments')
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string]
  if (!headerSegment || !payloadSegment || !signatureSegment) throw new TokenRejected('malformed', 'an empty segment')
  const header = decodeJson(headerSegment, 'the header')
  if (header.alg !== 'RS256') throw new TokenRejected('alg', 'only RS256 is accepted')
  const kid = header.kid
  if (typeof kid !== 'string' || kid.length === 0) throw new TokenRejected('kid', 'the header carries no kid')
  return { kid }
}

export async function verifyOidcToken(
  token: string,
  options: { jwks: Jwks; audience: string; nowSeconds: number; skewSeconds?: number },
): Promise<OidcClaims> {
  const skew = options.skewSeconds ?? DEFAULT_SKEW_SECONDS
  const parts = token.split('.')
  if (parts.length !== 3) throw new TokenRejected('malformed', 'a JWT has three segments')
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string]
  if (!headerSegment || !payloadSegment || !signatureSegment) throw new TokenRejected('malformed', 'an empty segment')

  const header = decodeJson(headerSegment, 'the header')
  if (header.alg !== 'RS256') throw new TokenRejected('alg', 'only RS256 is accepted')
  const kid = header.kid
  if (typeof kid !== 'string' || kid.length === 0) throw new TokenRejected('kid', 'the header carries no kid')

  const jwk = options.jwks.keys.find((key) => (key as { kid?: unknown }).kid === kid)
  if (!jwk) throw new TokenRejected('kid', 'no signing key matches the kid')

  let publicKey: CryptoKey
  try {
    publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  } catch {
    throw new TokenRejected('kid', 'the signing key could not be imported')
  }

  let signatureOk = false
  try {
    signatureOk = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      decodeSegment(signatureSegment),
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    )
  } catch {
    signatureOk = false
  }
  if (!signatureOk) throw new TokenRejected('signature', 'the signature does not verify')

  const payload = decodeJson(payloadSegment, 'the payload')
  if (payload.iss !== ISSUER) throw new TokenRejected('issuer', 'the issuer is not GitHub Actions OIDC')
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(options.audience)) throw new TokenRejected('audience', 'the audience is not this broker')

  const exp = payload.exp
  const nbf = payload.nbf
  if (typeof exp !== 'number') throw new TokenRejected('expired', 'the token carries no exp')
  if (exp + skew < options.nowSeconds) throw new TokenRejected('expired', 'the token has expired')
  if (typeof nbf === 'number' && nbf - skew > options.nowSeconds) throw new TokenRejected('not_yet_valid', 'the token is not valid yet')

  const repository = payload.repository
  const repositoryOwner = payload.repository_owner
  if (typeof repository !== 'string' || repository.length === 0) throw new TokenRejected('claims', 'the repository claim is missing')
  if (typeof repositoryOwner !== 'string' || repositoryOwner.length === 0) {
    throw new TokenRejected('claims', 'the repository_owner claim is missing')
  }
  const prefix = `${repositoryOwner}/`
  if (!repository.startsWith(prefix)) throw new TokenRejected('claims', 'the repository claim does not sit under repository_owner')
  const repositoryName = repository.slice(prefix.length)
  if (repositoryName.length === 0 || repositoryName.includes('/')) throw new TokenRejected('claims', 'the repository name is not a single segment')

  return { repository, repositoryOwner, repositoryName }
}

let memo: { document: Jwks; expiresAtSeconds: number } | undefined

export async function loadJwks(doFetch: typeof fetch, nowSeconds: number): Promise<Jwks> {
  if (memo && nowSeconds < memo.expiresAtSeconds) return memo.document
  const response = await allowedFetch(JWKS_URL, { cf: { cacheTtl: JWKS_TTL_SECONDS, cacheEverything: true } }, doFetch)
  if (!response.ok) throw new Error(`the JWKS document could not be fetched (HTTP ${response.status})`)
  const body = (await response.json()) as { keys?: unknown }
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error('the JWKS document carries no keys')
  const document: Jwks = { keys: body.keys as JsonWebKey[] }
  // A failed fetch above throws before this line, so an outage leaves the previous memo in place
  // and costs nothing until its hour lapses.
  memo = { document, expiresAtSeconds: nowSeconds + JWKS_TTL_SECONDS }
  return document
}
