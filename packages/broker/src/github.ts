// Everything the broker says to GitHub: the App JWT it authenticates with, the installation lookup
// that decides whether a repository is allowed at all, and (below) the capped token mint.
//
// Two rules hold throughout. The App private key never leaves this module as a string — it arrives
// from the Secrets Store binding, is imported into a non-extractable CryptoKey, and only signatures
// leave. And no error message ever carries a credential: a failing call reports a status, never the
// JWT it sent or the token it received.

import { allowedFetch } from './egress.ts'

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'vegafactory-token-broker',
} as const

const PKCS8_HEADER = '-----BEGIN PRIVATE KEY-----'
const PKCS8_ADVICE =
  'the App key must be PKCS#8 — convert it with: openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app.pkcs8.pem'

export class AppKeyRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppKeyRejected'
  }
}

export class NotInstalled extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotInstalled'
  }
}

export class UpstreamFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamFailure'
  }
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function importAppKey(pem: string): Promise<CryptoKey> {
  const trimmed = pem.trim()
  if (!trimmed.startsWith(PKCS8_HEADER)) throw new AppKeyRejected(PKCS8_ADVICE)
  const body = trimmed
    .replace(PKCS8_HEADER, '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  let der: Uint8Array<ArrayBuffer>
  try {
    const binary = atob(body)
    der = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index += 1) der[index] = binary.charCodeAt(index)
  } catch {
    throw new AppKeyRejected('the App key is not valid base64 — ' + PKCS8_ADVICE)
  }
  try {
    return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  } catch {
    throw new AppKeyRejected('the App key could not be imported — ' + PKCS8_ADVICE)
  }
}

// GitHub allows a 10-minute App JWT; 9 minutes with a 60-second backdate stays inside that even
// with clock drift on either side.
export async function appJwt(appId: string, key: CryptoKey, nowSeconds: number): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = base64url(
    new TextEncoder().encode(JSON.stringify({ iss: appId, iat: nowSeconds - 60, exp: nowSeconds + 540 })),
  )
  const input = `${header}.${payload}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
  return `${input}.${base64url(new Uint8Array(signature))}`
}

export async function findInstallationId(
  owner: string,
  repo: string,
  jwt: string,
  doFetch: typeof fetch,
): Promise<number> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`
  const response = await allowedFetch(url, { method: 'GET', headers: { ...API_HEADERS, Authorization: `Bearer ${jwt}` } }, doFetch)
  if (response.status === 404) throw new NotInstalled('the VegaStack Factory App is not installed on this repository')
  if (response.status !== 200) throw new UpstreamFailure(`the installation lookup failed (HTTP ${response.status})`)
  const body = (await response.json().catch(() => null)) as { id?: unknown } | null
  const id = body?.id
  if (typeof id !== 'number' || !Number.isInteger(id)) throw new UpstreamFailure('the installation lookup returned no installation id')
  return id
}

// The permission cap, and the only place it is written. The mint asks for exactly these three
// permissions on exactly one repository, and the response's own echo is compared to the same
// constant before a token is ever returned — so a widening on GitHub's side is a refusal here
// rather than a broader token in a customer's workflow.
export const CAPPED_PERMISSIONS: Readonly<Record<string, string>> = Object.freeze({
  issues: 'write',
  metadata: 'read',
  organization_projects: 'write',
})

export class PermissionCapViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionCapViolation'
  }
}

export function permissionsMatchCap(echo: unknown): boolean {
  if (typeof echo !== 'object' || echo === null || Array.isArray(echo)) return false
  const actual = echo as Record<string, unknown>
  const expectedKeys = Object.keys(CAPPED_PERMISSIONS)
  const actualKeys = Object.keys(actual)
  if (actualKeys.length !== expectedKeys.length) return false
  return expectedKeys.every((key) => actual[key] === CAPPED_PERMISSIONS[key])
}

function offendingKeys(echo: unknown): string[] {
  if (typeof echo !== 'object' || echo === null || Array.isArray(echo)) return ['<not an object>']
  const actual = echo as Record<string, unknown>
  const keys = new Set([...Object.keys(CAPPED_PERMISSIONS), ...Object.keys(actual)])
  return [...keys].filter((key) => actual[key] !== CAPPED_PERMISSIONS[key]).sort()
}

export async function mintRepoToken(args: {
  installationId: number
  repo: string
  jwt: string
  doFetch: typeof fetch
}): Promise<{ token: string; expiresAt: string; permissions: Record<string, string> }> {
  const url = `https://api.github.com/app/installations/${encodeURIComponent(String(args.installationId))}/access_tokens`
  const response = await allowedFetch(
    url,
    {
      method: 'POST',
      headers: { ...API_HEADERS, Authorization: `Bearer ${args.jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositories: [args.repo], permissions: CAPPED_PERMISSIONS }),
    },
    args.doFetch,
  )
  if (response.status !== 201) throw new UpstreamFailure(`the token mint failed (HTTP ${response.status})`)
  const body = (await response.json().catch(() => null)) as
    | { token?: unknown; expires_at?: unknown; permissions?: unknown }
    | null
  const token = body?.token
  const expiresAt = body?.expires_at
  if (typeof token !== 'string' || token.length === 0) throw new UpstreamFailure('the token mint returned no token')
  if (typeof expiresAt !== 'string' || expiresAt.length === 0) throw new UpstreamFailure('the token mint returned no expiry')
  if (!permissionsMatchCap(body?.permissions)) {
    // The token is discarded here and never reaches the caller or a log line.
    throw new PermissionCapViolation(`the minted token exceeds the cap on: ${offendingKeys(body?.permissions).join(', ')}`)
  }
  return { token, expiresAt, permissions: body?.permissions as Record<string, string> }
}
