export interface ServerEnv {
  controlRoom: string
  cacheFile: string
  org: string
  repos: string[]
  stateFile: string
  version: string
  viewer: string | null
  token: string | null
  bin: string | null
}

const REQUIRED = ['VEGAFACTORY_CONTROL_ROOM', 'VEGAFACTORY_CACHE', 'VEGAFACTORY_ORG', 'VEGAFACTORY_STATE'] as const

const value = (source: Record<string, string | undefined>, key: string): string | null => {
  const raw = source[key]
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

// The whole contract between `vegafactory dashboard` and this server, in one place. The four
// required variables are the ones with no sane default; the optional four are the live half, and
// their absence degrades the page rather than refusing it — a dashboard with no `gh` token still
// renders every cached view. Nothing here reaches the browser: the token in particular never
// leaves the server process, which is why it is an environment variable and not a cookie.
export function readEnv(source: Record<string, string | undefined>): { ok: true; env: ServerEnv } | { ok: false; missing: string[] } {
  const missing = REQUIRED.filter((key) => value(source, key) === null)
  if (missing.length > 0) return { ok: false, missing }
  return {
    ok: true,
    env: {
      controlRoom: value(source, 'VEGAFACTORY_CONTROL_ROOM')!,
      cacheFile: value(source, 'VEGAFACTORY_CACHE')!,
      org: value(source, 'VEGAFACTORY_ORG')!,
      stateFile: value(source, 'VEGAFACTORY_STATE')!,
      repos: (value(source, 'VEGAFACTORY_REPOS') ?? '').split(',').map((repo) => repo.trim()).filter(Boolean),
      version: value(source, 'VEGAFACTORY_VERSION') ?? '0.0.0',
      viewer: value(source, 'VEGAFACTORY_VIEWER'),
      token: value(source, 'VEGAFACTORY_GH_TOKEN'),
      bin: value(source, 'VEGAFACTORY_BIN'),
    },
  }
}
