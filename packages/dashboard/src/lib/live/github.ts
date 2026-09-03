// Every live read returns a value, never a throw: a page whose GitHub half failed renders the
// offline banner and its cached half, and a reason the reader can act on.
export type Live<T> = { ok: true; data: T } | { ok: false; reason: string }

export interface LiveIssue {
  number: number
  title: string
  updatedAt: string
  url: string
  labels: string[]
  assignees: string[]
}

export interface LivePull {
  number: number
  title: string
  url: string
  draft: boolean
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

interface LiveInput {
  repo: string
  token: string | null
  fetchImpl?: FetchImpl
}

const API = 'https://api.github.com'

// The token travels in the Authorization header and nowhere else — never a query parameter,
// which would land in the browser's history, any proxy's log, and GitHub's own request log.
async function get(path: string, input: LiveInput): Promise<Live<unknown>> {
  const call = input.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init))
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
  if (input.token) headers.authorization = `Bearer ${input.token}`
  let response: Response
  try {
    response = await call(`${API}${path}`, { headers, cache: 'no-store' })
  } catch (error) {
    return { ok: false, reason: `GitHub was unreachable for ${input.repo}: ${(error as Error).message}` }
  }
  if (!response.ok) return { ok: false, reason: `GitHub returned HTTP ${response.status} for ${input.repo}` }
  try {
    return { ok: true, data: await response.json() }
  } catch {
    return { ok: false, reason: `GitHub returned an unreadable body for ${input.repo}` }
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const names = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry : text((entry as Record<string, unknown> | null)?.name ?? (entry as Record<string, unknown> | null)?.login)))
    .filter((name) => name !== '')
}

export async function fetchOpenIssues(input: LiveInput): Promise<Live<LiveIssue[]>> {
  const result = await get(`/repos/${input.repo}/issues?state=open&per_page=100`, input)
  if (!result.ok) return result
  if (!Array.isArray(result.data)) return { ok: false, reason: `GitHub returned no issue list for ${input.repo}` }
  const issues: LiveIssue[] = []
  for (const entry of result.data) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    // The issues endpoint returns pull requests too; a PR carries `pull_request` and belongs on
    // the board's PR row, not in a state column.
    if (row.pull_request) continue
    if (typeof row.number !== 'number') continue
    issues.push({
      number: row.number,
      title: text(row.title),
      labels: names(row.labels),
      assignees: names(row.assignees),
      updatedAt: text(row.updated_at),
      url: text(row.html_url),
    })
  }
  return { ok: true, data: issues }
}

export async function fetchOpenPulls(input: LiveInput): Promise<Live<LivePull[]>> {
  const result = await get(`/repos/${input.repo}/pulls?state=open&per_page=100`, input)
  if (!result.ok) return result
  if (!Array.isArray(result.data)) return { ok: false, reason: `GitHub returned no pull list for ${input.repo}` }
  const pulls: LivePull[] = []
  for (const entry of result.data) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    if (typeof row.number !== 'number') continue
    pulls.push({ number: row.number, title: text(row.title), url: text(row.html_url), draft: row.draft === true })
  }
  return { ok: true, data: pulls }
}
