// The broker's only outbound call site. Every subrequest the Worker makes goes through here, so
// the allowlist is a property of the code rather than a convention someone has to remember.
//
// The match is exact-host, never a suffix: `api.github.com.evil.test` ends with `api.github.com`
// and is refused. `https:` only, and `redirect: 'error'` so a 3xx from either host can never walk
// the request off the allowlist.

export const ALLOWED_HOSTS = ['api.github.com', 'token.actions.githubusercontent.com'] as const

export class EgressRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EgressRefused'
  }
}

export type CfInit = RequestInit & { cf?: Record<string, unknown> }

export async function allowedFetch(url: string, init: CfInit = {}, doFetch: typeof fetch = fetch): Promise<Response> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new EgressRefused('egress refused: not a URL')
  }
  if (parsed.protocol !== 'https:') throw new EgressRefused(`egress refused: ${parsed.protocol} is not https:`)
  if (!(ALLOWED_HOSTS as readonly string[]).includes(parsed.hostname)) {
    throw new EgressRefused(`egress refused: ${parsed.hostname} is not an allowed host`)
  }
  return await doFetch(parsed.toString(), { ...init, redirect: 'error' } as RequestInit)
}
