import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { fetchOpenIssues } from '../src/lib/live/github'
import { readStatus } from '../src/lib/live/status'

test('projects open issues, drops pull requests, and sends the token only in the header', async () => {
  let seen: Request | null = null
  const row = { updated_at: '2026-09-03T10:00:00Z', assignees: [] }
  const out = await fetchOpenIssues({
    repo: 'vegastack/vegafactory', token: 'gho_secret',
    fetchImpl: async (input, init) => {
      seen = new Request(input as string, init)
      return new Response(JSON.stringify([
        { ...row, number: 122, title: 'dashboard', labels: [{ name: 'needs-plan' }], html_url: 'https://x/122' },
        { ...row, number: 9, title: 'a pr', pull_request: {}, labels: [], html_url: 'https://x/9' },
      ]), { status: 200 })
    },
  })
  expect(out).toEqual({ ok: true, data: [{ number: 122, title: 'dashboard', labels: ['needs-plan'], assignees: [], updatedAt: row.updated_at, url: 'https://x/122' }] })
  expect(seen!.url).not.toContain('gho_secret')
  expect(seen!.headers.get('authorization')).toBe('Bearer gho_secret')
})

test('every failure is a reason: an HTTP error, a thrown fetch, a missing or failing bin', async () => {
  expect(await fetchOpenIssues({ repo: 'a/b', token: 't', fetchImpl: async () => new Response('nope', { status: 503 }) }))
    .toEqual({ ok: false, reason: 'GitHub returned HTTP 503 for a/b' })
  expect((await fetchOpenIssues({ repo: 'a/b', token: 't', fetchImpl: async () => { throw new Error('offline') } })).ok).toBe(false)
  const ok = await readStatus({ bin: join(import.meta.dirname, 'fixtures', 'status-stub.mjs') })
  expect(ok.ok && ok.data.repos[0]!.board.ready).toBe(2)
  expect(await readStatus({ bin: null })).toEqual({ ok: false, reason: 'no vegafactory binary was passed to the dashboard' })
  expect((await readStatus({ bin: join(import.meta.dirname, 'fixtures', 'absent.mjs') })).ok).toBe(false)
})
