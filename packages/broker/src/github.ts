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
